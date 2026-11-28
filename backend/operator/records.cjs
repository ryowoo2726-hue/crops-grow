const eventDate = '2026-11-30';
const prizes = [
  { minimum: 15, name: '빼빼로' },
  { minimum: 10, name: '과일 젤리' },
  { minimum: 5, name: '뻥튀기' },
];

const eligiblePrize = count => prizes.find(prize => count >= prize.minimum)?.name;
const classLabel = ({grade, classNo}) => `${grade}학년 ${classNo}반`;
const participantLabel = person => person.name || `${person.number}번`;
const participantDetails = person => person.role === 'teacher'
  ? '선생님'
  : `${classLabel(person)} ${person.number}번`;

function createRecords(db, now) {
  db.exec(`
    PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS prize_pickups (
      id INTEGER PRIMARY KEY,
      event_date TEXT NOT NULL,
      participant_key TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student','teacher')),
      name TEXT NOT NULL,
      grade INTEGER,
      class_no INTEGER,
      number INTEGER,
      harvest_count INTEGER NOT NULL CHECK(harvest_count >= 5),
      prize TEXT NOT NULL,
      received_at TEXT NOT NULL,
      UNIQUE(event_date,participant_key)
    ) STRICT;
  `);

  const dailySubmissions = `
      SELECT player_id,subject,set_id,json_extract(result_json,'$.correctCount') correct,
        json_array_length(questions_json) total
      FROM quiz_runs WHERE result_json IS NOT NULL
  `;
  const specialSubmissions = `
      SELECT player_id,campaign_id,json_extract(result_json,'$.correctCount') correct,
        COALESCE(json_array_length(result_json,'$.questions'),json_array_length(result_json,'$.answers')) total
      FROM special_quiz_results
  `;
  const validScore = 'total>0 AND correct BETWEEN 0 AND total';
  const students = db.prepare(`
    WITH submitted AS (${dailySubmissions}), daily AS (
      SELECT player_id,SUM(correct) correct,SUM(total) total FROM submitted
      WHERE ${validScore} GROUP BY player_id
    ), graded AS (${specialSubmissions}), special AS (
      SELECT player_id,SUM(correct) correct,SUM(total) total FROM graded
      WHERE ${validScore} GROUP BY player_id
    )
    SELECT p.grade,p.class_no classNo,p.number,COALESCE(r.name,p.name) name,
      (SELECT COUNT(*) FROM harvests h WHERE h.player_id=p.id) harvestCount,
      COALESCE(d.correct,0) dailyCorrect,COALESCE(d.total,0) dailyTotal,
      COALESCE(s.correct,0) specialCorrect,COALESCE(s.total,0) specialTotal
    FROM players p LEFT JOIN student_roster r USING(grade,class_no,number)
    LEFT JOIN daily d ON d.player_id=p.id LEFT JOIN special s ON s.player_id=p.id
    WHERE p.role='student' ORDER BY p.grade,p.class_no,p.number
  `);

  const reportClasses = db.prepare(`SELECT DISTINCT class_no classNo FROM players
    WHERE role='student' AND ($grade=0 OR grade=$grade) ORDER BY class_no`);
  const scopedStudents = `SELECT id FROM players WHERE role='student'
    AND ($grade=0 OR grade=$grade) AND ($classNo=0 OR class_no=$classNo)`;
  const dailyReport = `WITH submissions AS (${dailySubmissions}),
    scoped AS (${scopedStudents})
    SELECT r.subject,COUNT(*) submissions,COUNT(DISTINCT r.player_id) students,
      SUM(r.correct) correct,SUM(r.total) total`;
  const subjects = db.prepare(`${dailyReport}
    FROM submissions r JOIN scoped p ON p.id=r.player_id
    WHERE ${validScore} GROUP BY r.subject`);
  const sets = db.prepare(`${dailyReport},s.title
    FROM submissions r JOIN scoped p ON p.id=r.player_id JOIN quiz_sets s ON s.id=r.set_id
    WHERE r.subject=$subject AND ${validScore}
    GROUP BY s.id ORDER BY SUM(r.correct)*1.0/SUM(r.total),s.id`);
  const rounds = db.prepare(`WITH submissions AS (${specialSubmissions}),
    scoped AS (${scopedStudents}), totals AS (
      SELECT campaign_id,COUNT(*) students,SUM(correct) correct,SUM(total) total
      FROM submissions r JOIN scoped p ON p.id=r.player_id
      WHERE ${validScore} GROUP BY campaign_id
    )
    SELECT c.id,c.title,c.created_at startedAt,COALESCE(t.students,0) students,
      COALESCE(t.correct,0) correct,COALESCE(t.total,0) total
    FROM special_campaigns c LEFT JOIN totals t ON t.campaign_id=c.id
    WHERE c.kind IN ('patriots','farmers','student-independence') ORDER BY c.id DESC`);

  function quizReport(grade,classNo,subject) {
    const scope = {$grade:grade,$classNo:classNo};
    db.exec('BEGIN');
    try {
      const result = {
        classNumbers: reportClasses.all({$grade:grade}).map(row=>row.classNo),
        subjects: subjects.all(scope),
        sets: sets.all({...scope,$subject:subject}),
        rounds: rounds.all(scope),
        generatedAt: now(),
      };
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  const keyOf = person => person.role === 'teacher'
    ? `teacher:${person.name}`
    : `student:${person.grade}:${person.classNo}:${person.number}`;
  const detailsQuery = `
    SELECT p.id,p.role,p.grade,p.class_no classNo,p.number,COALESCE(r.name,p.name) name,
      (SELECT COUNT(*) FROM harvests h WHERE h.player_id=p.id) harvestCount
    FROM players p LEFT JOIN student_roster r USING(grade,class_no,number)
  `;
  const personById = db.prepare(detailsQuery + ' WHERE p.id=?');
  const people = db.prepare(detailsQuery + `
    UNION ALL SELECT NULL,'student',r.grade,r.class_no,r.number,r.name,0
    FROM student_roster r WHERE NOT EXISTS (
      SELECT 1 FROM players p WHERE p.grade=r.grade AND p.class_no=r.class_no AND p.number=r.number
    )
    ORDER BY role,grade,classNo,number,name
  `);
  const receiptColumns = 'id,role,name,grade,class_no classNo,number,harvest_count harvestCount,prize,received_at receivedAt';
  const receipts = db.prepare(`SELECT ${receiptColumns} FROM prize_pickups WHERE event_date=? ORDER BY id DESC LIMIT ? OFFSET ?`);
  const receiptCount = db.prepare('SELECT COUNT(*) total FROM prize_pickups WHERE event_date=?');
  const receiptFor = db.prepare(`SELECT ${receiptColumns} FROM prize_pickups WHERE event_date=? AND participant_key=?`);
  const receiptById = db.prepare(`SELECT ${receiptColumns} FROM prize_pickups WHERE event_date=? AND id=?`);
  const savePickup = db.prepare(`
    INSERT INTO prize_pickups(event_date,participant_key,role,name,grade,class_no,number,harvest_count,prize,received_at)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(event_date,participant_key) DO NOTHING
  `);

  function withPickup(person) {
    return { ...person, key: keyOf(person), receipt: receiptFor.get(eventDate,keyOf(person)), prize: eligiblePrize(person.harvestCount) };
  }

  function search(query, role) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return { people: [], total: 0 };
    const matches = people.all().filter(person => {
      if (role && person.role !== role) return false;
      const identity = `${person.name} ${participantDetails(person)} ${person.grade}-${person.classNo}-${person.number}`.toLowerCase();
      return terms.every(term => identity.includes(term));
    });
    return { people: matches.slice(0,30).map(withPickup), total: matches.length };
  }

  function redeem(id, expectedKey) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const person = personById.get(id);
      if (!person) {
        db.exec('COMMIT');
        return { status: 404, message: '참여 기록을 찾을 수 없습니다.' };
      }
      const key = keyOf(person);
      if (key !== expectedKey) {
        db.exec('COMMIT');
        return { status: 409, message: '참여 정보가 바뀌었습니다. 다시 검색해 주세요.' };
      }
      const existing = receiptFor.get(eventDate,key);
      if (existing) {
        db.exec('COMMIT');
        return { receipt: existing };
      }
      const prize = eligiblePrize(person.harvestCount);
      if (!prize) {
        db.exec('COMMIT');
        return { status: 409, message: '수확 기록을 다시 확인했습니다. 작물 5개부터 수령할 수 있습니다.' };
      }
      savePickup.run(eventDate,key,person.role,person.name,person.grade,person.classNo,person.number,
        person.harvestCount,prize,new Date(now()).toISOString());
      const receipt = receiptFor.get(eventDate,key);
      db.exec('COMMIT');
      return { receipt };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    students: () => students.all(),
    quizReport,
    search,
    person: id => {
      const person = personById.get(id);
      return person ? withPickup(person) : null;
    },
    redeem,
    receipt: id => receiptById.get(eventDate,id),
    receiptCount: () => receiptCount.get(eventDate).total,
    receipts: (limit, offset) => receipts.all(eventDate,limit,offset),
  };
}

module.exports = {createRecords,prizes,classLabel,participantDetails,participantLabel};
