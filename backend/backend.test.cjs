const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {backup}=require('node:sqlite');
const {createBackend}=require('./server.cjs');
const {hashPassword}=require('./admin.cjs');
const {parseRoster}=require('./roster.cjs');

test('설문 회차: 8문항 저장·재시도·영양분 이월·관리자 집계',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-survey-'));
  const pin=String(crypto.getRandomValues(new Uint16Array(1))[0]%10000).padStart(4,'0');
  const app=createBackend({directory,adminCredentials:await hashPassword(pin)});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.store.db.close();fs.rmSync(directory,{recursive:true,force:true});});
  const url=`http://127.0.0.1:${app.server.address().port}`;
  async function request(route,body,token){
    const response=await fetch(url+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',
      ...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
    return {status:response.status,data:await response.json()};
  }
  const first=await app.store.login({grade:1,classNo:1,number:1},pin);
  const second=await app.store.login({grade:1,classNo:1,number:2},pin);
  const firstId=app.store.authenticate(first.token),secondId=app.store.authenticate(second.token);
  app.store.db.prepare('UPDATE players SET progress=50 WHERE id=?').run(firstId);
  app.store.db.prepare('UPDATE players SET crop_id=NULL WHERE id=?').run(secondId);
  const admin=(await request('/api/admin/session',{password:pin})).data.token;
  const special='/api/special-mission',submit='/api/special-survey/submit',control='/api/admin/special';
  const activated=await request(control,{kind:'survey',requestId:'open-survey-round-one'},admin);
  assert.equal(activated.status,200);
  const missionId=activated.data.mission.id;
  const survey=(await request(special,null,first.token)).data;
  assert.equal(survey.mission.kind,'survey');
  assert.equal(survey.surveyQuestions.length,8);
  assert.equal(survey.completed,false);
  assert.equal((await request(control,null,first.token)).status,401);
  assert.equal((await request('/api/special-quiz?missionId='+missionId,null,first.token)).status,409);
  assert.equal((await request('/api/actions',{kind:'special',missionId,missionRevision:missionId,requestId:'survey-old-growth-path'},first.token)).status,409);
  const answers=survey.surveyQuestions.map(()=>0),input={missionId,answers};
  assert.equal((await request(submit,input)).status,401);
  assert.equal((await request(submit,{...input,answers:answers.slice(1)},first.token)).status,400);
  assert.equal((await request(submit,{...input,answers:answers.map((answer,i)=>i===5?4:answer)},first.token)).status,400);
  assert.equal(app.store.snapshot(firstId).progress,50);
  const repeated=await Promise.all([request(submit,input,first.token),request(submit,input,first.token)]);
  for(const result of repeated){
    assert.equal(result.status,200);
    assert.equal(result.data.state.progress,100);
    assert.equal(result.data.state.pendingGrowth,50);
  }
  assert.equal((await request(special,null,first.token)).data.completed,true);
  assert.equal((await request(special,null,second.token)).data.completed,false);
  assert.equal((await request(submit,{...input,answers:answers.map(()=>1)},first.token)).status,409);
  const secondAnswers=survey.surveyQuestions.map(question=>question.choices.length-1);
  assert.equal((await request(submit,{missionId,answers:secondAnswers},second.token)).data.state.pendingGrowth,100);
  assert.equal((await request('/api/actions',{kind:'plant',cropId:'apple',requestId:'survey-plant-with-reward'},second.token)).data.state.progress,100);
  assert.equal(app.store.snapshot(secondId).pendingGrowth,0);
  assert.deepEqual(app.store.db.prepare('SELECT answers_json FROM survey_responses ORDER BY player_id').all().map(row=>JSON.parse(row.answers_json)),[answers,secondAnswers]);
  await request(control,{kind:'off',requestId:'close-survey-round-one'},admin);
  assert.equal((await request(special,null,first.token)).data.mission,null);
  const summary=(await request(control,null,admin)).data.survey;
  assert.equal(summary.count,2);
  assert.deepEqual(summary.questions[3].choices.map(choice=>choice.count),[1,0,0,0,0,1]);
  assert.equal((await request(submit,input,first.token)).status,200);
  const next=(await request(control,{kind:'survey',requestId:'open-survey-round-two'},admin)).data.mission.id;
  assert.notEqual(next,missionId);
  assert.equal((await request(special,null,first.token)).data.completed,false);
  assert.equal((await request(control,null,admin)).data.survey.count,0);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM survey_responses').get().n,2);
});

test('관리자 메시지: v9 이관, 가입 전 전체·개인 발송, 재시도와 개별 읽음',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-admin-messages-'));
  const credentials=await hashPassword('1234');
  const previous=createBackend({directory});
  const studentProfile={role:'student',grade:1,classNo:1,number:1};
  const lateProfile={...studentProfile,number:2};
  const teacherProfile={role:'teacher',name:'가상 교사'};
  previous.store.importRoster([{...studentProfile,name:'등록 학생'},{...lateProfile,name:'가입 예정 학생'}]);
  const student=await previous.store.login(studentProfile,'1234');
  previous.store.db.exec('DROP TABLE inbox_deletions; DROP TABLE admin_message_reads; DROP TABLE admin_messages; PRAGMA user_version=9');
  previous.store.db.close();

  const app=createBackend({directory,adminCredentials:credentials});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{
    await new Promise(resolve=>app.server.close(resolve));
    app.store.db.close();
    assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));
    fs.rmSync(directory,{recursive:true,force:true});
  });
  async function request(route,token,body){
    const response=await fetch(`http://127.0.0.1:${app.server.address().port}${route}`,{
      method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
      body:body?JSON.stringify(body):undefined,
    });
    return {status:response.status,data:await response.json()};
  }
  const admin=(await request('/api/admin/session','',{password:'1234'})).data.token;
  const compose='/api/admin/compose-message';
  const recipients='/api/admin/message-recipients';
  const sent='/api/admin/sent-messages';
  const remove='/api/messages/delete';
  const broadcast={recipient:'all',message:'수확 행사 안내',requestId:'admin-broadcast-test-1'};
  assert.equal((await request(compose,student.token,broadcast)).status,401);
  assert.equal((await request(recipients,student.token)).status,401);
  assert.equal((await request(sent,student.token,{})).status,401);
  assert.equal((await request(remove,'',{id:'sample'})).status,401);
  assert.equal((await request(sent,admin,{page:-1})).status,400);
  assert.deepEqual((await request(sent,admin,{})).data,{items:[],page:0,pages:1,total:0});
  assert.deepEqual((await request(recipients,admin)).data.recipients.map(person=>person.name),['등록 학생','가입 예정 학생']);
  assert.equal((await request(compose,admin,{...broadcast,message:'   '})).status,400);
  assert.equal((await request(compose,admin,{...broadcast,recipient:{...studentProfile,number:99}})).status,404);
  assert.deepEqual((await request(compose,admin,broadcast)).data,{ok:true});
  const direct={recipient:{...teacherProfile,name:' '+teacherProfile.name.normalize('NFD')+' '},message:'교사 개인 안내',requestId:'admin-direct-test-01'};
  const studentDirect={recipient:lateProfile,message:'학생 개인 안내',requestId:'admin-direct-test-02'};
  assert.equal((await request(compose,admin,direct)).status,200);
  assert.equal((await request(compose,admin,studentDirect)).status,200);

  const late=await app.store.login(lateProfile,'1234');
  const teacher=await app.store.login(teacherProfile,'1234');
  assert.deepEqual((await request(compose,admin,broadcast)).data,{ok:true});
  assert.equal((await request(compose,admin,{...broadcast,message:'다른 내용'})).status,409);
  assert.deepEqual(new Set((await request('/api/messages',late.token)).data.items.map(item=>item.body)),new Set([broadcast.message,studentDirect.message]));
  const teacherInbox=(await request('/api/messages',teacher.token)).data;
  assert.equal(teacherInbox.unreadCount,2);
  assert.equal(teacherInbox.items.find(item=>item.body===direct.message).sender.name,'관리자');
  const ids=teacherInbox.items.map(item=>item.id);
  const studentInbox=(await request('/api/messages',student.token)).data;
  assert.deepEqual(studentInbox.items.map(item=>item.body),[broadcast.message]);
  const history=(await request(sent,admin,{})).data;
  assert.deepEqual(history.items.map(item=>item.body),[studentDirect.message,direct.message,broadcast.message]);
  assert.deepEqual(history.items.map(item=>item.recipient),[{...lateProfile,name:'가입 예정 학생'},teacherProfile,'all']);
  assert.ok(history.items.every(item=>Number.isFinite(Date.parse(item.sentAt))));
  const broadcastId=studentInbox.items[0].id;
  assert.equal((await request(remove,late.token,{id:broadcastId,page:-1})).status,400);
  assert.equal((await request(remove,late.token,{id:history.items[1].id})).data.unreadCount,2);
  const deleted=(await request(remove,late.token,{id:broadcastId})).data;
  assert.deepEqual(deleted.items.map(item=>item.body),[studentDirect.message]);
  assert.equal(deleted.unreadCount,1);
  assert.deepEqual((await request(remove,late.token,{id:broadcastId})).data,deleted);
  const lateAgain=await app.store.login(lateProfile,'1234');
  assert.deepEqual((await request('/api/messages',lateAgain.token)).data,deleted);
  assert.deepEqual((await request(sent,admin,{})).data,history);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM inbox_deletions').get().n,1);
  assert.equal((await request('/api/messages/read',student.token,{ids})).data.unreadCount,0);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM admin_message_reads WHERE player_id=?').get(app.store.authenticate(student.token)).n,1);
  assert.equal((await request('/api/me',teacher.token)).data.state.unreadMessageCount,2);
  assert.equal((await request('/api/messages/read',teacher.token,{ids})).data.unreadCount,0);
  assert.ok((await request('/api/messages',teacher.token)).data.items.every(item=>item.readAt));
  app.store.deleteTeacher(teacherProfile.name);
  const rejoined=await app.store.login(teacherProfile,'1234');
  assert.equal((await request('/api/messages',rejoined.token)).data.unreadCount,2);
  for(let i=0;i<19;i++) app.store.specialMissions.sendAdminMessage({recipient:lateProfile,message:`개인 안내 ${i}`,requestId:`history-pagination-${i}`});
  assert.equal((await request(sent,admin,{page:1})).data.total,22);
  assert.equal((await request(sent,admin,{page:1})).data.items.length,2);
  const oldest=(await request('/api/messages?page=1',lateAgain.token)).data;
  assert.equal(oldest.pages,1);
  const extra={recipient:lateProfile,message:'새 공지',requestId:'one-more-for-page'};
  app.store.specialMissions.sendAdminMessage(extra);
  const lastPage=(await request('/api/messages?page=1',lateAgain.token)).data;
  assert.equal(lastPage.items.length,1);
  const firstPage=(await request(remove,lateAgain.token,{id:lastPage.items[0].id,page:1})).data;
  assert.deepEqual([firstPage.page,firstPage.pages,firstPage.total],[0,1,20]);
  assert.equal(app.store.db.prepare('PRAGMA user_version').get().user_version,17);
  assert.deepEqual(app.store.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('선생님 수신: 원문 보존·관리자 수신자 선택·수신함 격리·읽음·통합 4명 제한',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-teacher-recipient-'));
  const app=createBackend({directory,adminCredentials:await hashPassword('1234')});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.store.db.close();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  app.store.importRoster([{grade:1,classNo:1,number:1,name:'가상교사'},{grade:1,classNo:1,number:2,name:'다른학생'}]);
  const sender=await app.store.login({grade:1,classNo:1,number:1},'1234');
  const student=await app.store.login({grade:1,classNo:1,number:2},'1234');
  const otherTeacher=await app.store.login({role:'teacher',name:'다른교사'},'1234');
  const senderId=app.store.authenticate(sender.token);
  async function request(route,body,token=sender.token){
    const response=await fetch(`http://127.0.0.1:${app.server.address().port}`+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
    return {status:response.status,data:await response.json()};
  }
  const admin=(await request('/api/admin/session',{password:'1234'},'')).data.token;
  const mission=app.store.specialMissions.activate({kind:'gratitude',requestId:'teacher-recipient-mission'});
  const input={missionId:mission.id,requestId:'teacher-recipient-first',recipient:{role:'teacher',name:'  '+'가상교사'.normalize('NFD')+'  '},message:'항상 친절하게 가르쳐 주셔서 정말 감사합니다.'};
  for(const recipient of [{role:'teacher'},{role:'teacher',name:''},{role:'teacher',name:'가\n나'},{role:'teacher',name:'가'.repeat(51)},{role:'unknown',name:'교사'}])
    assert.equal((await request('/api/gratitude',{...input,recipient})).status,400);
  const saved=(await request('/api/gratitude',input)).data;
  assert.equal(saved.state.progress,25);assert.equal(saved.remaining,3);
  assert.equal(saved.submitted[0].role,'teacher');assert.equal(saved.submitted[0].name,'가상교사');
  assert.equal((await request('/api/gratitude',{...input,recipient:{role:'teacher',name:'가상교사'}})).data.id,saved.id);
  assert.equal((await request('/api/gratitude',{...input,requestId:'teacher-duplicate-request',recipient:{role:'teacher',name:'가상교사'}})).status,409);
  const row=app.store.db.prepare('SELECT * FROM gratitude_messages WHERE id=?').get(saved.id);
  assert.equal(row.recipient_role,'teacher');assert.equal(row.recipient_name,'가상교사');assert.equal(row.recipient_grade,null);
  let review=(await request('/api/admin/messages',{status:'pending',page:0},admin)).data.items.find(item=>item.id===saved.id);
  assert.deepEqual(review.recipient,{role:'teacher',name:'가상교사'});assert.equal(review.recipientRegistered,false);
  const blocked=await request('/api/admin/send-message',{id:saved.id},admin);
  assert.equal(blocked.status,400);assert.match(blocked.data.error,/선택/);
  assert.equal((await request('/api/admin/send-message',{id:saved.id,teacherName:'아직미등록'},admin)).status,409);
  assert.equal((await request('/api/messages',null,otherTeacher.token)).data.total,0);
  const typedNameAccount=await app.store.login({role:'teacher',name:'  '+'가상교사'.normalize('NFD')+'  '},'1234');
  const teacher=await app.store.login({role:'teacher',name:'실제수신교사'},'1234');
  assert.equal((await request('/api/messages/delete',{id:saved.id},teacher.token)).data.total,0);
  const pending=(await request('/api/admin/messages',{status:'pending',page:0},admin)).data;
  assert.deepEqual(new Set(pending.teachers),new Set(['가상교사','다른교사','실제수신교사']));
  review=pending.items.find(item=>item.id===saved.id);
  assert.equal(review.recipientRegistered,true);
  assert.equal((await request('/api/admin/send-message',{id:saved.id},admin)).status,400);
  const delivery={id:saved.id,teacherNames:['실제수신교사','다른교사']};
  assert.equal((await request('/api/admin/send-message',delivery,student.token)).status,401);
  assert.equal((await request('/api/admin/send-message',{...delivery,teacherNames:['실제수신교사','실제수신교사']},admin)).status,400);
  assert.equal((await request('/api/admin/send-message',delivery,admin)).status,200);
  assert.equal((await request('/api/admin/send-message',{...delivery,teacherNames:delivery.teacherNames.toReversed()},admin)).status,200);
  assert.equal((await request('/api/admin/send-message',{...delivery,teacherNames:['가상교사']},admin)).status,409);
  assert.equal((await request('/api/gratitude',input)).data.id,saved.id);
  assert.equal((await request('/api/me',null,teacher.token)).data.state.unreadMessageCount,1);
  assert.equal((await request('/api/messages',null,teacher.token)).data.items[0].body,input.message);
  for(const token of [sender.token,student.token,typedNameAccount.token]){
    assert.equal((await request('/api/messages',null,token)).data.total,0);
    assert.equal((await request('/api/messages/read',{ids:[saved.id]},token)).data.unreadCount,0);
    assert.equal((await request('/api/messages/delete',{id:saved.id},token)).data.total,0);
  }
  assert.equal((await request('/api/me',null,teacher.token)).data.state.unreadMessageCount,1);
  assert.equal((await request('/api/messages/read',{ids:[saved.id]},teacher.token)).data.unreadCount,0);
  assert.ok((await request('/api/messages',null,teacher.token)).data.items[0].readAt);
  assert.equal((await request('/api/messages/delete',{id:saved.id},teacher.token)).data.total,0);
  assert.equal((await request('/api/me',null,teacher.token)).data.state.unreadMessageCount,0);
  const otherInbox=(await request('/api/messages',null,otherTeacher.token)).data;
  assert.equal(otherInbox.unreadCount,1);
  assert.equal(otherInbox.items[0].id,saved.id);
  assert.equal(otherInbox.items[0].readAt,'');
  const sent=(await request('/api/admin/messages',{status:'sent',page:0},admin)).data.items[0];
  assert.equal(sent.body,input.message);
  assert.equal(sent.recipient.name,'가상교사');
  assert.deepEqual(new Set(sent.deliveryTeacherNames),new Set(delivery.teacherNames));
  assert.equal(app.store.snapshot(senderId).progress,25);
  const letters=[];
  for(const [i,recipient] of [{grade:1,classNo:1,number:2},{role:'teacher',name:'둘째교사'},{role:'teacher',name:'셋째교사'}].entries()){
    const response=await request('/api/gratitude',{...input,requestId:'teacher-mixed-recipient-'+i,recipient});
    assert.equal(response.status,200);letters.push(response.data.id);
  }
  const batch={messages:[{id:letters[0]},{id:letters[1],teacherNames:['다른교사','미등록계정']}]};
  assert.equal((await request('/api/admin/send-messages',batch,student.token)).status,401);
  const failedBatch=await request('/api/admin/send-messages',batch,admin);
  assert.equal(failedBatch.status,409);
  assert.match(failedBatch.data.error,/2번째/);
  assert.equal((await request('/api/messages',null,student.token)).data.total,0);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM gratitude_teacher_deliveries WHERE message_id=?').get(letters[1]).n,0);
  batch.messages[1].teacherNames=['다른교사','실제수신교사'];
  assert.deepEqual((await request('/api/admin/send-messages',batch,admin)).data,{ok:true,count:2});
  assert.equal((await request('/api/admin/send-messages',batch,admin)).status,200);
  assert.equal((await request('/api/messages',null,student.token)).data.items[0].id,letters[0]);
  assert.deepEqual(new Set((await request('/api/messages',null,otherTeacher.token)).data.items.map(item=>item.id)),new Set([saved.id,letters[1]]));
  assert.equal(app.store.specialMissions.review('pending',0).items[0].id,letters[2]);
  assert.equal((await request('/api/gratitude',{...input,requestId:'teacher-limit-recipient',recipient:{role:'teacher',name:'넷째교사'}})).status,409);
  assert.equal(app.store.specialMissions.status(senderId).remaining,0);
  const selfMission=app.store.specialMissions.activate({kind:'gratitude',requestId:'teacher-recipient-self'});
  assert.equal((await request('/api/gratitude',{...input,missionId:selfMission.id,requestId:'teacher-self-recipient'},typedNameAccount.token)).status,400);
  const different=(await request('/api/gratitude',{...input,missionId:selfMission.id,requestId:'teacher-other-recipient'},teacher.token)).data;
  assert.equal((await request('/api/admin/send-message',{id:different.id,teacherName:'실제수신교사'},admin)).status,400);
  assert.deepEqual(app.store.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('감사 편지 수신자 변경: 학생 한 명과 학급 전체, 가입 전 발송, 읽음·삭제 격리',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-class-letters-'));
  const app=createBackend({directory,adminCredentials:await hashPassword('1234')});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.store.db.close();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  const sameClass={grade:2,classNo:3};
  const profiles=[1,2,3].map(number=>({...sameClass,number}));
  const outsiderProfile={...sameClass,classNo:4,number:2};
  const roster=[...profiles,outsiderProfile].map((profile,i)=>({...profile,name:'가상학생'+i}));
  app.store.importRoster(roster);
  const [sender,student,outsider]=await Promise.all([profiles[0],profiles[1],outsiderProfile].map(profile=>app.store.login(profile,'1234')));
  const senderId=app.store.authenticate(sender.token);
  const mission=app.store.specialMissions.activate({kind:'gratitude',requestId:'class-delivery-mission'});
  const write=(name,requestId)=>app.store.specialMissions.submit(senderId,{missionId:mission.id,requestId,
    recipient:{role:'teacher',name},message:'늘 친절하게 도와주셔서 정말 감사합니다.'}).id;
  const classLetter=write('미등록선생님','class-delivery-first');
  const individualLetter=write('다른미등록선생님','class-delivery-second');
  async function request(route,body,token=sender.token){
    const response=await fetch(`http://127.0.0.1:${app.server.address().port}`+route,{method:body?'POST':'GET',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined});
    return {status:response.status,data:await response.json()};
  }
  const admin=(await request('/api/admin/session',{password:'1234'},'')).data.token;
  const single='/api/admin/send-message',batch='/api/admin/send-messages';
  const studentTarget={role:'class',...sameClass};
  const delivery={id:classLetter,studentTarget};
  assert.equal((await request(single,delivery,student.token)).status,401);
  assert.equal((await request(single,{...delivery,studentTarget:{...studentTarget,number:2}},admin)).status,400);
  assert.equal((await request(single,{...delivery,studentTarget:{role:'student',...profiles[0]}},admin)).status,400);
  const invalidBatch={messages:[delivery,{id:individualLetter,studentTarget:{role:'class',grade:3,classNo:99}}]};
  assert.equal((await request(batch,invalidBatch,admin)).status,409);
  assert.equal((await request('/api/messages',null,student.token)).data.total,0);
  const individual={id:individualLetter,studentTarget:{role:'student',...outsiderProfile}};
  assert.deepEqual((await request(batch,{messages:[delivery,individual]},admin)).data,{ok:true,count:2});
  assert.equal((await request(single,delivery,admin)).status,200);
  assert.equal((await request(single,{...delivery,studentTarget:individual.studentTarget},admin)).status,409);
  assert.equal((await request('/api/messages')).data.total,0);
  assert.deepEqual((await request('/api/messages',null,outsider.token)).data.items.map(item=>item.id),[individualLetter]);
  const late=await app.store.login(profiles[2],'1234');
  const inbox=await request('/api/messages',null,student.token);
  assert.equal(inbox.data.unreadCount,1);
  assert.equal(inbox.data.items[0].id,classLetter);
  assert.deepEqual(inbox.data.items[0].sender,sender.state.profile);
  assert.equal((await request('/api/messages/read',{ids:[classLetter]},student.token)).data.unreadCount,0);
  assert.equal((await request('/api/messages/delete',{id:classLetter},student.token)).data.total,0);
  const lateInbox=(await request('/api/messages',null,late.token)).data;
  assert.equal(lateInbox.items[0].id,classLetter);
  assert.equal(lateInbox.unreadCount,1);
  const sent=(await request('/api/admin/messages',{status:'sent'},admin)).data.items.find(item=>item.id===classLetter);
  assert.equal(sent.recipient.name,'미등록선생님');
  assert.deepEqual(sent.deliveryStudentTarget,{...studentTarget,count:2});
  const newcomer={...sameClass,number:4,name:'추가학생'};
  app.store.importRoster([...roster,newcomer]);
  assert.equal((await request(single,delivery,admin)).status,200);
  const newcomerAccount=await app.store.login(newcomer,'1234');
  assert.equal((await request('/api/messages',null,newcomerAccount.token)).data.total,0);
  assert.equal(app.store.snapshot(senderId).progress,50);
  assert.deepEqual(app.store.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('v13 감사 편지 이관: 이미 전달한 선생님 편지와 읽음 보존',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-messages-v13-'));
  let app=createBackend({directory});
  t.after(()=>{app.store.db.close();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  const testPin=String(crypto.getRandomValues(new Uint16Array(1))[0]%10000).padStart(4,'0');
  const author=await app.store.login({grade:1,classNo:1,number:1},testPin);
  const teacherName='이전수신교사';
  const teacher=await app.store.login({role:'teacher',name:teacherName},testPin);
  const teacherId=app.store.authenticate(teacher.token);
  const mission=app.store.specialMissions.activate({kind:'gratitude',requestId:'v13-teacher-campaign'});
  const {id}=app.store.specialMissions.submit(app.store.authenticate(author.token),{missionId:mission.id,
    requestId:'v13-teacher-gratitude',recipient:{role:'teacher',name:teacherName},message:'따뜻하게 가르쳐 주셔서 고맙습니다.'});
  app.store.specialMissions.deliver(id,teacherName);
  app.store.specialMissions.markRead(teacherId,[id]);
  const oldInbox=app.store.specialMissions.inbox(teacherId,0);
  app.store.db.exec(`UPDATE gratitude_messages SET read_at=(SELECT read_at FROM gratitude_teacher_deliveries WHERE message_id=gratitude_messages.id)
      WHERE recipient_role='teacher' AND delivered_at<>'';
    DROP TABLE gratitude_teacher_deliveries;
    CREATE INDEX gratitude_teacher_inbox ON gratitude_messages(recipient_name,delivered_at) WHERE recipient_role='teacher';
    PRAGMA user_version=13;`);
  app.store.db.close();app=createBackend({directory});
  assert.equal(app.store.db.prepare('PRAGMA user_version').get().user_version,17);
  assert.deepEqual(app.store.specialMissions.inbox(teacherId,0),oldInbox);
  assert.deepEqual(app.store.specialMissions.review('sent',0).items[0].deliveryTeacherNames,[teacherName]);
  assert.deepEqual(app.store.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('v6 감사 메시지 이관: id·수신 학생·읽음·전송·남은 보상 보존',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-messages-v6-'));
  let app=createBackend({directory});
  t.after(()=>{app.store.db.close();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  app.store.importRoster([{grade:1,classNo:1,number:1,name:'가상발신자'},{grade:1,classNo:1,number:2,name:'가상수신자'}]);
  const sender=await app.store.login({grade:1,classNo:1,number:1},'1234');
  const receiver=await app.store.login({grade:1,classNo:1,number:2},'1234');
  const senderId=app.store.authenticate(sender.token),receiverId=app.store.authenticate(receiver.token);
  const mission=app.store.specialMissions.activate({kind:'gratitude',requestId:'v6-message-campaign'});
  const first=app.store.specialMissions.submit(senderId,{missionId:mission.id,requestId:'v6-message-first',recipient:{grade:1,classNo:1,number:2},message:'언제나 친절하게 도와주어서 정말 고마워요.'});
  app.store.specialMissions.deliver(first.id);app.store.specialMissions.markRead(receiverId,[first.id]);
  app.store.db.prepare('UPDATE players SET progress=100 WHERE id=?').run(senderId);
  const next=app.store.specialMissions.activate({kind:'gratitude',requestId:'v6-message-next-campaign'});
  app.store.specialMissions.submit(senderId,{missionId:next.id,requestId:'v6-message-pending',recipient:{grade:1,classNo:1,number:2},message:'언제나 친절하게 도와주어서 정말 고마워요.'});
  const rows=app.store.db.prepare('SELECT * FROM gratitude_messages ORDER BY id').all().map(({recipient_role,...row})=>row);
  const before=app.store.snapshot(senderId),inbox=app.store.specialMissions.inbox(receiverId,0);
  app.store.db.exec(`PRAGMA foreign_keys=OFF;
    CREATE TABLE messages_v6 (id TEXT PRIMARY KEY,campaign_id INTEGER NOT NULL REFERENCES special_campaigns(id),
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,request_id TEXT NOT NULL,sender_json TEXT NOT NULL,
      recipient_grade INTEGER NOT NULL,recipient_class INTEGER NOT NULL,recipient_number INTEGER NOT NULL,recipient_name TEXT NOT NULL,
      body TEXT NOT NULL,char_count INTEGER NOT NULL,created_at TEXT NOT NULL,delivered_at TEXT NOT NULL DEFAULT '',read_at TEXT NOT NULL DEFAULT '',
      reward_remaining INTEGER NOT NULL DEFAULT 25 CHECK(reward_remaining BETWEEN 0 AND 25),notion_page_id TEXT NOT NULL DEFAULT '',
      notion_delivered INTEGER NOT NULL DEFAULT 0,sync_after INTEGER NOT NULL DEFAULT 0,
      UNIQUE(player_id,request_id),UNIQUE(campaign_id,player_id,recipient_grade,recipient_class,recipient_number)) STRICT;`);
  const columns=Object.keys(rows[0]).join(',');
  app.store.db.exec(`INSERT INTO messages_v6(${columns}) SELECT ${columns} FROM gratitude_messages;
    DROP TABLE gratitude_messages; ALTER TABLE messages_v6 RENAME TO gratitude_messages; PRAGMA user_version=6;`);
  app.store.db.close();app=createBackend({directory});
  assert.equal(app.store.db.prepare('PRAGMA user_version').get().user_version,17);
  assert.deepEqual(app.store.snapshot(senderId),before);
  assert.deepEqual(app.store.specialMissions.inbox(receiverId,0),inbox);
  assert.deepEqual(app.store.db.prepare('SELECT * FROM gratitude_messages ORDER BY id').all().map(({recipient_role,...row})=>{assert.equal(recipient_role,'student');return row;}),rows);
  assert.deepEqual(app.store.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('읽지 않은 메시지: v5 이전·수신자 권한·전달 상태·페이지별 읽음·재접속 보존',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-unread-'));
  let clock=Date.now(),app=createBackend({directory,now:()=>clock});
  t.after(async()=>{if(app.server.listening) await new Promise(resolve=>app.server.close(resolve));app.store.db.close();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  app.store.importRoster([1,2,3].map(number=>({grade:1,classNo:1,number,name:`가상학생${number}`})));
  const sender=await app.store.login({grade:1,classNo:1,number:1},'1234');
  const receiver=await app.store.login({grade:1,classNo:1,number:2},'1234');
  const outsider=await app.store.login({grade:1,classNo:1,number:3},'1234');
  const teacher=await app.store.login({role:'teacher',name:'가상교사'},'1234');
  const senderId=app.store.authenticate(sender.token),receiverId=app.store.authenticate(receiver.token);
  const delivered=[];
  let pending,other;
  for(let i=0;i<23;i++){
    const mission=app.store.specialMissions.activate({kind:'gratitude',requestId:`unread-campaign-${i}`});
    const saved=app.store.specialMissions.submit(senderId,{missionId:mission.id,requestId:`unread-message-${i}`,recipient:{grade:1,classNo:1,number:i===22?3:2},message:'언제나 친절하게 도와주어서 정말 고마워요.'});
    if(i===21) pending=saved.id;
    else {app.store.specialMissions.deliver(saved.id);if(i===22) other=saved.id;else delivered.push(saved.id);}
  }
  const before=app.store.snapshot(receiverId);
  // 기존 v5 DB에는 읽음 열이 없습니다. 메시지와 전달 시각은 그대로 이관합니다.
  app.store.db.exec('ALTER TABLE gratitude_messages DROP COLUMN read_at; PRAGMA user_version=5;');
  app.store.db.close();app=createBackend({directory,now:()=>clock});
  assert.equal(app.store.db.prepare('PRAGMA user_version').get().user_version,17);
  assert.deepEqual(app.store.snapshot(receiverId),before);
  assert.deepEqual(app.store.db.prepare('PRAGMA foreign_key_check').all(),[]);
  const start=()=>new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  await start();
  async function request(route,body,token=receiver.token){
    const response=await fetch(`http://127.0.0.1:${app.server.address().port}`+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
    return {status:response.status,data:await response.json()};
  }
  assert.equal((await request('/api/messages/read',{ids:[delivered[0]]},'')).status,401);
  assert.equal((await request('/api/me')).data.state.unreadMessageCount,21);
  assert.equal((await request('/api/me',null,teacher.token)).data.state.unreadMessageCount,0);
  const first=(await request('/api/messages?page=0')).data;
  assert.equal(first.items.length,20);assert.equal(first.pages,2);assert.equal(first.total,21);assert.equal(first.unreadCount,21);
  assert.ok(first.items.every(item=>item.readAt===''));
  assert.equal((await request('/api/messages?page=0')).data.unreadCount,21,'목록 조회만으로 읽음 처리하지 않음');
  for(const ids of [[],Array(21).fill(delivered[0]),[null],[4],[''],['x'.repeat(101)]])
    assert.equal((await request('/api/messages/read',{ids})).status,400);
  assert.equal((await request('/api/messages/read',{ids:[delivered[0]]},outsider.token)).data.unreadCount,1);
  assert.equal((await request('/api/messages/read',{ids:[delivered[0]]},teacher.token)).data.unreadCount,0);
  assert.equal((await request('/api/messages/read',{ids:[pending,other,'unknown-message']})).data.unreadCount,21);
  assert.equal(app.store.db.prepare('SELECT read_at FROM gratitude_messages WHERE id=?').get(pending).read_at,'');
  assert.equal(app.store.db.prepare('SELECT read_at FROM gratitude_messages WHERE id=?').get(other).read_at,'');
  const ids=first.items.map(item=>item.id);
  assert.equal((await request('/api/messages/read',{ids})).data.unreadCount,1);
  const readAt=app.store.db.prepare('SELECT read_at FROM gratitude_messages WHERE id=?').get(ids[0]).read_at;
  assert.ok(readAt);clock+=1000;
  assert.equal((await request('/api/messages/read',{ids})).data.unreadCount,1);
  assert.equal(app.store.db.prepare('SELECT read_at FROM gratitude_messages WHERE id=?').get(ids[0]).read_at,readAt);
  const second=(await request('/api/messages?page=1')).data;
  assert.equal(second.items.length,1);assert.equal(second.unreadCount,1);
  assert.equal((await request('/api/messages/read',{ids:[second.items[0].id]})).data.unreadCount,0);
  assert.equal((await request('/api/messages?page=0')).data.total,21,'읽은 메시지는 보관함에서 사라지지 않음');
  await new Promise(resolve=>app.server.close(resolve));app.store.db.close();app=createBackend({directory,now:()=>clock});await start();
  assert.equal((await request('/api/me')).data.state.unreadMessageCount,0);
  assert.ok((await request('/api/messages?page=0')).data.items.every(item=>item.readAt));
  app.store.specialMissions.deliver(pending);
  assert.equal((await request('/api/me')).data.state.unreadMessageCount,1,'새 메시지가 전달되면 다시 알림');
});

test('기념일 특별 퀴즈: 관리자 선택, 10문항, 서버 채점, 재시도·재접속·교체·남은 보상',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-special-quiz-'));
  let app=createBackend({directory,adminCredentials:await hashPassword('1234')});
  const start=()=>new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  await start();
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.store.db.close();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  const student=await app.store.login({grade:1,classNo:1,number:1},'1234');
  const id=app.store.authenticate(student.token);
  async function request(route,body,token=student.token){
    const response=await fetch(`http://127.0.0.1:${app.server.address().port}`+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
    return {status:response.status,data:await response.json()};
  }
  const admin=(await request('/api/admin/session',{password:'1234'},'')).data.token;
  assert.equal((await request('/api/admin/special',{kind:'patriots',requestId:'special-admin-0001'})).status,401);
  assert.equal((await request('/api/special-quiz?missionId=1',null,'')).status,401);
  let lastMission;
  for(const kind of ['patriots','farmers']){
    const mission=(await request('/api/admin/special',{kind,requestId:'special-quiz-'+kind},admin)).data.mission;
    lastMission=mission;
    assert.equal(mission.poster.sections.length,4);
    assert.ok(!JSON.stringify(mission).includes('correctIndex'));
    const opened=(await request('/api/special-quiz?missionId='+mission.id)).data;
    assert.equal(opened.questions.length,10);assert.equal(opened.result,null);
    assert.ok(!JSON.stringify(opened).includes('correctIndex'));
    assert.equal((await request('/api/actions',{kind:'special',missionId:mission.id,missionRevision:mission.id,requestId:'bypass-quiz-'+kind})).status,409);
    const answers=JSON.parse(app.store.db.prepare('SELECT content_json FROM special_campaigns WHERE id=?').get(mission.id).content_json).questions.map(q=>q.correctIndex);
    for(const invalid of [[],answers.slice(1),[9,...answers.slice(1)],[null,...answers.slice(1)]])
      assert.equal((await request('/api/special-quiz/submit',{missionId:mission.id,answers:invalid})).status,400);
    // 7개 정답, 3개 오답. 클라이언트의 임의 growth 값은 무시합니다.
    const mixed=answers.map((answer,i)=>i<7?answer:(answer+1)%4);
    const input={missionId:mission.id,answers:mixed,growth:100};
    const response=(await request('/api/special-quiz/submit',input)).data;
    assert.equal(response.result.correctCount,7);assert.equal(response.result.growth,70);
    assert.equal(response.result.answers.filter(a=>a.correct).length,7);
    const revision=response.state.revision;
    for(let n=0;n<2;n++){
      const again=(await request('/api/special-quiz/submit',{...input,answers})).data;
      assert.deepEqual(again.result,response.result);assert.equal(again.state.revision,revision);
    }
    assert.deepEqual((await request('/api/special-quiz?missionId='+mission.id)).data.result,response.result);
  }
  assert.equal(app.store.snapshot(id).progress,100);
  assert.equal(app.store.specialMissions.pendingGrowth(id),40);
  app.store.action(id,{kind:'harvest',requestId:'special-quiz-harvest'});
  assert.equal(app.store.action(id,{kind:'plant',cropId:'apple',requestId:'special-quiz-plant'}).state.progress,40);
  assert.equal(app.store.specialMissions.pendingGrowth(id),0);
  // v7 DB의 기존 캠페인과 퀴즈 결과를 유지하면서 새 미션을 추가합니다.
  const campaignSchema=app.store.db.prepare("SELECT sql FROM sqlite_schema WHERE name='special_campaigns'").get().sql;
  app.store.db.exec(`PRAGMA foreign_keys=OFF;
    ${campaignSchema.replace('special_campaigns (','campaigns_v7 (').replace("'student-independence',",'')};
    INSERT INTO campaigns_v7 SELECT * FROM special_campaigns;
    DROP TABLE special_campaigns; ALTER TABLE campaigns_v7 RENAME TO special_campaigns;
    PRAGMA user_version=7;`);
  await new Promise(resolve=>app.server.close(resolve));app.store.db.close();
  app=createBackend({directory,adminCredentials:await hashPassword('1234')});await start();
  assert.equal((await request('/api/special-quiz?missionId='+lastMission.id)).data.result.correctCount,7);
  assert.equal(app.store.db.prepare('PRAGMA user_version').get().user_version,17);
  const replacement=(await request('/api/admin/special',{
    kind:'student-independence',requestId:'special-quiz-replacement',
  },(await request('/api/admin/session',{password:'1234'},'')).data.token)).data.mission;
  assert.equal(replacement.title,'학생독립운동기념일');
  assert.equal(replacement.poster.date,'11월 3일');
  assert.notEqual(replacement.id,lastMission.id);
  assert.equal((await request('/api/special-quiz?missionId='+lastMission.id)).status,409);
  assert.equal((await request('/api/special-quiz?missionId='+replacement.id)).data.result,null);
  const other=await app.store.login({grade:1,classNo:1,number:2},'1234');
  assert.equal((await request('/api/special-quiz/submit',{missionId:lastMission.id,answers:Array(10).fill(0)},other.token)).status,409);
  const correct=JSON.parse(app.store.db.prepare('SELECT content_json FROM special_campaigns WHERE id=?').get(replacement.id).content_json).questions.map(q=>q.correctIndex);
  const perfect=(await request('/api/special-quiz/submit',{missionId:replacement.id,answers:correct})).data;
  assert.equal(perfect.result.growth,100);assert.equal(perfect.state.progress,100);
  assert.equal(app.store.specialMissions.pendingGrowth(id),40);
  const zero=(await request('/api/special-quiz/submit',{missionId:replacement.id,answers:correct.map(a=>(a+1)%4)},other.token)).data;
  assert.equal(zero.result.growth,0);assert.equal(zero.state.progress,0);
  assert.equal((await request('/api/special-quiz/submit',{missionId:replacement.id,answers:correct},other.token)).data.result.growth,0);
  const unfinished=app.store.specialMissions.activate({kind:'farmers',requestId:'special-quiz-unfinished'});
  app.store.specialMissions.activate({kind:'off',requestId:'special-quiz-finished'});
  assert.equal((await request('/api/special-quiz/submit',{missionId:unfinished.id,answers:Array(10).fill(0)})).status,409);
  app.store.deleteStudent({grade:1,classNo:1,number:1});
  assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM special_quiz_results WHERE player_id=?').get(id).n,0);
  assert.deepEqual(app.store.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('v4 미션 이전: 기존 감사 메시지·학생·보상 보존과 노션 없이 전송',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-v4-'));
  let app=createBackend({directory});
  t.after(()=>{app.store.db.close();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  app.store.importRoster([{grade:1,classNo:1,number:1,name:'가상발신자'},{grade:1,classNo:1,number:2,name:'가상수신자'}]);
  const student=await app.store.login({grade:1,classNo:1,number:1},'1234');
  const id=app.store.authenticate(student.token);
  const mission=app.store.specialMissions.activate({kind:'gratitude',requestId:'v4-mission-request'});
  const saved=app.store.specialMissions.submit(id,{missionId:mission.id,requestId:'v4-message-request',recipient:{grade:1,classNo:1,number:2},message:'언제나 친절하게 도와주어서 정말 고마워요.'});
  const before=app.store.snapshot(id);
  app.store.db.exec(`PRAGMA foreign_keys=OFF;
    CREATE TABLE campaigns_v4 (id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK(kind IN ('gratitude','custom','off')),title TEXT NOT NULL,description TEXT NOT NULL,created_at TEXT NOT NULL) STRICT;
    INSERT INTO campaigns_v4 SELECT id,request_id,kind,title,description,created_at FROM special_campaigns;
    DROP TABLE special_campaigns; ALTER TABLE campaigns_v4 RENAME TO special_campaigns;
    DROP TABLE special_quiz_results; PRAGMA user_version=4;`);
  app.store.db.close();app=createBackend({directory});
  assert.deepEqual(app.store.snapshot(id),before);
  assert.equal(app.store.special().id,mission.id);
  assert.equal(app.store.specialMissions.review('pending',0).items[0].id,saved.id);
  app.store.specialMissions.deliver(saved.id);
  const delivered=app.store.specialMissions.review('sent',0).items[0].deliveredAt;
  assert.ok(delivered);
  app.store.specialMissions.deliver(saved.id);
  assert.equal(app.store.specialMissions.review('sent',0).items[0].deliveredAt,delivered);
  assert.equal(app.store.db.prepare('PRAGMA user_version').get().user_version,17);
  assert.deepEqual(app.store.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('관리자 미션 교체·감사 메시지 4명·25% 보상·DB 검토 후 수동 전송',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-gratitude-'));
  let clock=Date.now();
  const app=createBackend({directory,now:()=>clock,adminCredentials:await hashPassword('1234')});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.store.db.close();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  app.store.importRoster(Array.from({length:7},(_,i)=>({grade:1,classNo:12,number:i+1,name:`가상학생${i+1}`})));
  const sender=await app.store.login({grade:1,classNo:12,number:1},'1234');
  const receiver=await app.store.login({grade:1,classNo:12,number:2},'1234');
  const outsider=await app.store.login({grade:1,classNo:12,number:7},'1234');
  const playerId=app.store.authenticate(sender.token);
  const base=`http://127.0.0.1:${app.server.address().port}`;
  async function request(route,body,token=sender.token){
    const response=await fetch(base+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
    return {status:response.status,data:await response.json()};
  }
  const admin=(await request('/api/admin/session',{password:'1234'},'')).data.token;
  assert.equal((await request('/api/admin/special',{kind:'gratitude',requestId:'mission-select-0001'})).status,401);
  const mission=(await request('/api/admin/special',{kind:'gratitude',requestId:'mission-select-0001'},admin)).data.mission;
  assert.equal(mission.kind,'gratitude');
  assert.equal((await request('/api/admin/special',{kind:'gratitude',requestId:'mission-select-0001'},admin)).data.mission.id,mission.id);
  assert.equal((await request('/api/admin/special',{kind:'custom',title:2,requestId:'mission-select-0001'},admin)).status,400);
  assert.equal((await request('/api/actions',{kind:'special',missionRevision:mission.id,requestId:'skip-writing-0001'})).status,409);
  const input={missionId:mission.id,requestId:'gratitude-submit-0001',recipient:{grade:1,classNo:12,number:2},message:'항상 친절하게 도와줘서 정말 고마워요.'};
  assert.equal((await request('/api/gratitude',{...input,message:'짧은 글'})).status,400);
  assert.equal((await request('/api/gratitude',{...input,recipient:{grade:1,classNo:12,number:1}})).status,400);
  assert.equal((await request('/api/gratitude',{...input,recipient:{grade:1,classNo:12,number:30}})).status,400);
  const first=(await request('/api/gratitude',input)).data;
  assert.equal(first.state.progress,25);assert.equal(first.remaining,3);
  assert.equal((await request('/api/gratitude',input)).data.state.progress,25);
  assert.equal((await request('/api/gratitude',{...input,message:'다른 내용으로 바꿔서 제출합니다.'})).status,409);
  assert.equal((await request('/api/gratitude',{...input,requestId:'gratitude-duplicate-01'})).status,409);

  assert.equal((await request('/api/messages',null,receiver.token)).data.total,0);
  const review=(await request('/api/admin/messages',{status:'pending',page:0},admin)).data;
  assert.equal(review.total,1);assert.equal(review.items[0].notionUrl,undefined);assert.equal(review.items[0].body,input.message);
  assert.equal((await request('/api/admin/send-message',{id:first.id},receiver.token)).status,401);
  assert.equal((await request('/api/admin/send-message',{id:first.id},admin)).status,200);
  assert.equal((await request('/api/admin/send-message',{id:first.id},admin)).status,200);

  const inbox=(await request('/api/messages',null,receiver.token)).data;
  assert.equal(inbox.total,1);assert.equal(inbox.items[0].body,input.message);
  assert.equal((await request('/api/messages',null,outsider.token)).data.total,0);
  assert.equal((await request('/api/messages?page=-1',null,receiver.token)).status,400);
  for(let number=3;number<=5;number++){
    const result=await request('/api/gratitude',{...input,requestId:`gratitude-submit-000${number}`,recipient:{grade:1,classNo:12,number}});
    assert.equal(result.status,200);
  }
  assert.equal(app.store.snapshot(playerId).progress,100);
  assert.equal((await request('/api/gratitude',{...input,requestId:'gratitude-submit-0006',recipient:{grade:1,classNo:12,number:6}})).status,409);
  const next=(await request('/api/admin/special',{kind:'gratitude',requestId:'mission-select-0002'},admin)).data.mission;
  assert.notEqual(next.id,mission.id);
  assert.equal((await request('/api/special-mission')).data.remaining,4);
  assert.equal((await request('/api/gratitude',{...input,requestId:'gratitude-stale-0001'})).status,409);
  await request('/api/gratitude',{...input,missionId:next.id,requestId:'gratitude-submit-next1'});
  assert.equal(app.store.snapshot(playerId).pendingGratitudeGrowth,25);
  app.store.action(playerId,{kind:'harvest',requestId:'gratitude-harvest-01'});
  const planted=app.store.action(playerId,{kind:'plant',cropId:'apple',requestId:'gratitude-plant-001'}).state;
  assert.equal(planted.progress,25);assert.equal(planted.pendingGratitudeGrowth,0);
  assert.equal((await request('/api/admin/special',{kind:'off',requestId:'mission-select-0003'},admin)).data.mission,null);
  assert.equal((await request('/api/special-mission')).data.mission,null);
  const custom=(await request('/api/admin/special',{kind:'custom',title:'새 특별미션',description:'오늘 실천할 미션입니다.',requestId:'mission-select-0004'},admin)).data.mission;
  assert.equal((await request('/api/missions/current')).data.mission.title,'새 특별미션');
  assert.equal((await request('/api/actions',{kind:'special',missionRevision:custom.id,requestId:'custom-stale-00001'})).status,409);
  assert.equal((await request('/api/actions',{kind:'special',missionId:custom.id,missionRevision:custom.revision,requestId:'custom-growth-0001'})).data.state.progress,55);

  app.store.deleteStudent({grade:1,classNo:12,number:1});
  assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM gratitude_messages').get().n,0);
  assert.deepEqual(app.store.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('명단 CSV·12반·학생 이름 및 교사 참여, 재로그인과 기록 보존',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-roster-'));
  const rosterFile=path.join(directory,'students.csv');
  const csv='\uFEFF"학년","반","번호","성명","비고"\r\n1,12,1,"가상학생","쉼표, 메모\n두 줄"\r\n1,12,3,"다른학생","따옴표 ""메모"""\r\n';
  assert.equal(parseRoster(csv).length,2);
  assert.throws(()=>parseRoster(csv+'1,12,1,중복,\n'),/중복/);
  assert.throws(()=>parseRoster('학년,반,번호,성명\n1,12,1,"닫히지 않음'),/따옴표/);
  assert.throws(()=>parseRoster('학년,반,번호,성명\n1,12,1,\n'),/성명/);
  fs.writeFileSync(rosterFile,csv);
  let app=createBackend({directory,rosterFile});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{
    if(app.server.listening) await new Promise(resolve=>app.server.close(resolve));
    app.store.db.close();
    assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});
  });
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const options=await fetch(base+'/api/login-options');
  assert.equal(options.headers.get('cache-control'),'no-store');
  assert.deepEqual(await options.json(),{classes:[{grade:1,classNo:12,numbers:[1,3]}]});
  const profile={grade:1,classNo:12,number:1};
  const student=await app.store.login({...profile,name:'임의 이름'},'1234');
  assert.deepEqual(student.state.profile,{role:'student',...profile,name:'가상학생'});
  for(const invalid of [{...profile,number:2},{...profile,classNo:11}])
    await assert.rejects(app.store.login(invalid,'1234'),e=>e.status===400);
  const teacherProfile={role:'teacher',name:' 가상교사 '};
  const teacherResults=await Promise.all(Array.from({length:4},()=>app.store.login(teacherProfile,'4321')));
  const teacher=teacherResults[0],id=app.store.authenticate(teacher.token);
  assert.ok(teacherResults.every(session=>app.store.authenticate(session.token)===id));
  assert.deepEqual(teacher.state.profile,{role:'teacher',name:'가상교사'});
  await assert.rejects(app.store.login(teacherProfile,'1111'),e=>e.status===401);
  for(const invalid of [{role:'teacher',name:' '},{role:'teacher',name:'가'.repeat(51)},{role:'teacher',name:'가\n나'},{role:'other'}])
    await assert.rejects(app.store.login(invalid,'1234'),e=>e.status===400);
  await app.store.login({role:'teacher',name:'다른교사'},'5678');
  app.store.action(id,{kind:'water',requestId:'teacher-water-0001'});
  app.store.resetWater(teacherProfile);
  app.store.action(id,{kind:'water',requestId:'teacher-water-0002'});
  app.store.action(id,{kind:'harvest',requestId:'teacher-harvest-0001'});
  app.store.action(id,{kind:'harvest',requestId:'teacher-harvest-0001'});
  const individual=app.store.rankings(id,'individual',0);
  assert.deepEqual(individual.items[0],{role:'teacher',name:'가상교사',rank:1,harvestCount:1,isSelf:true});
  assert.equal(individual.summary.class,null);
  const classes=app.store.rankings(id,'class',0);
  assert.equal(classes.total,1);assert.equal(classes.items[0].harvestCount,0);
  assert.equal(classes.items[0].studentCount,1);assert.equal(classes.items[0].isSelf,false);
  assert.equal(app.store.rankings(app.store.authenticate(student.token),'individual',0).summary.individual.rank,2);
  const response=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile:teacherProfile,pin:'4321'})});
  assert.equal(response.status,200);assert.equal((await response.json()).state.harvestCount,1);
  app.store.quizBank.importSets({sets:[{id:'teacher-quiz',subject:'영어',title:'교사 문제',questions:Array.from({length:10},(_,i)=>({question:`교사 문제 ${i}`,choices:['A','B','C','D'],correctIndex:0}))}]});
  app.store.action(id,{kind:'plant',cropId:'apple',requestId:'teacher-plant-0001'});
  const run=app.store.quizBank.start(id,{subject:'영어'});
  app.store.quizBank.submit(id,{runId:run.id,growth:30});
  assert.equal(app.store.action(id,{kind:'quiz-set',runId:run.id,requestId:'teacher-quiz-00001'}).state.progress,30);
  fs.writeFileSync(rosterFile,csv.replace('가상학생','변경학생'));
  await fetch(base+'/api/login-options');
  assert.equal(app.store.snapshot(app.store.authenticate(student.token)).profile.name,'변경학생');
  fs.writeFileSync(rosterFile,'잘못된 CSV');
  assert.equal((await fetch(base+'/api/login-options')).status,200);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM student_roster').get().n,2);
  await new Promise(resolve=>app.server.close(resolve));app.store.db.close();
  app=createBackend({directory,rosterFile});
  assert.equal((await app.store.login(profile,'1234')).state.profile.name,'변경학생');
  const restored=await app.store.login({role:'teacher',name:'가상교사'},'4321');
  assert.equal(restored.state.harvestCount,1);assert.equal(restored.state.progress,30);
  assert.deepEqual(app.store.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('이전 v2 DB의 학생·PIN·세션·수확을 최신 스키마로 이관한다',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-migrate-v3-'));
  const {DatabaseSync}=require('node:sqlite');
  const legacy=new DatabaseSync(path.join(directory,'growgame.sqlite'));
  legacy.exec(`CREATE TABLE players (
    id INTEGER PRIMARY KEY,grade INTEGER NOT NULL CHECK(grade BETWEEN 1 AND 3),
    class_no INTEGER NOT NULL CHECK(class_no BETWEEN 1 AND 10),number INTEGER NOT NULL CHECK(number BETWEEN 1 AND 30),
    pin_salt TEXT NOT NULL,pin_hash TEXT NOT NULL,failed_attempts INTEGER NOT NULL DEFAULT 0,locked_until INTEGER NOT NULL DEFAULT 0,
    crop_id TEXT DEFAULT 'rice',progress INTEGER NOT NULL DEFAULT 0,water_day TEXT NOT NULL DEFAULT '',mission_day TEXT NOT NULL DEFAULT '',
    revision INTEGER NOT NULL DEFAULT 0,UNIQUE(grade,class_no,number)) STRICT;
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,player_id INTEGER NOT NULL REFERENCES players(id),expires_at INTEGER NOT NULL) STRICT;
    CREATE TABLE harvests(id INTEGER PRIMARY KEY,player_id INTEGER NOT NULL REFERENCES players(id),crop_id TEXT NOT NULL,created_at TEXT NOT NULL) STRICT;
    PRAGMA user_version=2;`);
  const crypto=require('node:crypto'),salt=crypto.randomBytes(16).toString('hex');
  const hash=crypto.scryptSync('1234',salt,32).toString('hex');
  legacy.prepare('INSERT INTO players(id,grade,class_no,number,pin_salt,pin_hash,progress) VALUES(7,1,1,1,?,?,50)').run(salt,hash);
  legacy.prepare('INSERT INTO harvests VALUES(9,7,?,?)').run('apple',new Date().toISOString());
  const token='legacy-session';
  legacy.prepare('INSERT INTO sessions VALUES(?,7,?)').run(crypto.createHash('sha256').update(token).digest('hex'),Date.now()+3600000);
  legacy.close();
  const app=createBackend({directory});
  t.after(()=>{app.store.db.close();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  assert.equal(app.store.authenticate(token),7);
  app.store.importRoster(parseRoster('학년,반,번호,성명\n1,1,1,이관학생\n1,12,1,신규학생'));
  const state=(await app.store.login({grade:1,classNo:1,number:1},'1234')).state;
  assert.equal(state.profile.name,'이관학생');assert.equal(state.progress,50);assert.equal(state.harvestCount,1);
  assert.equal((await app.store.login({grade:1,classNo:12,number:1},'1234')).state.profile.classNo,12);
  assert.equal((await app.store.login({role:'teacher',name:'이관교사'},'4321')).state.profile.role,'teacher');
  assert.equal(app.store.db.prepare('PRAGMA user_version').get().user_version,17);
  assert.deepEqual(app.store.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('수확 랭킹: 개인·반 공동 순위, 내 순위 고정 요약, 페이지, 수확·삭제 반영',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-rankings-'));
  const app=createBackend({directory});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.store.db.close();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  const profiles=[{grade:1,classNo:1,number:1},{grade:1,classNo:1,number:2},
    {grade:1,classNo:2,number:1},{grade:2,classNo:1,number:1},
    ...Array.from({length:9},(_,i)=>({grade:3,classNo:1,number:i+1}))];
  const sessions=await Promise.all(profiles.map(p=>app.store.login(p,'1234')));
  const ids=sessions.map(s=>app.store.authenticate(s.token));
  const insert=app.store.db.prepare('INSERT INTO harvests(player_id,crop_id,created_at) VALUES(?,?,?)');
  for(let i=0;i<4;i++)for(let n=0;n<[2,3,5,1][i];n++)insert.run(ids[i],n%2?'apple':'rice',new Date().toISOString());
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const query=async(route,token=sessions[0].token)=>{
    const response=await fetch(base+route,{headers:token?{Authorization:`Bearer ${token}`}:{}});
    return {status:response.status,data:await response.json(),headers:response.headers};
  };
  assert.equal((await query('/api/rankings','')).status,401);
  for(const suffix of ['?scope=other','?page=-1','?page=1.5','?page=NaN'])
    assert.equal((await query('/api/rankings'+suffix)).status,400);
  const individual=await query('/api/rankings?scope=individual');
  assert.equal(individual.headers.get('cache-control'),'no-store');
  assert.equal(individual.data.total,13);assert.equal(individual.data.pages,2);
  assert.deepEqual(individual.data.summary,{individual:{rank:3,harvestCount:2},class:{rank:1,harvestCount:5}});
  assert.deepEqual(individual.data.items.slice(0,4).map(i=>i.harvestCount),[5,3,2,1]);
  assert.equal(individual.data.items[2].isSelf,true);
  assert.deepEqual(Object.keys(individual.data.items[0]).sort(),['rank','grade','classNo','number','harvestCount','isSelf'].sort());
  const second=(await query('/api/rankings?page=1')).data;
  assert.deepEqual(second.summary,individual.data.summary);
  assert.equal(second.items.length,3);assert.ok(second.items.every(i=>i.rank===5));
  assert.equal((await query('/api/rankings?page=999')).data.page,1);
  const classes=(await query('/api/rankings?scope=class')).data;
  assert.equal(classes.total,4);
  assert.deepEqual(classes.items.map(i=>i.rank),[1,1,3,4]);
  assert.deepEqual(classes.items.map(i=>i.harvestCount),[5,5,1,0]);
  assert.equal(classes.items[0].studentCount,2);assert.equal(classes.items[0].isSelf,true);
  app.store.db.prepare('UPDATE players SET progress=100 WHERE id=?').run(ids[0]);
  const harvest={kind:'harvest',requestId:'ranking-harvest-0001'};
  app.store.action(ids[0],harvest);app.store.action(ids[0],harvest);
  const updated=(await query('/api/rankings')).data;
  assert.deepEqual(updated.summary,{individual:{rank:2,harvestCount:3},class:{rank:1,harvestCount:6}});
  app.store.deleteStudent(profiles[2]);
  const removed=(await query('/api/rankings?scope=class')).data;
  assert.equal(removed.total,3);assert.equal(removed.summary.individual.rank,1);
});

test('신규 등록 경쟁과 재시도: 같은 번호 한 명, 다른 PIN 거부, 잠금 유지',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-register-race-'));
  const app=createBackend({directory});
  t.after(()=>{app.store.db.close();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  const crypto=require('node:crypto');
  const pin=String(crypto.randomInt(1000,9999)),wrong=String(Number(pin)+1);
  const profile={grade:1,classNo:1,number:1};
  const same=await Promise.all(Array.from({length:8},()=>app.store.login(profile,pin)));
  const id=app.store.authenticate(same[0].token);
  assert.ok(same.every(result=>app.store.authenticate(result.token)===id));
  assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM players').get().n,1);
  const conflicting=await Promise.allSettled([app.store.login({...profile,number:2},pin),app.store.login({...profile,number:2},wrong)]);
  assert.equal(conflicting.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(conflicting.find(r=>r.status==='rejected').reason.status,401);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM players').get().n,2);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM sessions').get().n,9,'잘못된 PIN에는 세션 미발급');
  for(let i=0;i<5;i++) await assert.rejects(app.store.login(profile,wrong),e=>e.status===401);
  await assert.rejects(app.store.login(profile,pin),e=>e.status===429);
});

test('과목당 하루 한 세트, 기기 채점 요약과 완료 이력·보상은 재시도·재시작에도 유지',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-quiz-sets-'));
  const bankFile=path.join(directory,'bank.json');
  const set=(id,subject='영어')=>({id,subject,title:id,questions:Array.from({length:10},(_,i)=>({
    question:`${id} 문제 ${i+1}`,choices:['A','B','C','D'],correctIndex:i%4,explanation:`해설 ${i+1}`,
  }))});
  const bank={sets:[set('english-1'),set('english-2'),set('science-1','과학')]};
  fs.writeFileSync(bankFile,JSON.stringify(bank));
  let clock=Date.parse('2026-11-12T22:59:00Z'); // Seoul 08:00 is one minute later.
  let app=createBackend({directory,now:()=>clock,dailyLimit:true,quizBankFile:bankFile});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{if(app.server.listening) await new Promise(resolve=>app.server.close(resolve));app.store.db.close();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  let base=`http://127.0.0.1:${app.server.address().port}`;
  const login=await app.store.login({grade:1,classNo:1,number:1},'1234');
  const other=await app.store.login({grade:1,classNo:1,number:2},'4321');
  const player=app.store.authenticate(login.token);
  async function request(route,body,token=login.token){
    const r=await fetch(base+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),Authorization:`Bearer ${token}`},body:body?JSON.stringify(body):undefined});
    return {status:r.status,data:await r.json()};
  }
  assert.equal((await request('/api/quiz-subjects',null,'')).status,401);
  assert.equal((await request('/api/quiz-subjects')).data.subjects.length,2);
  const run=(await request('/api/quiz-runs',{subject:'영어'})).data;
  assert.equal(run.questions.length,10);
  assert.deepEqual(run.questions.map(q=>q.correctIndex),Array.from({length:10},(_,i)=>i%4));
  assert.equal(run.questions[0].explanation,'해설 1');
  assert.equal((await request('/api/quiz-runs',{subject:'영어'})).data.id,run.id);
  assert.equal((await request('/api/quiz-runs/submit',{runId:run.id,answers:[0]})).status,400);
  for(const growth of [-10,110,15,30.5,'30',null]) {
    assert.equal((await request('/api/quiz-runs/submit',{runId:run.id,growth})).status,400);
  }
  assert.equal((await request('/api/quiz-runs/submit',{runId:run.id,growth:30},other.token)).status,404);
  const result=await request('/api/quiz-runs/submit',{runId:run.id,growth:30});
  assert.equal(result.status,200);
  assert.deepEqual(Object.keys(result.data).sort(),['claimed','result'],'제출 응답에 문제·정답을 재전송하지 않음');
  assert.deepEqual(JSON.parse(app.store.db.prepare('SELECT result_json FROM quiz_runs WHERE id=?').get(run.id).result_json),
    {correctCount:3,growth:30},'기기 채점은 선택한 답 대신 성장률 요약만 저장');
  assert.equal(result.data.result.correctCount,3);
  assert.equal(result.data.result.growth,30);
  assert.equal(app.store.snapshot(player).progress,0,'채점만으로 성장하지 않음');
  assert.equal((await request('/api/quiz-runs/submit',{runId:run.id,growth:100})).data.result.correctCount,3,'요약 재제출로 점수 변경 불가');
  assert.equal((await request('/api/quiz-runs/submit',{runId:run.id,answers:Array.from({length:10},(_,i)=>i%4)})).data.result.correctCount,3,'첫 채점은 불변');
  const sameDay=(await request('/api/quiz-runs',{subject:'영어'})).data;
  assert.equal(sameDay.id,run.id,'같은 날 같은 과목은 새 세트를 배정하지 않음');
  assert.equal(sameDay.result.growth,30);
  const science=(await request('/api/quiz-runs',{subject:'과학'})).data;
  await request('/api/quiz-runs/submit',{runId:science.id,growth:30});
  assert.equal((await request('/api/quiz-runs',{subject:'과학'})).data.id,science.id,'다른 과목은 같은 날 별도로 한 세트 풀이');
  // Reward collection can be resumed after the 08:00 reset and a process restart.
  clock+=120000;
  await new Promise(resolve=>app.server.close(resolve));
  app.store.db.exec('DROP INDEX quiz_runs_pending_growth; ALTER TABLE quiz_runs DROP COLUMN reward_remaining; PRAGMA user_version=8');
  app.store.db.close();
  app=createBackend({directory,now:()=>clock,dailyLimit:true,quizBankFile:bankFile});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${app.server.address().port}`;
  assert.equal((await request('/api/quiz-runs',{subject:'영어'})).data.id,run.id);
  const claim={kind:'quiz-set',runId:run.id,requestId:'quiz-set-claim-0001'};
  const previous=(await request('/api/quiz-subjects')).data.subjects.find(s=>s.subject==='영어');
  assert.equal(previous.previousUnclaimed,true);
  assert.equal(previous.canOpen,true);
  assert.equal(previous.completed,false);
  assert.equal((await request('/api/actions',claim)).data.state.progress,30);
  assert.equal((await request('/api/actions',claim)).data.state.progress,30);
  assert.equal((await request('/api/actions',{...claim,requestId:'quiz-set-claim-0002'})).data.state.progress,30,'새 요청 번호로도 중복 보상 없음');
  const next=(await request('/api/quiz-runs',{subject:'영어'})).data;
  assert.notEqual(next.setId,run.setId);
  assert.equal((await request('/api/actions',{...claim,runId:next.id})).status,409);
  assert.equal((await request('/api/actions',{kind:'quiz-set',runId:science.id,requestId:'science-claim-0001'})).data.state.progress,60,'과목별 보상은 특별 미션 일일 제한과 독립');
  const allCorrect=Array.from({length:10},(_,i)=>i%4);
  await request('/api/quiz-runs/submit',{runId:next.id,growth:100});
  assert.equal((await request('/api/actions',{kind:'quiz-set',runId:next.id,requestId:'english-claim-0003'})).data.state.progress,100,'성장도 100% 상한');
  assert.equal(app.store.snapshot(player).pendingGrowth,60);
  assert.equal((await request('/api/quiz-runs',{subject:'영어'})).data.id,next.id,'완료한 날에는 같은 결과 조회');
  clock+=86400000;
  login.token=(await app.store.login({grade:1,classNo:1,number:1},'1234')).token;
  assert.equal((await request('/api/quiz-runs',{subject:'영어'})).status,409,'모든 세트를 소진하면 반복 출제하지 않음');
  assert.equal((await request('/api/quiz-subjects')).data.subjects.find(s=>s.subject==='영어').canOpen,false);
  // Live file changes import once. Invalid edits leave the previous bank usable.
  const extra=set('english-3');bank.sets.push(extra);fs.writeFileSync(bankFile,JSON.stringify(bank));
  const added=(await request('/api/quiz-runs',{subject:'영어'})).data;
  assert.equal(added.setId,'english-3');
  const duplicate=set('english-4');duplicate.questions[0]=extra.questions[0];
  assert.throws(()=>app.store.quizBank.importSets({sets:[duplicate]}),/이미 다른 세트/);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM quiz_sets WHERE id=?').get('english-4').n,0);
  // A newly assigned snapshot retains answers while the teacher edits the source.
  bank.sets.at(-1).questions[0].correctIndex=3;fs.writeFileSync(bankFile,JSON.stringify(bank));
  await request('/api/quiz-subjects');
  assert.equal((await request('/api/quiz-runs/submit',{runId:added.id,answers:allCorrect})).data.result.correctCount,10);
  app.store.action(player,{kind:'harvest',requestId:'carry-first-harvest'});
  const plant={kind:'plant',cropId:'apple',requestId:'carry-first-plant'};
  const full=app.store.action(player,plant);
  assert.equal(full.growth,100,'결과 창을 닫기 전에 끊겨도 다음 씨앗에 지급');
  assert.equal(full.state.progress,100);
  assert.equal(full.state.pendingGrowth,60,'한 씨앗에 다 담지 못한 영양분 보존');
  assert.deepEqual(app.store.action(player,plant),full,'심기 재시도는 같은 결과');
  app.store.action(player,{kind:'harvest',requestId:'carry-next-harvest'});
  const carried=app.store.action(player,{kind:'plant',cropId:'peach',requestId:'carry-second-plant'});
  assert.equal(carried.growth,60);
  assert.equal(carried.state.progress,60);
  assert.equal(carried.state.pendingGrowth,0);
  const profile={grade:1,classNo:1,number:1};app.store.deleteStudent(profile);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM quiz_runs WHERE player_id=?').get(player).n,0);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM quiz_sets').get().n,4,'학생 삭제 후 공통 문제 보존');
  const secondSession=await app.store.login({grade:1,classNo:1,number:2},'4321');
  const second=app.store.authenticate(secondSession.token);
  const empty=app.store.quizBank.start(second,{subject:'영어'});
  app.store.quizBank.submit(second,{runId:empty.id,growth:0});
  app.store.db.prepare('UPDATE players SET progress=100 WHERE id=?').run(second);
  assert.equal(app.store.action(second,{kind:'quiz-set',runId:empty.id,requestId:'zero-growth-000001'}).growth,0,'0점도 완료되고 보상은 없음');
  const pending=app.store.quizBank.start(second,{subject:'과학'});
  app.store.quizBank.submit(second,{runId:pending.id,answers:allCorrect});
  app.store.action(second,{kind:'harvest',requestId:'pending-harvest-001'});
  const banked=app.store.action(second,{kind:'quiz-set',runId:pending.id,requestId:'pending-growth-0001'});
  assert.equal(banked.state.progress,0);
  assert.equal(banked.state.pendingGrowth,100,'빈 밭에서 받은 퀴즈 보상 보관');
  assert.equal(app.store.action(second,{kind:'plant',cropId:'apple',requestId:'pending-plant-00001'}).growth,100);
  assert.equal(app.store.action(second,{kind:'quiz-set',runId:pending.id,requestId:'pending-growth-0001'}).state.progress,100);
  fs.writeFileSync(bankFile,'{ invalid JSON');
  assert.equal((await request('/api/quiz-subjects',null,secondSession.token)).data.subjects.length,2,'JSON 오류에도 마지막 정상 문제 유지');
  // Upgrade an existing v1 database without losing students and harvests.
  await new Promise(resolve=>app.server.close(resolve));
  app.store.db.exec('DROP TABLE quiz_runs; DROP TABLE quiz_sets; PRAGMA user_version=1;');app.store.db.close();
  app=createBackend({directory,now:()=>clock});
  assert.equal(app.store.db.prepare('PRAGMA user_version').get().user_version,17);
  assert.equal(app.store.snapshot(second).harvestCount,1);
});

test('퀴즈 오전 8시 경계와 참가자별 12세트 중복 방지',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-quiz-morning-'));
  let clock=Date.parse('2026-11-12T14:59:59.999Z');
  const {store}=createBackend({directory,now:()=>clock});
  t.after(()=>{store.db.close();fs.rmSync(directory,{recursive:true,force:true});});
  const bank={sets:Array.from({length:12},(_,i)=>({id:`science-${i+1}`,subject:'과학',title:`과학 ${i+1}`,
    questions:Array.from({length:10},(_,j)=>({question:`과학 ${i+1}번 세트 ${j+1}번 문제`,choices:['A','B','C','D'],correctIndex:0})),
  }))};
  store.quizBank.importSets(bank);
  const players=await Promise.all([1,2].map(async number=>
    store.authenticate((await store.login({grade:1,classNo:1,number},'1234')).token)));
  const start=player=>store.quizBank.start(player,{subject:'과학'});
  const first=players.map(start), seen=first.map(r=>new Set(r.questions.map(q=>q.question)));
  assert.equal(first[0].day,'2026-11-12');
  clock=Date.parse('2026-11-12T15:00:00Z');
  assert.equal(start(players[0]).id,first[0].id,'서울 자정은 전날 세트 유지');
  clock=Date.parse('2026-11-12T22:59:59.999Z');
  assert.equal(start(players[0]).id,first[0].id);
  clock++;
  assert.equal(store.quizBank.subjects(players[0]).day,'2026-11-13');
  assert.throws(()=>store.quizBank.submit(players[0],{runId:first[0].id,growth:0}),e=>e.status===409);
  for(let day=1;day<12;day++){
    for(const [i,player] of players.entries()){
      const run=start(player);
      assert.ok(run.questions.every(q=>!seen[i].has(q.question)),'미제출 세트를 포함해 다시 배정하지 않음');
      for(const q of run.questions) seen[i].add(q.question);
      assert.equal(start(player).id,run.id);
    }
    clock+=86400000;
  }
  for(const [i,player] of players.entries()){
    assert.equal(seen[i].size,120);
    assert.throws(()=>start(player),e=>e.status===409);
  }
});

test('직접 작성 특별 미션의 완료 상태는 날짜·재시작과 무관하고 관리자 적용으로만 바뀐다',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-custom-persistent-'));
  let clock=Date.parse('2026-11-22T22:59:59.999Z');
  const options={directory,now:()=>clock,dailyLimit:true};
  let {store}=createBackend(options);
  t.after(()=>{store.db.close();fs.rmSync(directory,{recursive:true,force:true});});
  const player=store.authenticate((await store.login({grade:1,classNo:1,number:1},'1234')).token);
  const legacy={week:'2026-11-16',title:'이전 특별 미션',description:'실천 내용을 확인합니다.'};
  store.importSpecial(legacy);
  assert.equal(store.special().title,legacy.title);
  clock+=3*86400000;
  assert.equal(store.special().title,legacy.title,'기존 주차 자료도 시간이 지나면 유지');
  const custom={kind:'custom',title:'직접 작성 미션',description:'실천 내용을 확인합니다.'};
  const first=store.specialMissions.activate({...custom,requestId:'custom-activate-0001'});
  const action={kind:'special',missionId:first.id,missionRevision:first.revision,requestId:'custom-complete-0001'};
  assert.equal(store.specialCompleted(player,first),false);
  assert.equal(store.action(player,action).state.progress,30);
  assert.equal(store.action(player,action).state.progress,30);
  store.db.exec('DROP TABLE special_completions; PRAGMA user_version=12');
  store.db.close();
  clock+=8*86400000;
  ({store}=createBackend(options));
  assert.equal(store.special().id,first.id);
  assert.equal(store.specialCompleted(player,store.special()),true,'이관과 영수증 정리 뒤에도 완료 유지');
  assert.throws(()=>store.action(player,{...action,requestId:'custom-complete-0002'}),e=>e.status===409);
  const next=store.specialMissions.activate({...custom,requestId:'custom-activate-0002'});
  assert.equal(store.specialCompleted(player,next),false);
  assert.equal(store.action(player,{...action,missionId:next.id,missionRevision:next.revision,requestId:'custom-complete-0003'}).state.progress,60);
  const later=store.specialMissions.activate({...custom,requestId:'custom-activate-0003'});
  assert.equal(store.action(player,{...action,missionId:later.id,missionRevision:later.revision,requestId:'custom-complete-0004'}).state.progress,90);
  store.specialMissions.activate({kind:'off',requestId:'custom-deactivate-01'});
  clock+=86400000;
  assert.equal(store.special(),null);
});

test('관리자 인증, 학생 목록, PIN 변경, 권한 분리와 만료',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-admin-'));
  let clock=Date.parse('2026-11-12T00:00:00Z');
  const password='6815',credentials=await hashPassword(password);
  const app=createBackend({directory,now:()=>clock,adminCredentials:credentials});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.store.db.close();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  const request=async(route,{token,body,origin}={})=>{
    const response=await fetch(base+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json(),headers:response.headers};
  };
  const profile={grade:1,classNo:2,number:3};
  const student=await app.store.login(profile,'1234');
  const id=app.store.authenticate(student.token);
  app.store.action(id,{kind:'water',requestId:'admin-water-0000001'});
  app.store.resetWater(profile);
  app.store.action(id,{kind:'water',requestId:'admin-water-0000002'});
  app.store.action(id,{kind:'harvest',requestId:'admin-harvest-00001'});
  app.store.action(id,{kind:'plant',cropId:'apple',requestId:'admin-plant-0000001'});
  app.store.resetWater(profile);
  app.store.action(id,{kind:'water',requestId:'admin-water-0000003'});
  await app.store.login({grade:2,classNo:1,number:1},'4321');
  assert.equal((await request('/api/admin/students')).status,401);
  assert.equal((await request('/api/admin/students',{token:student.token})).status,401);
  assert.equal((await request('/api/admin/teachers')).status,401);
  assert.equal((await request('/api/admin/teachers',{token:student.token})).status,401);
  assert.equal((await request('/api/admin/reset-pin',{token:student.token,body:{profile,pin:'0246'}})).status,401);
  assert.equal((await request('/api/admin/session',{body:{password},origin:'https://untrusted.example'})).status,403);
  assert.equal((await request('/api/admin/session',{body:{password},origin:'http://localhost:4174'})).status,200);
  for(let n=0;n<5;n++) assert.equal((await request('/api/admin/session',{body:{password:'9999'}})).status,401);
  assert.equal((await request('/api/admin/session',{body:{password}})).status,429);
  clock+=16*60000;
  const login=await request('/api/admin/session',{body:{password},origin:base});
  assert.equal(login.status,200);
  const token=login.data.token;
  assert.deepEqual((await request('/api/admin/teachers',{token})).data,{teachers:[]});
  const teacher=await app.store.login({role:'teacher',name:' 가상교사 '},'4321');
  const teacherId=app.store.authenticate(teacher.token);
  app.store.action(teacherId,{kind:'water',requestId:'admin-teacher-water-0'});
  app.store.resetWater(teacher.state.profile);
  app.store.action(teacherId,{kind:'water',requestId:'admin-teacher-water-1'});
  app.store.action(teacherId,{kind:'harvest',requestId:'admin-teacher-harvest'});
  app.store.action(teacherId,{kind:'plant',cropId:'apple',requestId:'admin-teacher-plant'});
  app.store.resetWater(teacher.state.profile);
  app.store.action(teacherId,{kind:'water',requestId:'admin-teacher-water-2'});
  const teachers=await request('/api/admin/teachers',{token});
  assert.equal(teachers.headers.get('cache-control'),'no-store');
  assert.deepEqual(teachers.data,{teachers:[{name:'가상교사',cropId:'apple',progress:50,pinConfigured:1,harvestCount:1}]});
  assert.equal((await request('/api/admin/teachers',{token:teacher.token})).status,401);
  assert.equal((await request('/api/me',{token})).status,401);
  const list=await request('/api/admin/students',{token});
  assert.equal(list.headers.get('cache-control'),'no-store');
  assert.deepEqual(list.data.students,[{grade:1,classNo:2,number:3,cropId:'apple',progress:50,pinConfigured:1,harvestCount:1},{grade:2,classNo:1,number:1,cropId:'rice',progress:0,pinConfigured:1,harvestCount:0}]);
  assert.ok(!JSON.stringify(list.data).includes('pin_hash'));
  assert.ok(!JSON.stringify(list.data).includes('pin_salt'));
  assert.ok(!JSON.stringify(list.data).includes('1234'));
  const resetWater='/api/admin/reset-water';
  assert.equal((await request(resetWater,{body:{profile}})).status,401);
  assert.equal((await request(resetWater,{token:student.token,body:{profile}})).status,401);
  assert.equal((await request(resetWater,{token,body:{profile},origin:'https://untrusted.example'})).status,403);
  assert.equal((await request(resetWater,{token,body:{profile:{...profile,number:30}}})).status,404);
  const beforeReset=app.store.snapshot(id);
  assert.ok(beforeReset.waterCooldownMs>0);
  assert.equal((await request(resetWater,{token,body:{profile},origin:'http://localhost:4174'})).status,200);
  const afterReset=(await request('/api/me',{token:student.token})).data.state;
  assert.equal(afterReset.waterCooldownMs,0);
  assert.equal(afterReset.progress,beforeReset.progress);
  assert.equal(afterReset.harvestCount,beforeReset.harvestCount);
  assert.equal(afterReset.revision,beforeReset.revision+1);
  assert.equal((await request(resetWater,{token,body:{profile}})).status,200);
  assert.equal(app.store.snapshot(id).revision,afterReset.revision);
  assert.ok(app.store.snapshot(teacherId).waterCooldownMs>0,'선택하지 않은 참가자의 제한 유지');
  assert.equal((await request(resetWater,{token,body:{profile:teacher.state.profile}})).status,200);
  assert.equal(app.store.snapshot(teacherId).waterCooldownMs,0);
  assert.equal((await request('/api/admin/reset-pin',{token,body:{profile,pin:'12'}})).status,400);
  assert.equal((await request('/api/admin/reset-pin',{token,body:{profile:{...profile,number:30},pin:'0246'}})).status,404);
  assert.equal((await request('/api/admin/reset-pin',{token,origin:base,body:{profile,pin:'0246'}})).status,200);
  assert.equal((await request('/api/me',{token:student.token})).status,401);
  const changed=await app.store.login(profile,'0246');
  assert.equal(changed.state.progress,50);assert.equal(changed.state.harvestCount,1);
  const page=await fetch(base+'/admin');
  assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.ok(!(await page.text()).includes(password));
  for(const file of ['admin.js','admin.css']) assert.equal((await fetch(base+'/admin/'+file)).status,200);
  assert.equal((await request('/api/admin/logout',{token,body:{}})).status,200);
  assert.equal((await request('/api/admin/students',{token})).status,401);
  assert.equal((await request('/api/admin/teachers',{token})).status,401);
  const next=(await request('/api/admin/session',{body:{password}})).data.token;
  clock+=30*60000;
  assert.equal((await request('/api/admin/students',{token:next})).status,401);
  assert.equal((await request('/api/admin/teachers',{token:next})).status,401);
  await assert.rejects(hashPassword('x'));
});

test('관리자 학생 삭제: 권한, 전체 기록 정리, 롤백, 재등록과 진행 중 인증 차단',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-delete-'));
  const app=createBackend({directory,now:()=>Date.parse('2026-11-12T00:00:00Z'),adminCredentials:await hashPassword('8642')});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.store.db.close();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  const request=async(route,{token,body={},origin}={})=>{
    const response=await fetch(`http://127.0.0.1:${app.server.address().port}`+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
    return {status:response.status,data:await response.json()};
  };
  const profile={grade:1,classNo:1,number:1};
  const other=await app.store.login({...profile,classNo:2},'4321');
  const student=await app.store.login(profile,'1234'),id=app.store.authenticate(student.token);
  app.store.action(id,{kind:'water',requestId:'delete-water-00000'});
  app.store.resetWater(profile);
  app.store.action(id,{kind:'water',requestId:'delete-water-00001'});
  app.store.action(id,{kind:'harvest',requestId:'delete-harvest-00001'});
  app.store.importQuiz({week:'2026-11-09',questions:[{question:'삭제 검증',choices:['가','나','다','라'],correctIndex:0}]});
  const quiz=app.store.quiz();
  app.store.checkAnswer(id,{week:quiz.week,revision:quiz.revision,questionId:quiz.questions[0].id,answerIndex:0});
  const route='/api/admin/delete-student';
  assert.equal((await request(route,{body:{profile}})).status,401);
  assert.equal((await request(route,{token:student.token,body:{profile}})).status,401);
  const token=(await request('/api/admin/session',{body:{password:'8642'}})).data.token;
  assert.equal((await request(route,{token,body:{profile},origin:'https://untrusted.example'})).status,403);
  for(const invalid of [null,{}, {...profile,number:0}, {...profile,grade:'1'}, {...profile,classNo:100}])
    assert.equal((await request(route,{token,body:{profile:invalid}})).status,400);
  assert.equal((await request(route,{token,body:{profile:{...profile,number:30}}})).status,404);
  const tables=['sessions','harvests','quiz_answers','action_receipts'];
  const counts=()=>tables.map(table=>app.store.db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE player_id=?`).get(id).n);
  const before=counts();assert.ok(before.every(n=>n>0));
  app.store.db.exec("CREATE TRIGGER block_delete BEFORE DELETE ON players BEGIN SELECT RAISE(ABORT,'test rollback'); END");
  assert.throws(()=>app.store.deleteStudent(profile),/test rollback/);
  assert.deepEqual(counts(),before);assert.equal(app.store.snapshot(id).harvestCount,1);
  app.store.db.exec('DROP TRIGGER block_delete');
  assert.equal((await request(route,{token,body:{profile}})).status,200);
  assert.deepEqual(counts(),[0,0,0,0]);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM players WHERE id=?').get(id).n,0);
  assert.throws(()=>app.store.authenticate(student.token),error=>error.status===401);
  assert.equal(app.store.snapshot(app.store.authenticate(other.token)).cropId,'rice');
  assert.equal(app.store.quiz().questions.length,1);
  assert.deepEqual(app.store.db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal((await request(route,{token,body:{profile}})).status,404);
  const fresh=await app.store.login(profile,'1357');
  assert.equal(fresh.state.harvestCount,0);assert.equal(fresh.state.progress,0);
  const pending=Promise.allSettled([app.store.login(profile,'1357'),app.store.resetPin(profile,'2468')]);
  app.store.deleteStudent(profile);
  const replacement=await app.store.login(profile,'5678');
  const results=await pending;
  assert.ok(results.every(r=>r.status==='rejected'));
  assert.equal(results[0].reason.status,401);assert.equal(results[1].reason.status,409);
  assert.equal((await app.store.login(profile,'5678')).state.progress,0);
  assert.equal(app.store.snapshot(app.store.authenticate(replacement.token)).harvestCount,0);
});

test('선생님 관리: PIN 변경·권한·전체 기록 삭제·롤백·이름 정규화·재등록 경쟁',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-teacher-admin-'));
  const app=createBackend({directory,now:()=>Date.parse('2026-11-17T00:00:00Z'),adminCredentials:await hashPassword('8642')});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.store.db.close();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const request=async(route,body,token,origin)=>{const r=await fetch(base+'/api/admin/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  const profile={role:'teacher',name:'관리교사'};
  app.store.importRoster([{grade:1,classNo:1,number:1,name:'관리교사'}]);
  const teacher=await app.store.login(profile,'1234'),id=app.store.authenticate(teacher.token);
  const second=await app.store.login(profile,'1234');
  const student=await app.store.login({grade:1,classNo:1,number:1},'4321');
  const studentId=app.store.authenticate(student.token);
  const other=await app.store.login({role:'teacher',name:'다른교사'},'4321');
  app.store.action(id,{kind:'water',requestId:'teacher-admin-water-0'});
  app.store.resetWater(profile);
  app.store.action(id,{kind:'water',requestId:'teacher-admin-water-1'});
  app.store.action(id,{kind:'harvest',requestId:'teacher-admin-harvest'});
  app.store.action(id,{kind:'plant',cropId:'apple',requestId:'teacher-admin-plant'});
  app.store.importQuiz({week:'2026-11-16',questions:[{question:'관리 검증',choices:['가','나','다','라'],correctIndex:0}]});
  const quiz=app.store.quiz();app.store.checkAnswer(id,{week:quiz.week,revision:quiz.revision,questionId:quiz.questions[0].id,answerIndex:0});
  app.store.quizBank.importSets({sets:[{id:'admin-teacher-set',subject:'영어',title:'검증',questions:Array.from({length:10},(_,i)=>({question:'검증 '+i,choices:['가','나','다','라'],correctIndex:0}))}]});
  app.store.quizBank.start(id,{subject:'영어'});
  const mission=app.store.specialMissions.activate({kind:'gratitude',requestId:'teacher-admin-gratitude'});
  app.store.specialMissions.submit(id,{missionId:mission.id,requestId:'teacher-admin-sent-message',recipient:{grade:1,classNo:1,number:1},message:'항상 친절하게 도와주어서 정말 고맙습니다.'});
  const incoming=app.store.specialMissions.submit(studentId,{missionId:mission.id,requestId:'teacher-admin-received-message',recipient:profile,message:'항상 따뜻하게 가르쳐 주셔서 정말 감사합니다.'});
  app.store.specialMissions.deliver(incoming.id,profile.name);
  const special=app.store.specialMissions.activate({kind:'patriots',requestId:'teacher-admin-special'});
  app.store.specialMissions.submitQuiz(id,{missionId:special.id,answers:Array(10).fill(0)});
  const beforeState=app.store.snapshot(id),studentState=app.store.snapshot(studentId);
  const admin=(await request('session',{password:'8642'})).data.token;
  for(const route of ['reset-pin','delete-teacher']){
    const body=route==='reset-pin'?{profile,pin:'0246'}:{name:profile.name};
    for(const token of [undefined,student.token,teacher.token])assert.equal((await request(route,body,token)).status,401);
    assert.equal((await request(route,body,admin,'https://untrusted.example')).status,403);
  }
  for(const name of [undefined,null,'',' ','가\n나','가'.repeat(51)]){
    assert.equal((await request('delete-teacher',{name},admin)).status,400);
    assert.equal((await request('reset-pin',{profile:{role:'teacher',name},pin:'0246'},admin)).status,400);
  }
  assert.equal((await request('delete-teacher',{name:'없는교사'},admin)).status,404);
  assert.equal((await request('reset-pin',{profile,pin:'12'},admin)).status,400);
  assert.equal((await request('delete-student',{profile},admin)).status,400);
  const normalized={role:'teacher',name:'  '+profile.name.normalize('NFD')+'  '};
  assert.equal((await request('reset-pin',{profile:normalized,pin:'0246'},admin)).status,200);
  for(const token of [teacher.token,second.token])assert.throws(()=>app.store.authenticate(token),e=>e.status===401);
  await assert.rejects(app.store.login(profile,'1234'),e=>e.status===401);
  const changed=await app.store.login(profile,'0246');
  assert.deepEqual(changed.state,beforeState);
  const tables=['sessions','harvests','quiz_answers','action_receipts','quiz_runs','gratitude_messages','special_quiz_results'];
  const counts=()=>tables.map(table=>app.store.db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE player_id=?`).get(id).n);
  const before=counts();assert.ok(before.every(n=>n>0));
  app.store.db.exec(`CREATE TRIGGER block_teacher_delete BEFORE DELETE ON players WHEN OLD.id=${id} BEGIN SELECT RAISE(ABORT,'test teacher rollback'); END`);
  assert.throws(()=>app.store.deleteTeacher(profile.name),/test teacher rollback/);
  assert.deepEqual(counts(),before);assert.equal(app.store.authenticate(changed.token),id);
  app.store.db.exec('DROP TRIGGER block_teacher_delete');
  assert.equal((await request('delete-teacher',{name:normalized.name},admin)).status,200);
  assert.deepEqual(counts(),tables.map(()=>0));
  assert.throws(()=>app.store.authenticate(changed.token),e=>e.status===401);
  assert.deepEqual(app.store.snapshot(studentId),studentState);
  assert.equal(app.store.snapshot(app.store.authenticate(other.token)).profile.name,'다른교사');
  assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM gratitude_messages WHERE id=?').get(incoming.id).n,1);
  assert.equal(app.store.specialMissions.review('all',0).items[0].recipientRegistered,false);
  assert.deepEqual(app.store.db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal((await request('delete-teacher',{name:profile.name},admin)).status,404);
  const fresh=await app.store.login(profile,'1357');assert.equal(fresh.state.harvestCount,0);assert.equal(fresh.state.progress,0);
  const pending=Promise.allSettled([app.store.login(profile,'1357'),app.store.resetPin(profile,'2468')]);
  app.store.deleteTeacher(profile.name);
  const replacement=await app.store.login(profile,'5678');
  const results=await pending;assert.ok(results.every(r=>r.status==='rejected'));
  assert.equal(results[0].reason.status,401);assert.equal(results[1].reason.status,409);
  assert.equal((await app.store.login(profile,'5678')).state.harvestCount,0);
  assert.equal(app.store.authenticate(replacement.token)>0,true);
});

test('교사용 대시보드: 정답률·학급 필터·동시 로그인·수령 중복 방지',async t=>{
  const {createDashboard}=require('./operator/server.cjs');
  const {request:send}=require('node:http');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-operator-test-'));
  const app=createBackend({directory});
  const db=app.store.db,origin='https://dashboard.example';
  const student={grade:1,classNo:1,number:1};
  const second={grade:1,classNo:2,number:1};
  app.store.importRoster([{...student,name:'가상 <학생>'},{...second,name:'다른반 학생'},{...student,number:2,name:'미가입학생'}]);
  const password='7359';
  const dashboard=createDashboard(db,{origin,credentials:await hashPassword(password),now:()=>Date.UTC(2026,10,30,3)});
  t.after(async()=>{
    await new Promise(resolve=>dashboard.close(resolve));
    db.close();
    fs.rmSync(directory,{recursive:true,force:true});
  });
  await new Promise(resolve=>dashboard.listen(0,'127.0.0.1',resolve));
  await app.store.login(student,'1935');
  await app.store.login(second,'1935');
  await app.store.login({role:'teacher',name:'가상선생님'},'1935');
  const harvest=db.prepare("INSERT INTO harvests(player_id,crop_id,created_at) VALUES(?,'rice','2026-11-30T03:00:00.000Z')");
  for (const [id,total] of [[1,15],[2,5],[3,10]]) for (let n=0;n<total;n++) harvest.run(id);
  db.exec("INSERT INTO quiz_sets(id,subject,title,questions_json) VALUES('operator-fixture','과학','가상', '[]')");
  const submitted=db.prepare("INSERT INTO quiz_runs(player_id,day,subject,set_id,questions_json,result_json) VALUES(?,?,'과학','operator-fixture',?,?)");
  for (const [id,day,correct] of [[1,'2026-11-29',3],[1,'2026-11-30',5],[2,'2026-11-30',9],[3,'2026-11-30',10]]) {
    submitted.run(id,day,JSON.stringify(Array(10).fill({})),JSON.stringify({correctCount:correct}));
  }
  db.exec(`INSERT INTO special_campaigns(request_id,kind,title,description,created_at,content_json)
    VALUES('operator-fixture','patriots','가상','','2026-11-30','{}')`);
  db.prepare("INSERT INTO special_quiz_results VALUES(1,1,?,0,'2026-11-30')").run(JSON.stringify({
    correctCount:6,questions:Array(10).fill({}),
  }));
  const request=(route,{cookie,body,headers={}}={})=>new Promise((resolve,reject)=>{
    const payload=body?new URLSearchParams(body).toString():null;
    const req=send({host:'127.0.0.1',port:dashboard.address().port,path:'/dashboard'+route,
      method:payload?'POST':'GET',headers:{Host:'dashboard.example',...(cookie?{Cookie:cookie}:{}),
        ...(payload?{Origin:origin,'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(payload)}:{}),...headers}},
    res=>{
      const chunks=[];
      res.on('data',chunk=>chunks.push(chunk));
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,html:Buffer.concat(chunks).toString('utf8')}));
    });
    req.on('error',reject);req.end(payload);
  });
  const guest=await request('/');
  assert.match(guest.html,/대시보드 로그인/);
  assert.doesNotMatch(guest.html,/가상.*학생/);
  assert.match(guest.headers['content-security-policy'],/connect-src 'none'/);
  assert.equal(guest.headers['access-control-allow-origin'],undefined);
  const login=async()=>{
    const response=await request('/sign-in',{body:{password}});
    assert.equal(response.status,303);
    const raw=response.headers['set-cookie'][0];
    assert.match(raw,/HttpOnly; SameSite=Strict; Secure/);
    return raw.split(';')[0];
  };
  const [first,other]=await Promise.all([login(),login()]);
  assert.notEqual(first,other);
  const overall=await request('/',{cookie:first});
  assert.match(overall.html,/56\.7%/);
  assert.match(overall.html,/가상 &lt;학생&gt;/);
  assert.doesNotMatch(overall.html,/가상선생님/);
  const filtered=await request('/?grade=1&classNo=1&scope=class',{cookie:other});
  assert.match(filtered.html,/40%/);
  assert.match(filtered.html,/60%/);
  assert.match(filtered.html,/반별 순위/);
  assert.doesNotMatch(filtered.html,/다른반 학생/);
  assert.equal((await request('/',{cookie:first,headers:{'Sec-Fetch-Mode':'cors'}})).status,403);
  const teachers=await request('/pickup/search',{cookie:first,body:{query:'가상',role:'teacher'}});
  assert.match(teachers.html,/가상선생님/);
  assert.match(teachers.html,/과일 젤리/);
  assert.doesNotMatch(teachers.html,/가상 &lt;학생&gt;/);
  assert.equal((await request('/pickup/redeem',{body:{person:'1',key:'student:1:1:1'}})).status,401);
  assert.equal((await request('/pickup/redeem',{cookie:first,body:{person:'1',key:'student:1:1:1'},
    headers:{Origin:'https://cropgrow.sangsangbar.com'}})).status,403);
  const submit={person:'1',key:'student:1:1:1'};
  const [left,right]=await Promise.all([request('/pickup/redeem',{cookie:first,body:submit}),
    request('/pickup/redeem',{cookie:other,body:submit})]);
  assert.equal(left.status,303);
  assert.equal(right.headers.location,left.headers.location);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM prize_pickups').get().n,1);
  assert.equal(db.prepare('SELECT prize FROM prize_pickups').get().prize,'빼빼로');
  await request('/sign-out',{cookie:first,body:{action:'logout'}});
  assert.match((await request('/pickup',{cookie:other})).html,/수령 완료 명단/);
  assert.match((await request('/pickup',{cookie:first})).html,/대시보드 로그인/);
});

test('관리자 비밀번호 미설정 시 로그인 차단',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-admin-disabled-'));
  const app=createBackend({directory});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.store.db.close();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/admin/session`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'6815'})});
  assert.equal(response.status,503);
});

test('Cloudflare 관리자 직접 연결: 허용 Origin·preflight·관리자와 학생 인증 분리',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-admin-cors-'));
  const origin='https://cropgrow.sangsangbar.com';
  const app=createBackend({directory,origins:[origin],adminCredentials:await hashPassword('6815')});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.store.db.close();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const preflight=await fetch(base+'/api/admin/delete-student',{method:'OPTIONS',headers:{Origin:origin,
    'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
  const headers={Origin:origin,'Content-Type':'application/json'};
  assert.equal((await fetch(base+'/api/admin/students',{headers})).status,401);
  assert.equal((await fetch(base+'/api/admin/traffic',{headers})).status,401);
  const student=await app.store.login({grade:1,classNo:1,number:1},'1234');
  assert.equal((await fetch(base+'/api/admin/students',{headers:{...headers,Authorization:'Bearer '+student.token}})).status,401);
  assert.equal((await fetch(base+'/api/admin/traffic',{headers:{...headers,Authorization:'Bearer '+student.token}})).status,401);
  const login=await fetch(base+'/api/admin/session',{method:'POST',headers,body:JSON.stringify({password:'6815'})});
  assert.equal(login.status,200);const {token}=await login.json();
  const authorized={...headers,Authorization:'Bearer '+token};
  assert.equal((await fetch(base+'/api/admin/students',{headers:authorized})).status,200);
  const traffic=await fetch(base+'/api/admin/traffic',{headers:authorized});
  assert.equal(traffic.status,200);assert.equal(typeof (await traffic.json()).available,'boolean');
  assert.equal((await fetch(base+'/api/admin/students',{headers:{...authorized,Origin:'https://untrusted.example'}})).status,403);
  assert.equal((await fetch(base+'/api/admin/session',{method:'OPTIONS',headers:{Origin:'https://untrusted.example'}})).status,403);
  const prepare=app.store.db.prepare.bind(app.store.db);let unavailable=false;
  t.mock.method(app.store.db,'prepare',sql=>{if(unavailable&&sql==='SELECT 1 FROM players LIMIT 1')throw Error('test database unavailable');return prepare(sql);});
  unavailable=true;assert.equal((await fetch(base+'/api/health')).status,500);
  unavailable=false;assert.equal((await fetch(base+'/api/health')).status,200);
});

test('DB 복원, PIN, 서버 판정, 중복 보상 방지, CORS와 클래스 분리',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-backend-'));
  let clock=Date.parse('2026-11-10T22:40:00Z');
  const frontendOrigin='https://cropgrow.sangsangbar.com';
  const origins=[frontendOrigin,'http://localhost:4174'];
  let app=createBackend({directory,now:()=>clock,origins});
  const start=async()=>{await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${app.server.address().port}`;};
  const stop=async()=>{await new Promise(resolve=>app.server.close(resolve));app.store.db.close();};
  let base=await start();
  t.after(async()=>{await stop();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  const api=async(route,{token,body,origin}={})=>{
    const response=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json()};
  };
  const preflight=await fetch(base+'/api/actions',{method:'OPTIONS',headers:{Origin:frontendOrigin,
    'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-origin'),frontendOrigin);
  assert.match(preflight.headers.get('access-control-allow-headers'),/Authorization/);
  assert.match(preflight.headers.get('access-control-allow-headers'),/Content-Type/);
  assert.equal((await fetch(base+'/api/actions',{method:'OPTIONS',headers:{Origin:'https://untrusted.example'}})).status,403);
  const profile={grade:1,classNo:1,number:1};
  assert.equal((await api('/api/session',{body:{profile,pin:'12'}})).status,400);
  const login=await api('/api/session',{body:{profile,pin:'1234'},origin:frontendOrigin});
  assert.equal(login.status,200); const token=login.data.token;
  assert.equal(login.data.state.progress,0);
  assert.deepEqual(login.data.quiz,(await api('/api/quizzes/current',{token})).data);
  assert.deepEqual(login.data.garden,(await api('/api/garden?page=0',{token})).data);
  assert.equal(login.data.mission,null);
  assert.ok(!JSON.stringify(login.data).includes('pin_hash'));
  assert.equal((await api('/api/me')).status,401);
  assert.equal((await api('/api/me',{token,origin:'https://untrusted.example'})).status,403);
  assert.equal((await api('/api/me',{token,origin:'http://localhost:4174'})).status,200);
  const directState=await fetch(base+'/api/me',{headers:{Origin:frontendOrigin,Authorization:'Bearer '+token}});
  assert.equal(directState.status,200);
  assert.equal(directState.headers.get('access-control-allow-origin'),frontendOrigin);
  assert.equal(directState.headers.get('cache-control'),'no-store');
  for(let i=0;i<5;i++) assert.equal((await api('/api/session',{body:{profile,pin:'9999'}})).status,401);
  assert.equal((await api('/api/session',{body:{profile,pin:'1234'}})).status,429);
  clock+=16*60000;
  assert.equal((await api('/api/session',{body:{profile,pin:'1234'}})).status,200);
  const water={kind:'water',requestId:'water-request-0001'};
  const duplicate=await Promise.all([api('/api/actions',{token,body:water,origin:frontendOrigin}),api('/api/actions',{token,body:water,origin:frontendOrigin})]);
  duplicate.forEach(x=>{
    assert.equal(x.data.state.progress,50);
    assert.equal(x.data.state.waterCooldownMs,4*60000);
  });
  // 배포 전 날짜만 저장했던 기록도 요청 시각으로 오전 8시 경계를 복원합니다.
  app.store.db.prepare('UPDATE players SET water_day=? WHERE id=?').run('2026-11-11',app.store.authenticate(token));
  clock=Date.parse('2026-11-10T22:59:59.999Z');
  assert.equal((await api('/api/me',{token})).data.state.waterCooldownMs,1);
  assert.equal((await api('/api/actions',{token,body:{...water,requestId:'water-request-0002'}})).status,409);
  clock=Date.parse('2026-11-10T23:00:00Z');
  assert.equal((await api('/api/me',{token})).data.state.waterCooldownMs,0);
  const nextWater=(await api('/api/actions',{token,body:{kind:'water',requestId:'water-request-0002'}})).data.state;
  assert.equal(nextWater.progress,100);
  assert.equal(nextWater.waterCooldownMs,24*3600000);
  const harvest={kind:'harvest',requestId:'harvest-request-01'};
  assert.equal((await api('/api/actions',{token,body:harvest})).data.state.harvestCount,1);
  assert.equal((await api('/api/actions',{token,body:harvest})).data.state.harvestCount,1);
  const garden=await api('/api/garden?page=0',{token}); assert.equal(garden.data.total,1); assert.equal(garden.data.items.length,1);
  const other=await api('/api/session',{body:{profile:{...profile,classNo:2},pin:'4321'}});
  assert.equal((await api('/api/garden',{token:other.data.token})).data.total,0);
  await api('/api/actions',{token,body:{kind:'plant',cropId:'apple',requestId:'plant-request-0001'}});
  assert.equal((await api('/api/actions',{token,body:{kind:'water',requestId:'water-request-0003'}})).status,409);
  const quiz={week:'2026-11-09',questions:[{question:'문제',choices:['보기 가','보기 나','보기 다','보기 라'],correctIndex:2,explanation:'정답 해설'}]};
  assert.throws(()=>app.store.importQuiz({...quiz,questions:[{...quiz.questions[0],choices:['가','나']}]}));
  app.store.importQuiz(quiz);
  const publicQuiz=(await api('/api/quizzes/current',{token})).data;
  assert.equal(publicQuiz.questions[0].choices.length,4);
  assert.ok(!JSON.stringify(publicQuiz).includes('correctIndex'));
  assert.ok(!JSON.stringify(publicQuiz).includes('정답 해설'));
  const prepared=(await api('/api/session',{body:{profile,pin:'1234'}})).data;
  assert.deepEqual(prepared.quiz,publicQuiz);
  assert.deepEqual(prepared.garden,(await api('/api/garden?page=0',{token})).data);
  assert.ok(!JSON.stringify(prepared).includes('correctIndex'));
  assert.ok(!JSON.stringify(prepared).includes('정답 해설'));
  const answer={week:publicQuiz.week,revision:publicQuiz.revision,questionId:publicQuiz.questions[0].id,answerIndex:0};
  assert.deepEqual((await api('/api/quizzes/check',{token,body:answer})).data,{correct:false,explanation:''});
  assert.equal((await api('/api/actions',{token,body:{kind:'quiz',missionRevision:publicQuiz.revision,requestId:'quiz-request-00001'}})).status,409);
  assert.equal((await api('/api/quizzes/check',{token,body:{...answer,answerIndex:2}})).data.correct,true);
  assert.equal((await api('/api/actions',{token,body:{kind:'quiz',missionRevision:publicQuiz.revision,requestId:'quiz-request-00002'}})).data.state.progress,30);
  app.store.importQuiz(quiz);
  assert.equal((await api('/api/quizzes/check',{token,body:answer})).status,409);
  await backup(app.store.db,path.join(directory,'backup.sqlite'));
  await stop(); app=createBackend({directory,now:()=>clock,origins}); base=await start();
  const restored=(await api('/api/me',{token})).data.state;
  assert.equal(restored.harvestCount,1); assert.equal(restored.collectionCounts.rice,1); assert.equal(restored.progress,30);
  assert.ok(fs.statSync(path.join(directory,'backup.sqlite')).size>0);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) count FROM action_receipts').get().count,5);
  // 조회 500회 검증. 로컬 테스트 클라이언트의 TCP 연결 폭주를 피하고 동시성은 50으로 제한합니다.
  for(let batch=0;batch<10;batch++) {
    const reads=await Promise.all(Array.from({length:50},()=>api('/api/me',{token})));
    assert.ok(reads.every(r=>r.status===200 && r.data.state.harvestCount===1));
  }
  await app.store.resetPin(profile,'0246');
  assert.equal((await api('/api/me',{token})).status,401);
  assert.equal((await api('/api/session',{body:{profile,pin:'0246'}})).status,200);
});
