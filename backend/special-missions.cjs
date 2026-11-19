const crypto = require('node:crypto');
const commemorations = require('./commemorative-missions.cjs');
const segmenter = new Intl.Segmenter('ko', {granularity:'grapheme'});
const gratitudeTitle = '감사의 말 전하기';
const gratitudeDescription = '고마운 학생의 학년·반·번호 또는 선생님의 이름을 골라 감사의 말을 10글자 이상 작성해 주세요. 서로 다른 4명까지, 한 명당 성장도 25%를 받아요. 관리자가 확인한 뒤 메시지를 전달해요.';
const missionKinds = new Set(['gratitude','custom','off',...Object.keys(commemorations)]);

function createSpecialMissions(db, {now, fail, profileOf}) {
  const latest = () => db.prepare('SELECT * FROM special_campaigns ORDER BY id DESC LIMIT 1').get();
  function current(legacy = null) {
    const selected = latest();
    if (!selected) return legacy;
    if (selected.kind === 'off') return null;
    const content = selected.content_json ? JSON.parse(selected.content_json) : null;
    return {id:selected.id,kind:selected.kind,title:selected.title,description:selected.description,revision:selected.id,
      ...(content ? {poster:content.poster} : {})};
  }
  function activate(input) {
    if (!missionKinds.has(input.kind) || typeof input.requestId !== 'string' ||
        !/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestId)) fail(400,'미션 종류와 요청 번호를 확인하세요.');
    if ((input.title != null && typeof input.title !== 'string') || (input.description != null && typeof input.description !== 'string'))
      fail(400,'미션 제목과 내용을 확인하세요.');
    const preset = commemorations[input.kind];
    const title = preset?.title ?? (input.kind === 'gratitude' ? gratitudeTitle : (input.title ?? '').trim());
    const description = preset?.description ?? (input.kind === 'gratitude' ? gratitudeDescription : (input.description ?? '').trim());
    if (input.kind === 'custom' && (!title || title.length > 60 || !description || description.length > 600))
      fail(400,'미션 제목 1~60자와 내용 1~600자를 입력하세요.');
    const old = db.prepare('SELECT * FROM special_campaigns WHERE request_id=?').get(input.requestId);
    if (old && (old.kind !== input.kind || old.title !== title || old.description !== description))
      fail(409,'같은 요청 번호를 다른 미션에 사용할 수 없습니다.');
    if (!old) db.prepare('INSERT INTO special_campaigns(request_id,kind,title,description,created_at,content_json) VALUES(?,?,?,?,?,?)')
      .run(input.requestId,input.kind,title,description,new Date(now()).toISOString(),preset ? JSON.stringify(preset) : null);
    return current();
  }
  function pendingGrowth(playerId) {
    return ['gratitude_messages','special_quiz_results'].reduce((total,table) =>
      total + db.prepare(`SELECT COALESCE(SUM(reward_remaining),0) growth FROM ${table} WHERE player_id=?`).get(playerId).growth,0);
  }
  // 남은 영양분은 다음 작물을 심을 때 이어서 지급합니다.
  function claimGrowth(playerId) {
    const player = db.prepare('SELECT crop_id,progress FROM players WHERE id=?').get(playerId);
    let capacity = player.crop_id ? 100 - player.progress : 0;
    let growth = 0;
    for (const [table,key] of [['gratitude_messages','id'],['special_quiz_results','campaign_id']]) {
      const pending = db.prepare(`SELECT ${key} id,reward_remaining FROM ${table} WHERE player_id=? AND reward_remaining>0 ORDER BY created_at,${key}`).all(playerId);
      for (const message of pending) {
        const amount = Math.min(capacity,message.reward_remaining);
        if (!amount) break;
        db.prepare(`UPDATE ${table} SET reward_remaining=reward_remaining-? WHERE ${key}=? AND player_id=?`).run(amount,message.id,playerId);
        capacity -= amount;
        growth += amount;
      }
    }
    if (growth) db.prepare('UPDATE players SET progress=progress+?,revision=revision+1 WHERE id=?').run(growth,playerId);
    return growth;
  }
  function status(playerId, campaignId = current()?.id) {
    const items = campaignId ? db.prepare(`SELECT recipient_role role,recipient_grade grade,recipient_class classNo,recipient_number number,
      recipient_name name FROM gratitude_messages WHERE player_id=? AND campaign_id=? ORDER BY created_at,id`).all(playerId,campaignId) : [];
    return {submitted:items,remaining:Math.max(0,4-items.length),pendingGrowth:pendingGrowth(playerId)};
  }
  function quiz(playerId, missionId) {
    if (!Number.isSafeInteger(missionId)) fail(400,'미션 번호를 확인해 주세요.');
    const mission = latest();
    if (!mission || mission.id !== missionId || !mission.content_json) fail(409,'특별 미션이 바뀌었어요. 다시 열어 주세요.');
    const content = JSON.parse(mission.content_json);
    const saved = db.prepare('SELECT result_json FROM special_quiz_results WHERE campaign_id=? AND player_id=?').get(missionId,playerId);
    return {questions:content.questions.map((q,id)=>({id,question:q.question,choices:q.choices})),
      result:saved ? JSON.parse(saved.result_json) : null};
  }
  function submitQuiz(playerId, input) {
    if (!Number.isSafeInteger(input.missionId) || !Array.isArray(input.answers) || input.answers.length !== 10 ||
        input.answers.some(answer=>!Number.isInteger(answer) || answer<0 || answer>3)) fail(400,'10문제의 답을 모두 선택해 주세요.');
    db.exec('BEGIN IMMEDIATE');
    try {
      // 응답이 유실되어 다시 제출해도 최초 결과와 보상은 한 번만 확정합니다.
      const saved = db.prepare('SELECT result_json FROM special_quiz_results WHERE campaign_id=? AND player_id=?').get(input.missionId,playerId);
      if (saved) { db.exec('COMMIT'); return {result:JSON.parse(saved.result_json)}; }
      quiz(playerId,input.missionId);
      const questions = JSON.parse(latest().content_json).questions;
      const answers = questions.map((q,i)=>({selected:input.answers[i],correct:input.answers[i]===q.correctIndex}));
      const correctCount = answers.filter(answer=>answer.correct).length;
      const result = {correctCount,growth:correctCount*10,answers,questions:questions.map((q,id)=>({id,...q}))};
      db.prepare('INSERT INTO special_quiz_results(campaign_id,player_id,result_json,reward_remaining,created_at) VALUES(?,?,?,?,?)')
        .run(input.missionId,playerId,JSON.stringify(result),result.growth,new Date(now()).toISOString());
      claimGrowth(playerId);
      db.exec('COMMIT');
      return {result};
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function submit(playerId, input) {
    const recipient = input.recipient;
    if (!Number.isSafeInteger(input.missionId) || typeof input.requestId !== 'string' ||
        !/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestId) || !recipient || typeof recipient !== 'object' || Array.isArray(recipient) ||
        !['student','teacher'].includes(recipient.role ?? 'student') || typeof input.message !== 'string')
      fail(400,'받는 사람과 감사의 말을 확인해 주세요.');
    const role = recipient.role ?? 'student';
    let name = '';
    if (role === 'teacher') {
      if (typeof recipient.name !== 'string') fail(400,'선생님 이름을 입력해 주세요.');
      name = recipient.name.normalize('NFC').trim();
      if (!name || name.length > 50 || /[\p{Cc}\p{Cf}]/u.test(name)) fail(400,'선생님 이름을 1~50자로 입력해 주세요.');
    } else if (![recipient.grade,recipient.classNo,recipient.number].every(Number.isInteger)) {
      fail(400,'받는 학생의 학년·반·번호를 확인해 주세요.');
    }
    const grade = role === 'student' ? recipient.grade : null;
    const classNo = role === 'student' ? recipient.classNo : null;
    const number = role === 'student' ? recipient.number : null;
    const body = input.message.normalize('NFC').trim();
    const charCount = [...segmenter.segment(body)].length;
    if (charCount < 10 || charCount > 500 || /[\p{Cc}\p{Cf}]/u.test(body.replace(/[\n\r\t]/g,'')))
      fail(400,'감사의 말을 10~500글자로 작성해 주세요.');
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous = db.prepare('SELECT * FROM gratitude_messages WHERE player_id=? AND request_id=?').get(playerId,input.requestId);
      if (previous) {
        if (previous.campaign_id !== input.missionId || previous.body !== body || previous.recipient_role !== role ||
            previous.recipient_grade !== grade || previous.recipient_class !== classNo || previous.recipient_number !== number ||
            (role === 'teacher' && previous.recipient_name !== name))
          fail(409,'같은 요청 번호를 다른 메시지에 사용할 수 없어요.');
        db.exec('COMMIT');
        return {id:previous.id,...status(playerId,input.missionId)};
      }
      const mission = current();
      if (mission?.kind !== 'gratitude' || mission.id !== input.missionId) fail(409,'특별 미션이 바뀌었어요. 다시 열어 주세요.');
      const player = db.prepare('SELECT * FROM players WHERE id=?').get(playerId);
      if ((role === 'student' && player.role === 'student' && player.grade === grade && player.class_no === classNo && player.number === number) ||
          (role === 'teacher' && player.role === 'teacher' && player.name === name))
        fail(400,'다른 사람에게 감사의 말을 작성해 주세요.');
      if (role === 'student') {
        const student = db.prepare('SELECT name FROM student_roster WHERE grade=? AND class_no=? AND number=?').get(grade,classNo,number);
        if (!student) fail(400,'학생 명단에 있는 학년·반·번호를 선택해 주세요.');
        name = student.name;
      }
      const sent = db.prepare('SELECT recipient_role,recipient_grade,recipient_class,recipient_number,recipient_name FROM gratitude_messages WHERE player_id=? AND campaign_id=?').all(playerId,mission.id);
      if (sent.some(row=>row.recipient_role === role && (role === 'teacher' ? row.recipient_name === name :
          row.recipient_grade === grade && row.recipient_class === classNo && row.recipient_number === number)))
        fail(409,'이번 미션에서 이미 감사의 말을 작성한 사람이에요.');
      if (sent.length >= 4) fail(409,'이번 감사 미션은 4명까지 작성할 수 있어요.');
      const id = crypto.randomUUID();
      db.prepare(`INSERT INTO gratitude_messages(id,campaign_id,player_id,request_id,sender_json,
        recipient_role,recipient_grade,recipient_class,recipient_number,recipient_name,body,char_count,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id,mission.id,playerId,input.requestId,JSON.stringify(profileOf(player)),role,grade,classNo,number,name,body,charCount,new Date(now()).toISOString());
      claimGrowth(playerId);
      db.exec('COMMIT');
      return {id,...status(playerId,mission.id)};
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function recipientFilter(playerId) {
    const player = db.prepare('SELECT role,name,grade,class_no,number FROM players WHERE id=?').get(playerId);
    return player.role === 'teacher'
      ? {filter:"recipient_role='teacher' AND recipient_name=?",params:[player.name]}
      : {filter:"recipient_role='student' AND recipient_grade=? AND recipient_class=? AND recipient_number=?",params:[player.grade,player.class_no,player.number]};
  }
  function unreadCount(playerId) {
    const {filter,params} = recipientFilter(playerId);
    return db.prepare(`SELECT COUNT(*) n FROM gratitude_messages WHERE ${filter} AND delivered_at<>'' AND read_at=''`).get(...params).n;
  }
  function markRead(playerId, ids) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 20 ||
        ids.some(id=>typeof id !== 'string' || !id.length || id.length > 100)) fail(400,'읽은 메시지를 확인해 주세요.');
    const {filter,params} = recipientFilter(playerId);
    // 수신자의 전달 완료 메시지만 갱신하고 이미 읽은 시각은 유지합니다.
    db.prepare(`UPDATE gratitude_messages SET read_at=? WHERE id IN (${ids.map(()=>'?').join(',')})
      AND ${filter} AND delivered_at<>'' AND read_at=''`)
      .run(new Date(now()).toISOString(),...ids,...params);
    return {unreadCount:unreadCount(playerId)};
  }
  function inbox(playerId, page) {
    if (!Number.isSafeInteger(page) || page < 0 || page > 100000) fail(400,'페이지를 확인해 주세요.');
    const recipient = recipientFilter(playerId);
    const params = recipient.params;
    const filter = `WHERE ${recipient.filter} AND delivered_at<>''`;
    const total = db.prepare('SELECT COUNT(*) n FROM gratitude_messages '+filter).get(...params).n;
    const pages = Math.max(1,Math.ceil(total/20));
    page = Math.min(page,pages-1);
    const items = db.prepare('SELECT id,sender_json,body,delivered_at deliveredAt,read_at readAt FROM gratitude_messages '+filter+' ORDER BY delivered_at DESC,id LIMIT 20 OFFSET ?')
      .all(...params,page*20).map(({sender_json,...row})=>({...row,sender:JSON.parse(sender_json)}));
    return {items,page,pages,total,unreadCount:unreadCount(playerId)};
  }
  function review(statusFilter, page) {
    if (!['pending','sent','all'].includes(statusFilter) || !Number.isSafeInteger(page) || page < 0 || page > 100000)
      fail(400,'메시지 상태와 페이지를 확인하세요.');
    const filter = statusFilter === 'all' ? '' : statusFilter === 'sent' ? "WHERE delivered_at<>''" : "WHERE delivered_at=''";
    const total = db.prepare('SELECT COUNT(*) n FROM gratitude_messages '+filter).get().n;
    const pages = Math.max(1,Math.ceil(total/20));
    page = Math.min(page,pages-1);
    const items = db.prepare('SELECT * FROM gratitude_messages '+filter+' ORDER BY created_at DESC,id LIMIT 20 OFFSET ?').all(page*20).map(row=>({
      id:row.id,missionId:row.campaign_id,sender:JSON.parse(row.sender_json),
      recipient:row.recipient_role === 'teacher' ? {role:'teacher',name:row.recipient_name} :
        {role:'student',grade:row.recipient_grade,classNo:row.recipient_class,number:row.recipient_number,name:row.recipient_name},
      recipientRegistered:row.recipient_role !== 'teacher' || !!db.prepare("SELECT 1 FROM players WHERE role='teacher' AND name=?").get(row.recipient_name),
      body:row.body,createdAt:row.created_at,deliveredAt:row.delivered_at,
    }));
    return {items,page,pages,total};
  }
  function deliver(id) {
    if (typeof id !== 'string') fail(400,'전송할 메시지를 선택하세요.');
    const message = db.prepare('SELECT * FROM gratitude_messages WHERE id=?').get(id);
    if (!message) fail(404,'메시지를 찾을 수 없습니다.');
    if (message.recipient_role === 'teacher' && !db.prepare("SELECT 1 FROM players WHERE role='teacher' AND name=?").get(message.recipient_name))
      fail(409,'등록 안됨: 받는 선생님이 같은 이름으로 참여한 뒤 전송해 주세요.');
    db.prepare("UPDATE gratitude_messages SET delivered_at=? WHERE id=? AND delivered_at=''").run(new Date(now()).toISOString(),id);
    return {ok:true};
  }
  return {current,activate,status,submit,inbox,review,deliver,claimGrowth,pendingGrowth,quiz,submitQuiz,unreadCount,markRead};
}
module.exports = {createSpecialMissions};
