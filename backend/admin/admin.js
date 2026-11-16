'use strict';
const $=id=>document.getElementById(id);
const crops={'rice':'벼','sweet-potato':'고구마','soybean':'콩','radish':'무','napa-cabbage':'배추','apple':'사과','persimmon':'감','peach':'복숭아','watermelon':'수박','chili-pepper':'고추','mango':'망고'};
let token='',students=[],selected=null,deleting=null,sessionTimer;
let messagePage=0,messagePages=1,messageRequest=0,activationRequest=null;
for(let n=1;n<=12;n++) $('class-no').add(new Option(`${n}반`,String(n)));
function signedOut(){clearTimeout(sessionTimer);token='';students=[];selected=null;deleting=null;$('students').replaceChildren();$('review-messages').replaceChildren();$('dashboard').hidden=true;$('logout').hidden=true;$('login').hidden=false;for(const id of ['pin-dialog','delete-dialog'])if($(id).open)$(id).close();}
async function api(route,body){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch('/api/admin/'+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:controller.signal});
    const data=await response.json();
    if(!response.ok){if(response.status===401&&route!=='session')signedOut();throw Error(data.error||'요청을 처리하지 못했습니다.');}
    return data;
  }catch(error){if(error instanceof TypeError||error.name==='AbortError')throw Error('서버에 연결하지 못했습니다. 서버 실행 상태를 확인하고 다시 시도하세요.');throw error;}
  finally{clearTimeout(timeout);}
}
function cell(row,text,className){const td=document.createElement('td');td.textContent=text;if(className)td.className=className;row.append(td);return td;}
function render(){
  const list=students.filter(s=>(!$('grade').value||s.grade===Number($('grade').value))&&(!$('class-no').value||s.classNo===Number($('class-no').value)));
  const count=(id,value,unit)=>{const small=document.createElement('small');small.textContent=unit;$(id).replaceChildren(document.createTextNode(String(value)),small);};
  count('student-count',list.length,'명');count('growing-count',list.filter(s=>s.cropId).length,'개');count('harvest-count',list.reduce((n,s)=>n+s.harvestCount,0),'개');
  $('students').replaceChildren();$('empty').hidden=list.length>0;
  for(const student of list){
    const row=document.createElement('tr');
    cell(row,`${student.grade}학년 ${student.classNo}반`);cell(row,`${student.number}번`);
    const pin=cell(row,'');const status=document.createElement('span');status.className='pin-status';status.textContent=student.pinConfigured?'설정됨':'미설정';pin.append(status);
    const button=document.createElement('button');button.className='pin-button';button.textContent='변경';button.setAttribute('aria-label',`${student.grade}학년 ${student.classNo}반 ${student.number}번 비밀번호 변경`);
    button.onclick=()=>{selected=student;$('pin-student').textContent=`${student.grade}학년 ${student.classNo}반 ${student.number}번`;$('new-pin').value='';$('pin-error').textContent='';$('pin-dialog').showModal();$('new-pin').focus();};pin.append(button);
    cell(row,student.cropId?(crops[student.cropId]||'알 수 없는 작물'):'심기 대기','crop');
    const growth=cell(row,'');const group=document.createElement('div');group.className='growth';const bar=document.createElement('progress');bar.max=100;bar.value=student.progress;bar.setAttribute('aria-label','작물 성장도');const percent=document.createElement('span');percent.textContent=`${student.progress}%`;group.append(bar,percent);growth.append(group);
    cell(row,`${student.harvestCount}개`,'harvest');
    const remove=document.createElement('button');remove.className='delete-button';remove.textContent='삭제';remove.setAttribute('aria-label',`${student.grade}학년 ${student.classNo}반 ${student.number}번 학생 삭제`);
    remove.onclick=()=>{deleting=student;$('delete-student').textContent=`${student.grade}학년 ${student.classNo}반 ${student.number}번`;$('delete-error').textContent='';$('delete-dialog').showModal();$('cancel-delete').focus();};cell(row,'').append(remove);
    $('students').append(row);
  }
}
async function refresh(){
  const session=token;
  $('refresh').disabled=true;
  try{const [data]=await Promise.all([api('students'),loadSpecial(),loadMessages(0)]);if(token!==session||!token)return;students=data.students;render();$('updated').textContent=new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul'})+' 갱신';$('message').textContent='';}
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
  $('special-help').textContent={gratitude:'학생의 학년·반·번호를 골라 10글자 이상의 감사 메시지를 작성합니다. 서로 다른 4명까지 작성하며 한 명당 성장도 25%를 받습니다.',patriots:'11월 17일 순국선열의 날 포스터를 읽고 10문제를 풉니다. 정답당 10%, 최대 100%를 한 번 지급하며 남은 영양분은 다음 작물로 이어집니다.',farmers:'11월 11일 농업인의 날 포스터를 읽고 10문제를 풉니다. 정답당 10%, 최대 100%를 한 번 지급하며 남은 영양분은 다음 작물로 이어집니다.',custom:'제목과 내용을 입력하면 학생에게 바로 표시됩니다. 완료한 학생에게 성장도 30%를 지급합니다.',off:'적용하면 학생의 특별미션이 종료됩니다.'}[$('special-kind').value];
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
    const send=document.createElement('button');send.textContent=item.deliveredAt?'전송 완료':'전송';send.disabled=!!item.deliveredAt;
    send.onclick=async()=>{send.disabled=true;send.textContent='전송 중…';send.setAttribute('aria-busy','true');try{await api('send-message',{id:item.id});await loadMessages(messagePage);$('message').textContent='학생에게 메시지를 전송했습니다.';}catch(error){showError(error);send.disabled=false;send.textContent='전송';}finally{send.removeAttribute('aria-busy');}};
    actions.append(send);card.append(title,date,body,actions);$('review-messages').append(card);
  }
  $('message-page').textContent=`${messagePage+1} / ${messagePages}`;
  $('previous-messages').disabled=messagePage===0;$('next-messages').disabled=messagePage+1===messagePages;
}
$('message-status').onchange=()=>loadMessages(0).catch(showError);
$('refresh-messages').onclick=()=>Promise.all([loadMessages(messagePage),loadSpecial()]).catch(showError);
$('previous-messages').onclick=()=>loadMessages(messagePage-1).catch(showError);
$('next-messages').onclick=()=>loadMessages(messagePage+1).catch(showError);
$('refresh').onclick=()=>refresh().catch(error=>{$('message').textContent=error.message;});
$('grade').onchange=render;$('class-no').onchange=render;
$('logout').onclick=async()=>{try{await api('logout',{});}catch(error){$('message').textContent=error.message;}finally{signedOut();$('password').focus();}};
$('cancel-pin').onclick=()=>{$('pin-dialog').close();};
$('pin-dialog').onclose=()=>{$('new-pin').value='';selected=null;};
$('pin-form').onsubmit=async event=>{
  event.preventDefault();if(!selected)return;const button=event.submitter;button.disabled=true;$('cancel-pin').disabled=true;$('pin-error').textContent='';
  try{await api('reset-pin',{profile:{grade:selected.grade,classNo:selected.classNo,number:selected.number},pin:$('new-pin').value});$('pin-dialog').close();$('new-pin').value='';await refresh();$('message').textContent='학생 비밀번호를 변경했습니다. 새 비밀번호를 학생에게 직접 알려주세요.';}
  catch(error){if($('pin-dialog').open)$('pin-error').textContent=error.message;else $('message').textContent=error.message;}
  finally{button.disabled=false;$('cancel-pin').disabled=false;}
};
$('cancel-delete').onclick=()=>$('delete-dialog').close();
$('delete-dialog').onclose=()=>{if(!$('delete-dialog').open)deleting=null;};
$('delete-dialog').oncancel=event=>{if($('confirm-delete').disabled)event.preventDefault();};
$('delete-form').onsubmit=async event=>{
  event.preventDefault();if(!deleting||$('confirm-delete').disabled)return;
  const student=deleting,session=token;
  const profile={grade:student.grade,classNo:student.classNo,number:student.number};
  $('confirm-delete').disabled=true;$('cancel-delete').disabled=true;$('delete-error').textContent='';
  try{
    await api('delete-student',{profile});if(token!==session||!token)return;
    students=students.filter(s=>s.grade!==profile.grade||s.classNo!==profile.classNo||s.number!==profile.number);
    $('delete-dialog').close();render();$('message').textContent=`${profile.grade}학년 ${profile.classNo}반 ${profile.number}번 학생과 게임 기록을 삭제했습니다.`;
  }catch(error){if($('delete-dialog').open)$('delete-error').textContent=error.message;else $('message').textContent=error.message;}
  finally{$('confirm-delete').disabled=false;$('cancel-delete').disabled=false;}
};
