const crypto = require('node:crypto');
const segmenter = new Intl.Segmenter('ko', {granularity:'grapheme'});
const gratitudeTitle = '감사의 말 전하기';
const gratitudeDescription = '고마운 학생의 학년·반·번호를 고르고 감사의 말을 10글자 이상 작성해 주세요. 서로 다른 4명까지, 한 명당 성장도 25%를 받아요. 선생님이 확인한 뒤 메시지를 전달해요.';

function createSpecialMissions(db, {now, fail, profileOf}) {
  const latest = () => db.prepare('SELECT * FROM special_campaigns ORDER BY id DESC LIMIT 1').get();
  function current(legacy = null) {
    const selected = latest();
    if (!selected) return legacy;
    if (selected.kind === 'off') return null;
    return {id:selected.id,kind:selected.kind,title:selected.title,description:selected.description,revision:selected.id};
  }
  function activate(input) {
    if (!['gratitude','custom','off'].includes(input.kind) || typeof input.requestId !== 'string' ||
        !/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestId)) fail(400,'미션 종류와 요청 번호를 확인하세요.');
    if ((input.title != null && typeof input.title !== 'string') || (input.description != null && typeof input.description !== 'string'))
      fail(400,'미션 제목과 내용을 확인하세요.');
    const title = input.kind === 'gratitude' ? gratitudeTitle : (input.title ?? '').trim();
    const description = input.kind === 'gratitude' ? gratitudeDescription : (input.description ?? '').trim();
    if (input.kind === 'custom' && (!title || title.length > 60 || !description || description.length > 600))
      fail(400,'미션 제목 1~60자와 내용 1~600자를 입력하세요.');
    const old = db.prepare('SELECT * FROM special_campaigns WHERE request_id=?').get(input.requestId);
    if (old && (old.kind !== input.kind || old.title !== title || old.description !== description))
      fail(409,'같은 요청 번호를 다른 미션에 사용할 수 없습니다.');
    if (!old) db.prepare('INSERT INTO special_campaigns(request_id,kind,title,description,created_at) VALUES(?,?,?,?,?)')
      .run(input.requestId,input.kind,title,description,new Date(now()).toISOString());
    return current();
  }
  function pendingGrowth(playerId) {
    return db.prepare('SELECT COALESCE(SUM(reward_remaining),0) growth FROM gratitude_messages WHERE player_id=?').get(playerId).growth;
  }
  // 남은 영양분은 다음 작물을 심을 때 이어서 지급합니다.
  function claimGrowth(playerId) {
    const player = db.prepare('SELECT crop_id,progress FROM players WHERE id=?').get(playerId);
    let capacity = player.crop_id ? 100 - player.progress : 0;
    let growth = 0;
    const pending = db.prepare('SELECT id,reward_remaining FROM gratitude_messages WHERE player_id=? AND reward_remaining>0 ORDER BY created_at,id').all(playerId);
    for (const message of pending) {
      const amount = Math.min(capacity,message.reward_remaining);
      if (!amount) break;
      db.prepare('UPDATE gratitude_messages SET reward_remaining=reward_remaining-? WHERE id=?').run(amount,message.id);
      capacity -= amount;
      growth += amount;
    }
    if (growth) db.prepare('UPDATE players SET progress=progress+?,revision=revision+1 WHERE id=?').run(growth,playerId);
    return growth;
  }
  function status(playerId, campaignId = current()?.id) {
    const items = campaignId ? db.prepare(`SELECT recipient_grade grade,recipient_class classNo,recipient_number number,
      recipient_name name FROM gratitude_messages WHERE player_id=? AND campaign_id=? ORDER BY created_at,id`).all(playerId,campaignId) : [];
    return {submitted:items,remaining:Math.max(0,4-items.length),pendingGrowth:pendingGrowth(playerId)};
  }
  function submit(playerId, input) {
    const recipient = input.recipient;
    if (!Number.isSafeInteger(input.missionId) || typeof input.requestId !== 'string' ||
        !/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestId) || !recipient ||
        ![recipient.grade,recipient.classNo,recipient.number].every(Number.isInteger) || typeof input.message !== 'string')
      fail(400,'받는 학생과 감사의 말을 확인해 주세요.');
    const body = input.message.normalize('NFC').trim();
    const charCount = [...segmenter.segment(body)].length;
    if (charCount < 10 || charCount > 500 || /[\p{Cc}\p{Cf}]/u.test(body.replace(/[\n\r\t]/g,'')))
      fail(400,'감사의 말을 10~500글자로 작성해 주세요.');
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous = db.prepare('SELECT * FROM gratitude_messages WHERE player_id=? AND request_id=?').get(playerId,input.requestId);
      if (previous) {
        if (previous.campaign_id !== input.missionId || previous.body !== body || previous.recipient_grade !== recipient.grade ||
            previous.recipient_class !== recipient.classNo || previous.recipient_number !== recipient.number)
          fail(409,'같은 요청 번호를 다른 메시지에 사용할 수 없어요.');
        db.exec('COMMIT');
        return {id:previous.id,...status(playerId,input.missionId)};
      }
      const mission = current();
      if (mission?.kind !== 'gratitude' || mission.id !== input.missionId) fail(409,'특별 미션이 바뀌었어요. 다시 열어 주세요.');
      const player = db.prepare('SELECT * FROM players WHERE id=?').get(playerId);
      if (player.role === 'student' && player.grade === recipient.grade && player.class_no === recipient.classNo && player.number === recipient.number)
        fail(400,'다른 학생에게 감사의 말을 작성해 주세요.');
      const student = db.prepare('SELECT name FROM student_roster WHERE grade=? AND class_no=? AND number=?')
        .get(recipient.grade,recipient.classNo,recipient.number);
      if (!student) fail(400,'학생 명단에 있는 학년·반·번호를 선택해 주세요.');
      const sent = db.prepare('SELECT recipient_grade,recipient_class,recipient_number FROM gratitude_messages WHERE player_id=? AND campaign_id=?').all(playerId,mission.id);
      if (sent.some(row=>row.recipient_grade===recipient.grade && row.recipient_class===recipient.classNo && row.recipient_number===recipient.number))
        fail(409,'이번 미션에서 이미 감사의 말을 작성한 학생이에요.');
      if (sent.length >= 4) fail(409,'이번 감사 미션은 4명까지 작성할 수 있어요.');
      const id = crypto.randomUUID();
      db.prepare(`INSERT INTO gratitude_messages(id,campaign_id,player_id,request_id,sender_json,
        recipient_grade,recipient_class,recipient_number,recipient_name,body,char_count,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id,mission.id,playerId,input.requestId,JSON.stringify(profileOf(player)),recipient.grade,recipient.classNo,recipient.number,student.name,body,charCount,new Date(now()).toISOString());
      claimGrowth(playerId);
      db.exec('COMMIT');
      return {id,...status(playerId,mission.id)};
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function inbox(playerId, page) {
    if (!Number.isSafeInteger(page) || page < 0 || page > 100000) fail(400,'페이지를 확인해 주세요.');
    const player = db.prepare('SELECT * FROM players WHERE id=?').get(playerId);
    if (player.role !== 'student') return {items:[],page:0,pages:1,total:0};
    const params = [player.grade,player.class_no,player.number];
    const filter = "WHERE recipient_grade=? AND recipient_class=? AND recipient_number=? AND delivered_at<>''";
    const total = db.prepare('SELECT COUNT(*) n FROM gratitude_messages '+filter).get(...params).n;
    const pages = Math.max(1,Math.ceil(total/20));
    page = Math.min(page,pages-1);
    const items = db.prepare('SELECT id,sender_json,body,delivered_at deliveredAt FROM gratitude_messages '+filter+' ORDER BY delivered_at DESC,id LIMIT 20 OFFSET ?')
      .all(...params,page*20).map(({sender_json,...row})=>({...row,sender:JSON.parse(sender_json)}));
    return {items,page,pages,total};
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
      recipient:{grade:row.recipient_grade,classNo:row.recipient_class,number:row.recipient_number,name:row.recipient_name},
      body:row.body,createdAt:row.created_at,deliveredAt:row.delivered_at,
      notionUrl:row.notion_page_id ? 'https://www.notion.so/'+row.notion_page_id.replaceAll('-','') : null,
    }));
    return {items,page,pages,total};
  }
  function deliver(id) {
    if (typeof id !== 'string') fail(400,'전송할 메시지를 선택하세요.');
    const message = db.prepare('SELECT * FROM gratitude_messages WHERE id=?').get(id);
    if (!message) fail(404,'메시지를 찾을 수 없습니다.');
    if (!message.notion_page_id) fail(409,'노션 저장 완료 후 전송할 수 있습니다.');
    db.prepare("UPDATE gratitude_messages SET delivered_at=?,sync_after=0 WHERE id=? AND delivered_at=''").run(new Date(now()).toISOString(),id);
    return {ok:true};
  }
  return {current,activate,status,submit,inbox,review,deliver,claimGrowth,pendingGrowth};
}
module.exports = {createSpecialMissions};
