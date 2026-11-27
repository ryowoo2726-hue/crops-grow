const crypto = require('node:crypto');
const {promisify} = require('node:util');
const fs = require('node:fs');
const path = require('node:path');
const {configFile} = require('./config.cjs');
const {ApiError} = require('./store.cjs');
const scrypt = promisify(crypto.scrypt);
const credentialFile = path.join(path.dirname(configFile),'admin-credentials.json');
async function hashPassword(password) {
  if (typeof password!=='string' || !/^\d{4,64}$/.test(password)) throw new ApiError(400,'관리자 비밀번호는 숫자 4~64자리로 입력하세요.');
  const salt=crypto.randomBytes(16).toString('hex');
  return {salt,hash:(await scrypt(password,salt,32)).toString('hex')};
}
function readCredentials() {
  if (!fs.existsSync(credentialFile)) return null;
  const value=JSON.parse(fs.readFileSync(credentialFile,'utf8').replace(/^\uFEFF/,''));
  if (!/^[a-f0-9]{32}$/.test(value.salt) || !/^[a-f0-9]{64}$/.test(value.hash)) throw Error('관리자 비밀번호 설정 파일을 확인하세요.');
  return value;
}
function createAdmin(store,{credentials,now,traffic}) {
  const sessions=new Map();
  let attempts=0,lockedUntil=0;
  const tokenHash=token=>crypto.createHash('sha256').update(token).digest('hex');
  function authenticate(token) {
    if (!token || token.length>200 || !(sessions.get(tokenHash(token))>now())) throw new ApiError(401,'관리자 로그인이 필요합니다.');
  }
  async function handle(route,method,input,token,reply) {
    if (route==='/api/admin/session' && method==='POST') {
      if (!credentials) throw new ApiError(503,'서버에서 관리자 비밀번호를 먼저 설정하세요.');
      if (lockedUntil>now()) throw new ApiError(429,'로그인 시도가 많습니다. 15분 뒤 다시 시도하세요.');
      if (lockedUntil) { attempts=0; lockedUntil=0; }
      if (++attempts>=5) lockedUntil=now()+15*60000;
      const password=input.password;
      if (typeof password!=='string' || !/^\d{4,64}$/.test(password)) throw new ApiError(401,'관리자 비밀번호를 확인하세요.');
      const actual=await scrypt(password,credentials.salt,32);
      if (!crypto.timingSafeEqual(actual,Buffer.from(credentials.hash,'hex'))) throw new ApiError(401,'관리자 비밀번호를 확인하세요.');
      attempts=0; lockedUntil=0;
      for (const [key,expires] of sessions) if (expires<=now()) sessions.delete(key);
      if (sessions.size>=20) sessions.delete(sessions.keys().next().value);
      const session=crypto.randomBytes(32).toString('base64url');
      sessions.set(tokenHash(session),now()+30*60000);
      reply(200,{token:session}); return;
    }
    authenticate(token);
    if (route==='/api/admin/traffic' && method==='GET') { reply(200,traffic.snapshot()); return; }
    if (route==='/api/admin/special' && method==='GET') {
      reply(200,{mission:store.special(),survey:store.specialMissions.surveySummary()}); return;
    }
    if (route==='/api/admin/special' && method==='POST') {
      reply(200,{mission:store.specialMissions.activate(input)}); return;
    }
    if (route==='/api/admin/messages' && method==='POST') {
      reply(200,store.specialMissions.review(input.status ?? 'pending',input.page ?? 0)); return;
    }
    if (route==='/api/admin/send-message' && method==='POST') {
      const result=store.specialMissions.deliver(input.id,input.teacherName,input.teacherNames,input.studentTarget);
      reply(200,result); return;
    }
    if (route==='/api/admin/send-messages' && method==='POST') {
      reply(200,store.specialMissions.deliverBatch(input.messages)); return;
    }
    if (route==='/api/admin/message-recipients' && method==='GET') {
      const recipients=store.db.prepare(`SELECT 'student' role,name,grade,class_no classNo,number,1 onRoster FROM student_roster
        UNION ALL
        SELECT p.role,p.name,p.grade,p.class_no,p.number,0 FROM players p
        WHERE p.role='teacher' OR NOT EXISTS (SELECT 1 FROM student_roster r
          WHERE r.grade=p.grade AND r.class_no=p.class_no AND r.number=p.number)
        ORDER BY role,grade,classNo,number,name`).all();
      reply(200,{recipients}); return;
    }
    if (route==='/api/admin/compose-message' && method==='POST') {
      reply(200,store.specialMissions.sendAdminMessage(input)); return;
    }
    if (route==='/api/admin/sent-messages' && method==='POST') {
      reply(200,store.specialMissions.sentAdminMessages(input.page ?? 0)); return;
    }
    if (route==='/api/admin/logout' && method==='POST') { sessions.delete(tokenHash(token)); reply(200,{ok:true}); return; }
    if (route==='/api/admin/students' && method==='GET') {
      const students=store.db.prepare(`SELECT p.grade,p.class_no classNo,p.number,p.crop_id cropId,p.progress,
        CASE WHEN p.pin_hash<>'' THEN 1 ELSE 0 END pinConfigured,
        (SELECT COUNT(*) FROM harvests h WHERE h.player_id=p.id) harvestCount
        FROM players p WHERE p.role='student' ORDER BY p.grade,p.class_no,p.number`).all();
      reply(200,{students}); return;
    }
    if (route==='/api/admin/teachers' && method==='GET') {
      const teachers=store.db.prepare(`SELECT p.name,p.crop_id cropId,p.progress,
        CASE WHEN p.pin_hash<>'' THEN 1 ELSE 0 END pinConfigured,
        (SELECT COUNT(*) FROM harvests h WHERE h.player_id=p.id) harvestCount
        FROM players p WHERE p.role='teacher' ORDER BY p.name`).all();
      reply(200,{teachers}); return;
    }
    if (route==='/api/admin/reset-pin' && method==='POST') {
      await store.resetPin(input.profile,input.pin);
      reply(200,{ok:true}); return;
    }
    if (route==='/api/admin/reset-water' && method==='POST') {
      store.resetWater(input.profile);
      reply(200,{ok:true}); return;
    }
    if (route==='/api/admin/delete-student' && method==='POST') {
      store.deleteStudent(input.profile);
      reply(200,{ok:true}); return;
    }
    if (route==='/api/admin/delete-teacher' && method==='POST') {
      store.deleteTeacher(input.name);
      reply(200,{ok:true}); return;
    }
    throw new ApiError(404,'요청한 관리자 기능을 찾을 수 없습니다.');
  }
  return {handle};
}
module.exports={createAdmin,hashPassword,readCredentials,credentialFile};
