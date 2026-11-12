const {DatabaseSync} = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {promisify} = require('node:util');
const scrypt = promisify(crypto.scrypt);
const crops = new Set(['rice','sweet-potato','soybean','radish','napa-cabbage','apple','persimmon','peach','watermelon','chili-pepper','mango']);
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new ApiError(status, message); };
const dayAt = time => new Date(time + 9 * 3600000).toISOString().slice(0, 10);
function weekAt(time) {
  const date = new Date(dayAt(time) + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}
function validWeek(week) {
  return typeof week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(week) &&
    Number.isFinite(Date.parse(week)) && weekAt(Date.parse(week)) === week;
}
function openStore(directory, {now = Date.now, dailyLimit = false} = {}) {
  fs.mkdirSync(directory, {recursive:true});
  const db = new DatabaseSync(path.join(directory, 'growgame.sqlite'));
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 1) { db.close(); throw Error('이 서버보다 새로운 DB입니다. 서버를 업데이트하세요.'); }
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
  db.prepare('DELETE FROM action_receipts WHERE created_at < ?').run(now() - 7 * 86400000);
  const getPlayer = id => db.prepare('SELECT * FROM players WHERE id=?').get(id);
  function snapshot(id) {
    const p = getPlayer(id);
    const counts = db.prepare('SELECT crop_id, COUNT(*) count FROM harvests WHERE player_id=? GROUP BY crop_id').all(id);
    return {profile:{grade:p.grade,classNo:p.class_no,number:p.number}, cropId:p.crop_id, progress:p.progress,
      dailyMode:dailyLimit, waterDay:p.water_day, missionDay:p.mission_day, revision:p.revision,
      harvests:[], harvestCount:counts.reduce((n,c)=>n+c.count,0), collectionCounts:Object.fromEntries(counts.map(c=>[c.crop_id,c.count]))};
  }
  async function login(profile, pin) {
    if (!profile || !Number.isInteger(profile.grade) || profile.grade<1 || profile.grade>3 ||
        !Number.isInteger(profile.classNo) || profile.classNo<1 || profile.classNo>10 ||
        !Number.isInteger(profile.number) || profile.number<1 || profile.number>30 || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) fail(400,'참여 정보와 숫자 4자리 비밀번호를 확인해 주세요.');
    const find = () => db.prepare('SELECT * FROM players WHERE grade=? AND class_no=? AND number=?').get(profile.grade,profile.classNo,profile.number);
    let p = find();
    if (p?.locked_until > now()) fail(429,'비밀번호를 여러 번 틀렸어요. 15분 뒤 다시 시도해 주세요.');
    if (!p) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = (await scrypt(pin, salt, 32)).toString('hex');
      // 해시 계산 중 다른 요청이 같은 번호를 등록했다면 기존 비밀번호를 검증합니다.
      db.prepare('INSERT OR IGNORE INTO players(grade,class_no,number,pin_salt,pin_hash) VALUES(?,?,?,?,?)').run(profile.grade,profile.classNo,profile.number,salt,hash);
      p = find();
    }
    const authenticatedSalt = p.pin_salt;
    const actual = await scrypt(pin, authenticatedSalt, 32);
    p = getPlayer(p.id);
    if (!p || p.pin_salt !== authenticatedSalt) fail(401,'학생 정보가 변경되었어요. 다시 입장해 주세요.');
    if (p.locked_until > now()) fail(429,'15분 뒤 다시 시도해 주세요.');
    if (!crypto.timingSafeEqual(actual,Buffer.from(p.pin_hash,'hex'))) {
      const attempts = p.failed_attempts + 1;
      db.prepare('UPDATE players SET failed_attempts=?,locked_until=? WHERE id=?').run(attempts>=5?0:attempts,attempts>=5?now()+15*60000:0,p.id);
      fail(401,'비밀번호가 맞지 않아요.');
    }
    db.prepare('UPDATE players SET failed_attempts=0,locked_until=0 WHERE id=?').run(p.id);
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
    const token = crypto.randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),p.id,now()+8*3600000);
    return {token,state:snapshot(p.id)};
  }
  function authenticate(token) {
    if (!token || token.length>200) fail(401,'다시 입장해 주세요.');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const session = db.prepare('SELECT player_id FROM sessions WHERE token_hash=? AND expires_at>?').get(hash,now());
    if (!session) fail(401,'다시 입장해 주세요.');
    return session.player_id;
  }
  async function resetPin(profile, pin) {
    if (!profile || ![profile.grade,profile.classNo,profile.number].every(Number.isInteger) || typeof pin!=='string' || !/^\d{4}$/.test(pin)) fail(400,'참여 정보와 4자리 PIN을 확인하세요.');
    const player=db.prepare('SELECT id,pin_salt FROM players WHERE grade=? AND class_no=? AND number=?').get(profile.grade,profile.classNo,profile.number);
    if(!player) fail(404,'등록된 학생이 아닙니다.');
    const salt=crypto.randomBytes(16).toString('hex');
    const hash=(await scrypt(pin,salt,32)).toString('hex');
    db.exec('BEGIN IMMEDIATE');
    try {
      if (getPlayer(player.id)?.pin_salt !== player.pin_salt) fail(409,'학생 정보가 변경되었습니다. 목록을 새로고침하세요.');
      db.prepare('UPDATE players SET pin_salt=?,pin_hash=?,failed_attempts=0,locked_until=0 WHERE id=?').run(salt,hash,player.id);
      db.prepare('DELETE FROM sessions WHERE player_id=?').run(player.id);
      db.exec('COMMIT');
    } catch(error) { db.exec('ROLLBACK'); throw error; }
  }
  function deleteStudent(profile) {
    if (!profile || !Number.isInteger(profile.grade) || profile.grade<1 || profile.grade>3 ||
        !Number.isInteger(profile.classNo) || profile.classNo<1 || profile.classNo>10 ||
        !Number.isInteger(profile.number) || profile.number<1 || profile.number>30) fail(400,'삭제할 학생의 학년·반·번호를 확인하세요.');
    db.exec('BEGIN IMMEDIATE');
    try {
      const player=db.prepare('SELECT id FROM players WHERE grade=? AND class_no=? AND number=?').get(profile.grade,profile.classNo,profile.number);
      if (!player) fail(404,'등록된 학생이 아닙니다.');
      for (const table of ['sessions','harvests','quiz_answers','action_receipts']) {
        db.prepare(`DELETE FROM ${table} WHERE player_id=?`).run(player.id);
      }
      db.prepare('DELETE FROM players WHERE id=?').run(player.id);
      db.exec('COMMIT');
    } catch(error) { db.exec('ROLLBACK'); throw error; }
  }
  function quiz() {
    const week = weekAt(now());
    const row = db.prepare('SELECT revision FROM quiz_weeks WHERE week=?').get(week);
    const questions = db.prepare('SELECT id,question,choice_a,choice_b,choice_c,choice_d FROM quiz_questions WHERE week=? ORDER BY position').all(week);
    return {week,revision:row?.revision||0,questions:questions.map(q=>({id:q.id,question:q.question,choices:[q.choice_a,q.choice_b,q.choice_c,q.choice_d]}))};
  }
  function checkAnswer(playerId, input) {
    const current = quiz();
    if (!Number.isInteger(input.answerIndex) || input.answerIndex<0 || input.answerIndex>3 || !Number.isInteger(input.questionId)) fail(400,'보기 네 개 중 하나를 선택해 주세요.');
    if (input.week !== current.week || input.revision !== current.revision) fail(409,'퀴즈가 변경되었어요. 팝업을 다시 열어 주세요.');
    const q = db.prepare('SELECT * FROM quiz_questions WHERE id=? AND week=?').get(input.questionId,current.week);
    if (!q) fail(404,'문제를 찾을 수 없어요.');
    const correct = input.answerIndex===q.correct_index;
    if (correct) db.prepare('INSERT OR IGNORE INTO quiz_answers VALUES(?,?,?,?)').run(playerId,current.week,current.revision,q.id);
    return {correct,explanation:correct?q.explanation:''};
  }
  const special = () => db.prepare('SELECT week,title,description,revision FROM special_missions WHERE week=?').get(weekAt(now())) || null;
  function action(playerId, input) {
    if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestId)) fail(400,'요청 번호가 올바르지 않아요.');
    const fingerprint = JSON.stringify([input.kind,input.cropId??null,input.missionRevision??null]);
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous = db.prepare('SELECT * FROM action_receipts WHERE player_id=? AND request_id=?').get(playerId,input.requestId);
      if (previous) {
        if (previous.fingerprint!==fingerprint) fail(409,'같은 요청 번호를 다른 행동에 사용할 수 없어요.');
        db.exec('COMMIT'); return {state:snapshot(playerId),...JSON.parse(previous.outcome)};
      }
      const p = getPlayer(playerId), day = dayAt(now());
      let outcome = {};
      if (input.kind==='plant') {
        if (p.crop_id!==null || !crops.has(input.cropId)) fail(409,'심을 수 있는 작물을 선택해 주세요.');
        db.prepare('UPDATE players SET crop_id=?,progress=0,revision=revision+1 WHERE id=?').run(input.cropId,playerId);
      } else if (input.kind==='harvest') {
        if (!p.crop_id || p.progress<100) fail(409,'작물이 다 자라면 수확할 수 있어요.');
        const at = new Date(now()).toISOString();
        const inserted = db.prepare('INSERT INTO harvests(player_id,crop_id,created_at) VALUES(?,?,?)').run(playerId,p.crop_id,at);
        outcome = {harvest:{id:String(inserted.lastInsertRowid),cropId:p.crop_id,at}};
        db.prepare('UPDATE players SET crop_id=NULL,progress=0,revision=revision+1 WHERE id=?').run(playerId);
      } else {
        if (!['water','quiz','special'].includes(input.kind)) fail(400,'올바른 행동을 선택해 주세요.');
        if (!p.crop_id || p.progress>=100) fail(409,'현재는 성장시킬 수 없어요.');
        const field = input.kind==='water'?'water_day':'mission_day';
        if (dailyLimit && p[field]===day) fail(409,'오늘 보상은 이미 받았어요.');
        if (input.kind==='quiz') {
          const q = quiz();
          const solved = db.prepare('SELECT COUNT(*) count FROM quiz_answers WHERE player_id=? AND week=? AND revision=?').get(playerId,q.week,q.revision).count;
          if (!q.questions.length || solved!==q.questions.length || input.missionRevision!==q.revision) fail(409,'이번 주 퀴즈를 모두 맞혀 주세요.');
        }
        if (input.kind==='special') {
          const mission = special();
          if (!mission || mission.revision!==input.missionRevision) fail(409,'특별 미션이 변경되었어요. 다시 확인해 주세요.');
        }
        db.prepare(`UPDATE players SET progress=MIN(100,progress+?),${field}=?,revision=revision+1 WHERE id=?`).run(input.kind==='water'?50:30,day,playerId);
      }
      db.prepare('INSERT INTO action_receipts VALUES(?,?,?,?,?)').run(playerId,input.requestId,fingerprint,JSON.stringify(outcome),now());
      db.exec('COMMIT'); return {state:snapshot(playerId),...outcome};
    } catch(error) { db.exec('ROLLBACK'); throw error; }
  }
  function garden(playerId, page) {
    if (!Number.isInteger(page) || page<0 || page>100000) fail(400,'페이지를 확인해 주세요.');
    const p = getPlayer(playerId);
    const filter = 'FROM harvests h JOIN players p ON p.id=h.player_id WHERE p.grade=? AND p.class_no=?';
    const total = db.prepare('SELECT COUNT(*) count '+filter).get(p.grade,p.class_no).count;
    const pages = Math.max(1,Math.ceil(total/9)); page = Math.min(page,pages-1);
    const items = db.prepare('SELECT h.id,h.crop_id cropId,h.created_at at '+filter+' ORDER BY h.id LIMIT 9 OFFSET ?').all(p.grade,p.class_no,page*9);
    return {items,total,pages,page};
  }
  function importQuiz(input) {
    if (!input || !validWeek(input.week) || !Array.isArray(input.questions) || !input.questions.length || input.questions.length>20) fail(400,'월요일 날짜와 1~20개 문제를 입력하세요.');
    for (const q of input.questions) {
      if (!q || typeof q.question!=='string' || !q.question.trim() || q.question.length>500 ||
          !Array.isArray(q.choices) || q.choices.length!==4 || q.choices.some(c=>typeof c!=='string'||!c.trim()||c.length>150) || new Set(q.choices.map(c=>c.trim())).size!==4 ||
          !Number.isInteger(q.correctIndex) || q.correctIndex<0 || q.correctIndex>3 || typeof (q.explanation??'')!=='string' || (q.explanation||'').length>1000) fail(400,'각 문제에 서로 다른 보기 4개, 정답 번호 0~3을 입력하세요.');
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO quiz_weeks(week) VALUES(?) ON CONFLICT(week) DO UPDATE SET revision=revision+1').run(input.week);
      db.prepare('DELETE FROM quiz_questions WHERE week=?').run(input.week);
      const insert = db.prepare('INSERT INTO quiz_questions(week,position,question,choice_a,choice_b,choice_c,choice_d,correct_index,explanation) VALUES(?,?,?,?,?,?,?,?,?)');
      input.questions.forEach((q,i)=>insert.run(input.week,i,q.question.trim(),...q.choices.map(c=>c.trim()),q.correctIndex,q.explanation||''));
      db.exec('COMMIT');
    } catch(error) { db.exec('ROLLBACK'); throw error; }
  }
  function importSpecial(input) {
    if (!input || !validWeek(input.week) || typeof input.title!=='string' || !input.title.trim() || input.title.length>60 || typeof input.description!=='string' || !input.description.trim() || input.description.length>600) fail(400,'특별 미션의 월요일 날짜, 제목과 내용을 확인하세요.');
    db.prepare('INSERT INTO special_missions(week,title,description) VALUES(?,?,?) ON CONFLICT(week) DO UPDATE SET title=excluded.title,description=excluded.description,revision=revision+1').run(input.week,input.title.trim(),input.description.trim());
  }
  return {db,login,resetPin,deleteStudent,authenticate,snapshot,quiz,checkAnswer,special,action,garden,importQuiz,importSpecial};
}
module.exports = {openStore,ApiError,dayAt,weekAt};
