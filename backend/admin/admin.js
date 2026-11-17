'use strict';
const $=id=>document.getElementById(id);
const apiBase=document.querySelector('meta[name="growgame-api-base"]').content;
let checkingBackend=false;
function backendStatus(online){
  const status=$('backend-status'),state=online?'online':'offline';
  if(status.dataset.state!==state){status.dataset.state=state;status.textContent=online?'백엔드 연결됨':'백엔드 응답 없음';}
  const time=new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul'});
  $('backend-checked').textContent=online?`${time} 확인 · 15초마다 자동 확인`:`${time} 확인 · 서버 또는 네트워크 상태를 확인하세요.`;
  if(!online)$('traffic-note').textContent='서버 응답이 없어 마지막으로 확인한 사용량을 표시합니다.';
}
async function checkBackend(){
  if(checkingBackend)return;
  checkingBackend=true;$('check-backend').disabled=true;$('check-backend').setAttribute('aria-busy','true');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);
  try{
    const response=await fetch(apiBase+'/api/health',{cache:'no-store',signal:controller.signal});
    const online=response.ok&&(await response.json()).ok===true;
    backendStatus(online);
    if(online&&token)await loadTraffic();
  }catch{backendStatus(false);}
  finally{clearTimeout(timeout);checkingBackend=false;$('check-backend').disabled=false;$('check-backend').removeAttribute('aria-busy');}
}
$('check-backend').onclick=checkBackend;
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkBackend();});
setInterval(()=>{if(!document.hidden)checkBackend();},15000);
checkBackend();
const crops={'rice':'벼','sweet-potato':'고구마','soybean':'콩','radish':'무','napa-cabbage':'배추','apple':'사과','persimmon':'감','peach':'복숭아','watermelon':'수박','chili-pepper':'고추','mango':'망고'};
let token='',students=[],selected=null,deleting=null,sessionTimer;
let messagePage=0,messagePages=1,messageRequest=0,activationRequest=null;
for(let n=1;n<=12;n++) $('class-no').add(new Option(`${n}반`,String(n)));
function signedOut(){clearTimeout(sessionTimer);token='';students=[];selected=null;deleting=null;$('students').replaceChildren();$('teachers').replaceChildren();$('review-messages').replaceChildren();$('dashboard').hidden=true;$('logout').hidden=true;$('login').hidden=false;for(const id of ['traffic-tx','traffic-rx','traffic-percent'])$(id).textContent='—';$('traffic-progress').value=0;for(const id of ['pin-dialog','delete-dialog'])if($(id).open)$(id).close();}
async function api(route,body){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(apiBase+'/api/admin/'+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:controller.signal});
    const data=await response.json();
    backendStatus(true);
    if(!response.ok){if(response.status===401&&route!=='session')signedOut();throw Error(data.error||'요청을 처리하지 못했습니다.');}
    return data;
  }catch(error){if(error instanceof TypeError||error.name==='AbortError'){backendStatus(false);throw Error('서버에 연결하지 못했습니다. 서버 실행 상태를 확인하고 다시 시도하세요.');}throw error;}
  finally{clearTimeout(timeout);}
}
function cell(row,text,className){const td=document.createElement('td');td.textContent=text;if(className)td.className=className;row.append(td);return td;}
function count(id,value,unit){const small=document.createElement('small');small.textContent=unit;$(id).replaceChildren(document.createTextNode(String(value)),small);}
function growthCell(row,progress){const growth=cell(row,'');const group=document.createElement('div');group.className='growth';const bar=document.createElement('progress');bar.max=100;bar.value=progress;bar.setAttribute('aria-label','작물 성장도');const percent=document.createElement('span');percent.textContent=`${progress}%`;group.append(bar,percent);growth.append(group);}
function formatBytes(bytes){const units=['B','KB','MB','GB','TB'];let unit=0;while(bytes>=1000&&unit<units.length-1){bytes/=1000;unit++;}return new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(bytes)+' '+units[unit];}
async function loadTraffic(){
  const session=token;
  try{
    const data=await api('traffic');
    if(!token||token!==session)return;
    if(!data.available){$('traffic-note').textContent='이 서버에서 네트워크 사용량을 수집할 수 없습니다.';return;}
    $('traffic-month').textContent=data.month+' · UTC 기준';
    $('traffic-tx').textContent=formatBytes(data.txBytes);$('traffic-rx').textContent=formatBytes(data.rxBytes);
    const percent=data.txBytes/data.freeOutboundBytes*100;
    $('traffic-percent').textContent=percent.toFixed(3)+'%';$('traffic-progress').value=Math.min(100,percent);
    const since=new Date(data.measuredSince).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
    const checked=new Date(data.sampledAt).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul'});
    $('traffic-note').textContent=`${since}부터 수집 · ${checked} 갱신`;
  }catch{if(token===session)$('traffic-note').textContent='사용량을 불러오지 못했습니다. 연결 복구 후 다시 확인합니다.';}
}
function profileOf(person){return person.role==='teacher'?{role:'teacher',name:person.name}:{grade:person.grade,classNo:person.classNo,number:person.number};}
function pinCell(row,person){
  const pin=cell(row,'');const status=document.createElement('span');status.className='pin-status';status.textContent=person.pinConfigured?'설정됨':'미설정';pin.append(status);
  const button=document.createElement('button');button.className='pin-button';button.textContent='변경';button.setAttribute('aria-label',participantLabel(person)+' 비밀번호 변경');
  button.onclick=()=>{selected=person;$('pin-title').textContent=(person.role==='teacher'?'선생님':'학생')+' 비밀번호 변경';$('pin-student').textContent=participantLabel(person);$('new-pin').value='';$('pin-error').textContent='';$('pin-dialog').showModal();$('new-pin').focus();};pin.append(button);
}
function deleteCell(row,person){
  const remove=document.createElement('button');remove.className='delete-button';remove.textContent='삭제';remove.setAttribute('aria-label',participantLabel(person)+(person.role==='teacher'?'':' 학생')+' 삭제');
  remove.onclick=()=>{deleting=person;$('delete-title').textContent=(person.role==='teacher'?'선생님':'학생')+' 정보를 삭제할까요?';$('delete-student').textContent=participantLabel(person);$('delete-error').textContent='';$('delete-dialog').showModal();$('cancel-delete').focus();};cell(row,'').append(remove);
}
function render(){
  const list=students.filter(s=>(!$('grade').value||s.grade===Number($('grade').value))&&(!$('class-no').value||s.classNo===Number($('class-no').value)));
  count('student-count',list.length,'명');count('growing-count',list.filter(s=>s.cropId).length,'개');count('harvest-count',list.reduce((n,s)=>n+s.harvestCount,0),'개');
  $('students').replaceChildren();$('empty').hidden=list.length>0;
  for(const student of list){
    const row=document.createElement('tr');
    cell(row,`${student.grade}학년 ${student.classNo}반`);cell(row,`${student.number}번`);
    pinCell(row,student);
    cell(row,student.cropId?(crops[student.cropId]||'알 수 없는 작물'):'심기 대기','crop');
    growthCell(row,student.progress);
    cell(row,`${student.harvestCount}개`,'harvest');
    deleteCell(row,student);
    $('students').append(row);
  }
}
async function loadTeachers(){
  const session=token;
  $('refresh-teachers').disabled=true;
  try{
    const {teachers}=await api('teachers');
    if(!token||token!==session)return;
    count('teacher-count',teachers.length,'명');count('teacher-growing-count',teachers.filter(t=>t.cropId).length,'개');count('teacher-harvest-count',teachers.reduce((n,t)=>n+t.harvestCount,0),'개');
    $('teachers').replaceChildren();$('teachers-empty').hidden=teachers.length>0;
    for(const teacher of teachers){const person={...teacher,role:'teacher'};const row=document.createElement('tr');cell(row,teacher.name);pinCell(row,person);cell(row,teacher.cropId?(crops[teacher.cropId]||'알 수 없는 작물'):'심기 대기','crop');growthCell(row,teacher.progress);cell(row,`${teacher.harvestCount}개`,'harvest');deleteCell(row,person);$('teachers').append(row);}
    $('teachers-updated').textContent=new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul'})+' 갱신';
  }finally{$('refresh-teachers').disabled=false;}
}
async function refresh(){
  const session=token;
  $('refresh').disabled=true;
  try{const [data]=await Promise.all([api('students'),loadTeachers(),loadSpecial(),loadMessages(0),loadTraffic()]);if(token!==session||!token)return;students=data.students;render();$('updated').textContent=new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul'})+' 갱신';$('message').textContent='';}
  finally{$('refresh').disabled=false;}
}
$('login-form').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;$('message').textContent='';
  try{const password=$('password').value;$('password').value='';const data=await api('session',{password});token=data.token;sessionTimer=setTimeout(()=>{signedOut();$('message').textContent='관리자 로그인 시간이 만료되었습니다. 다시 로그인하세요.';},30*60000);$('login').hidden=true;$('dashboard').hidden=false;$('logout').hidden=false;await refresh();}
  catch(error){$('message').textContent=error.message;}
  finally{button.disabled=false;}
};

for(const button of document.querySelectorAll('[data-panel]')) {
  button.onclick=()=>{
    for(const panel of document.querySelectorAll('.admin-panel')) panel.hidden=panel.id!==button.dataset.panel;
    for(const tab of document.querySelectorAll('[data-panel]')) tab.setAttribute('aria-pressed',String(tab===button));
    if(button.dataset.panel==='messages-panel') loadMessages(0).catch(showError);
    if(button.dataset.panel==='special-panel') loadSpecial().catch(showError);
    if(button.dataset.panel==='teachers-panel') loadTeachers().catch(showError);
  };
}
function showError(error){$('message').textContent=error.message;}
function participantLabel(profile){return profile.role==='teacher'?`${profile.name} 선생님`:`${profile.grade}학년 ${profile.classNo}반 ${profile.number}번 ${profile.name||''}`.trim();}
async function loadSpecial(){
  const session=token,data=await api('special');
  if(!token||token!==session)return;
  $('active-special').textContent=data.mission?`현재 적용 중 · ${data.mission.title}${data.mission.id?' · 미션 '+data.mission.id:''}`:'현재 적용된 특별미션이 없습니다.';
}
$('special-kind').onchange=()=>{
  activationRequest=null;
  $('custom-special').hidden=$('special-kind').value!=='custom';
  $('special-help').textContent={gratitude:'학생의 학년·반·번호 또는 선생님 이름을 골라 10글자 이상의 감사 메시지를 작성합니다. 서로 다른 4명까지 작성하며 한 명당 성장도 25%를 받습니다. 등록 안 된 선생님에게 쓴 글은 해당 이름으로 참여한 뒤 전송할 수 있습니다.',patriots:'11월 17일 순국선열의 날 포스터를 읽고 10문제를 풉니다. 정답당 10%, 최대 100%를 한 번 지급하며 남은 영양분은 다음 작물로 이어집니다.',farmers:'11월 11일 농업인의 날 포스터를 읽고 10문제를 풉니다. 정답당 10%, 최대 100%를 한 번 지급하며 남은 영양분은 다음 작물로 이어집니다.',custom:'제목과 내용을 입력하면 학생에게 바로 표시됩니다. 완료한 학생에게 성장도 30%를 지급합니다.',off:'적용하면 학생의 특별미션이 종료됩니다.'}[$('special-kind').value];
};
for(const id of ['special-title','special-description'])$(id).oninput=()=>{activationRequest=null;};
$('special-form').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;
  const body={kind:$('special-kind').value,title:$('special-title').value,description:$('special-description').value};
  activationRequest??=crypto.randomUUID();
  try{await api('special',{...body,requestId:activationRequest});activationRequest=null;await loadSpecial();$('message').textContent='선택한 특별미션을 새로 적용했습니다.';}
  catch(error){showError(error);}
  finally{button.disabled=false;}
};
async function loadMessages(page){
  const session=token,request=++messageRequest;
  const data=await api('messages',{status:$('message-status').value,page});
  if(!token||session!==token||request!==messageRequest)return;
  messagePage=data.page;messagePages=data.pages;
  $('review-messages').replaceChildren();$('messages-empty').hidden=data.items.length>0;
  for(const item of data.items){
    const card=document.createElement('article');card.className='review-message';
    const title=document.createElement('h2');title.textContent=participantLabel(item.sender)+' → '+participantLabel(item.recipient);
    const date=document.createElement('p');date.textContent=new Date(item.createdAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' · 미션 '+item.missionId;
    const body=document.createElement('p');body.className='message-body';body.textContent=item.body;
    const actions=document.createElement('div');actions.className='message-actions';
    const unregistered=item.recipientRegistered===false;
    if(unregistered){const status=document.createElement('span');status.className='registration-status';status.textContent='등록 안됨';actions.append(status);const hint=document.createElement('p');hint.className='registration-help';hint.textContent='받는 선생님이 같은 이름으로 게임에 참여한 뒤 목록을 새로고침하면 전송할 수 있습니다.';card.append(title,date,body,hint);}
    else card.append(title,date,body);
    const send=document.createElement('button');send.textContent=item.deliveredAt?'전송 완료':'전송';send.disabled=!!item.deliveredAt||unregistered;
    if(unregistered)send.title='받는 선생님이 같은 이름으로 게임에 참여한 뒤 목록을 새로고침하세요.';
    send.onclick=async()=>{send.disabled=true;send.textContent='전송 중…';send.setAttribute('aria-busy','true');try{await api('send-message',{id:item.id});await loadMessages(messagePage);$('message').textContent='받는 사람에게 메시지를 전송했습니다.';}catch(error){showError(error);send.disabled=false;send.textContent='전송';}finally{send.removeAttribute('aria-busy');}};
    actions.append(send);card.append(actions);$('review-messages').append(card);
  }
  $('message-page').textContent=`${messagePage+1} / ${messagePages}`;
  $('previous-messages').disabled=messagePage===0;$('next-messages').disabled=messagePage+1===messagePages;
}
$('message-status').onchange=()=>loadMessages(0).catch(showError);
$('refresh-messages').onclick=()=>Promise.all([loadMessages(messagePage),loadSpecial()]).catch(showError);
$('previous-messages').onclick=()=>loadMessages(messagePage-1).catch(showError);
$('next-messages').onclick=()=>loadMessages(messagePage+1).catch(showError);
$('refresh').onclick=()=>refresh().catch(error=>{$('message').textContent=error.message;});
$('refresh-teachers').onclick=()=>loadTeachers().catch(showError);
$('grade').onchange=render;$('class-no').onchange=render;
$('logout').onclick=async()=>{try{await api('logout',{});}catch(error){$('message').textContent=error.message;}finally{signedOut();$('password').focus();}};
$('cancel-pin').onclick=()=>{$('pin-dialog').close();};
$('pin-dialog').onclose=()=>{if(!$('pin-dialog').open){$('new-pin').value='';selected=null;}};
$('pin-dialog').oncancel=event=>{if($('cancel-pin').disabled)event.preventDefault();};
$('pin-form').onsubmit=async event=>{
  event.preventDefault();if(!selected)return;const button=event.submitter;button.disabled=true;$('cancel-pin').disabled=true;$('pin-error').textContent='';
  const person=selected,session=token;
  try{await api('reset-pin',{profile:profileOf(person),pin:$('new-pin').value});if(token!==session||!token)return;$('pin-dialog').close();$('new-pin').value='';await refresh();$('message').textContent=(person.role==='teacher'?'선생님':'학생')+' 비밀번호를 변경했습니다. 새 비밀번호를 본인에게 직접 알려주세요.';}
  catch(error){if($('pin-dialog').open)$('pin-error').textContent=error.message;else $('message').textContent=error.message;}
  finally{button.disabled=false;$('cancel-pin').disabled=false;}
};
$('cancel-delete').onclick=()=>$('delete-dialog').close();
$('delete-dialog').onclose=()=>{if(!$('delete-dialog').open)deleting=null;};
$('delete-dialog').oncancel=event=>{if($('confirm-delete').disabled)event.preventDefault();};
$('delete-form').onsubmit=async event=>{
  event.preventDefault();if(!deleting||$('confirm-delete').disabled)return;
  const person=deleting,session=token,teacher=person.role==='teacher';
  const profile=profileOf(person);
  $('confirm-delete').disabled=true;$('cancel-delete').disabled=true;$('delete-error').textContent='';
  try{
    await api(teacher?'delete-teacher':'delete-student',teacher?{name:person.name}:{profile});if(token!==session||!token)return;
    $('delete-dialog').close();
    if(teacher)await loadTeachers();else{students=students.filter(s=>s.grade!==profile.grade||s.classNo!==profile.classNo||s.number!==profile.number);render();}
    $('message').textContent=participantLabel(person)+(teacher?'의':' 학생과')+' 게임 기록을 삭제했습니다.';
  }catch(error){if($('delete-dialog').open)$('delete-error').textContent=error.message;else $('message').textContent=error.message;}
  finally{$('confirm-delete').disabled=false;$('cancel-delete').disabled=false;}
};
