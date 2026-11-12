const crypto = require('node:crypto');

function createQuizBank(db, {now, dayAt, fail}) {
  const questionKey = question => question.question.trim().replace(/\s+/g, ' ').toLowerCase();

  function importSets(input) {
    if (!input || !Array.isArray(input.sets) || !input.sets.length || input.sets.length > 1000)
      fail(400, 'sets에 1~1000개의 문제 세트를 등록하세요.');
    const ids = new Set();
    const keys = new Set();
    for (const set of input.sets) {
      if (!set || typeof set.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(set.id) || ids.has(set.id) ||
          typeof set.subject !== 'string' || !set.subject.trim() || set.subject.length > 40 ||
          typeof set.title !== 'string' || !set.title.trim() || set.title.length > 80 ||
          !Array.isArray(set.questions) || set.questions.length !== 10 ||
          (set.active !== undefined && typeof set.active !== 'boolean'))
        fail(400, '고유 id, 과목 subject, 제목 title과 정확히 10문제를 입력하세요.');
      ids.add(set.id);
      for (const q of set.questions) {
        if (!q || typeof q.question !== 'string' || !q.question.trim() || q.question.length > 500 ||
            !Array.isArray(q.choices) || q.choices.length !== 4 ||
            q.choices.some(c => typeof c !== 'string' || !c.trim() || c.length > 160) ||
            new Set(q.choices.map(c => c.trim())).size !== 4 ||
            !Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3 ||
            (q.explanation !== undefined && (typeof q.explanation !== 'string' || q.explanation.length > 1000)))
          fail(400, '각 문제에 보기 4개와 정답 번호 0~3을 입력하세요.');
        const key = JSON.stringify([set.subject.trim(), questionKey(q)]);
        if (keys.has(key)) fail(400, '같은 과목에 중복된 문제가 있습니다.');
        keys.add(key);
      }
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of db.prepare('SELECT id,subject,questions_json FROM quiz_sets').all()) {
        if (ids.has(row.id)) continue;
        for (const q of JSON.parse(row.questions_json)) {
          if (keys.has(JSON.stringify([row.subject, questionKey(q)])))
            fail(409, '이미 다른 세트에 등록한 문제가 있습니다. 해당 세트 id를 유지해 수정하세요.');
        }
      }
      const save = db.prepare(`INSERT INTO quiz_sets(id,subject,title,questions_json,active) VALUES(?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title,questions_json=excluded.questions_json,active=excluded.active`);
      for (const set of input.sets) {
        const previous = db.prepare('SELECT subject FROM quiz_sets WHERE id=?').get(set.id);
        if (previous && previous.subject !== set.subject.trim()) fail(409, '기존 세트의 과목은 변경할 수 없습니다.');
        // Assigned runs retain their own snapshot when the bank is edited.
        save.run(set.id, set.subject.trim(), set.title.trim(), JSON.stringify(set.questions.map(q => ({
          question:q.question.trim(), choices:q.choices.map(c => c.trim()),
          correctIndex:q.correctIndex, explanation:q.explanation || '',
        }))), set.active === false ? 0 : 1);
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return {sets:input.sets.length};
  }

  function availableSets(playerId, subject) {
    const completedQuestions = new Set(db.prepare(`SELECT questions_json FROM quiz_runs
      WHERE player_id=? AND subject=? AND result_json IS NOT NULL`).all(playerId, subject)
      .flatMap(row => JSON.parse(row.questions_json).map(questionKey)));
    return db.prepare(`SELECT s.* FROM quiz_sets s WHERE subject=? AND active=1
      AND NOT EXISTS(SELECT 1 FROM quiz_runs r WHERE r.player_id=? AND r.set_id=s.id AND r.result_json IS NOT NULL)
      ORDER BY s.id`).all(subject, playerId)
      .filter(set => JSON.parse(set.questions_json).every(q => !completedQuestions.has(questionKey(q))));
  }

  function subjects(playerId) {
    return {day:dayAt(now()), subjects:db.prepare(`SELECT subject FROM quiz_sets WHERE active=1
      UNION SELECT subject FROM quiz_runs WHERE player_id=? AND
      (day=? OR (result_json IS NOT NULL AND claimed=0)) ORDER BY subject`).all(playerId, dayAt(now())).map(row => {
      const today = db.prepare('SELECT id,result_json,claimed FROM quiz_runs WHERE player_id=? AND subject=? AND day=?')
        .get(playerId, row.subject, dayAt(now()));
      const remaining = availableSets(playerId, row.subject).length;
      return {subject:row.subject, remaining, completed:!!today?.result_json, claimed:!!today?.claimed};
    })};
  }

  function present(row) {
    const questions = JSON.parse(row.questions_json);
    return {id:row.id, subject:row.subject, day:row.day, setId:row.set_id, claimed:!!row.claimed,
      questions:questions.map((q, id) => ({id, question:q.question, choices:q.choices})),
      result:row.result_json ? JSON.parse(row.result_json) : null};
  }

  function start(playerId, input) {
    if (!input || typeof input.subject !== 'string' || input.subject.length > 40) fail(400, '과목을 선택하세요.');
    db.exec('BEGIN IMMEDIATE');
    try {
      // An unclaimed result survives midnight and can be collected after reconnecting.
      let run = db.prepare(`SELECT * FROM quiz_runs WHERE player_id=? AND subject=? AND
        (day=? OR (result_json IS NOT NULL AND claimed=0)) ORDER BY day,id LIMIT 1`)
        .get(playerId, input.subject, dayAt(now()));
      if (!run) {
        const available = availableSets(playerId, input.subject);
        if (!available.length) fail(409, '새 문제가 준비되면 다시 풀 수 있어요.');
        const set = available[crypto.randomInt(available.length)];
        const inserted = db.prepare('INSERT INTO quiz_runs(player_id,day,subject,set_id,questions_json) VALUES(?,?,?,?,?)')
          .run(playerId, dayAt(now()), set.subject, set.id, set.questions_json);
        run = db.prepare('SELECT * FROM quiz_runs WHERE id=?').get(inserted.lastInsertRowid);
      }
      db.exec('COMMIT');
      return present(run);
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  function submit(playerId, input) {
    if (!Number.isSafeInteger(input.runId) || !Array.isArray(input.answers) || input.answers.length !== 10 ||
        input.answers.some(a => !Number.isInteger(a) || a < 0 || a > 3)) fail(400, '10문제의 답을 모두 선택하세요.');
    db.exec('BEGIN IMMEDIATE');
    try {
      const run = db.prepare('SELECT * FROM quiz_runs WHERE id=? AND player_id=?').get(input.runId, playerId);
      if (!run) fail(404, '퀴즈 기록을 찾을 수 없어요.');
      if (!run.result_json) {
        if (run.day !== dayAt(now())) fail(409, '날짜가 바뀌었어요. 오늘의 문제를 다시 열어 주세요.');
        const questions = JSON.parse(run.questions_json);
        const answers = questions.map((q, i) => ({selected:input.answers[i], correctIndex:q.correctIndex,
          correct:input.answers[i] === q.correctIndex, explanation:q.explanation}));
        const correctCount = answers.filter(a => a.correct).length;
        const result = {correctCount, growth:correctCount * 10, answers};
        db.prepare('UPDATE quiz_runs SET result_json=? WHERE id=?').run(JSON.stringify(result), run.id);
        run.result_json = JSON.stringify(result);
      }
      db.exec('COMMIT');
      return present(run);
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  // Called inside the action transaction so the claim and growth commit together.
  function claim(playerId, runId) {
    if (!Number.isSafeInteger(runId)) fail(400, '퀴즈 기록을 확인하세요.');
    const run = db.prepare('SELECT * FROM quiz_runs WHERE id=? AND player_id=?').get(runId, playerId);
    if (!run || !run.result_json) fail(409, '먼저 10문제의 채점을 완료하세요.');
    if (run.claimed) return 0;
    const growth = JSON.parse(run.result_json).growth;
    const player = db.prepare('SELECT crop_id,progress FROM players WHERE id=?').get(playerId);
    if (growth > 0 && (!player.crop_id || player.progress >= 100)) fail(409, '수확하고 작물을 심은 뒤 퀴즈 보상을 받아 주세요.');
    db.prepare('UPDATE quiz_runs SET claimed=1 WHERE id=?').run(run.id);
    return growth;
  }
  return {importSets, subjects, start, submit, claim};
}
module.exports = {createQuizBank};
