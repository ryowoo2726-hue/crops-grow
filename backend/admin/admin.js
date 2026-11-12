'use strict';
const $=id=>document.getElementById(id);
const crops={'rice':'벼','sweet-potato':'고구마','soybean':'콩','radish':'무','napa-cabbage':'배추','apple':'사과','persimmon':'감','peach':'복숭아','watermelon':'수박','chili-pepper':'고추','mango':'망고'};
let token='',students=[],selected=null,sessionTimer;
for(let n=1;n<=10;n++) $('class-no').add(new Option(`${n}반`,String(n)));
function signedOut(){clearTimeout(sessionTimer);token='';students=[];selected=null;$('students').replaceChildren();$('dashboard').hidden=true;$('logout').hidden=true;$('login').hidden=false;if($('pin-dialog').open)$('pin-dialog').close();}
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
    cell(row,`${student.harvestCount}개`,'harvest');$('students').append(row);
  }
}
async function refresh(){
  const session=token;
  $('refresh').disabled=true;
  try{const data=await api('students');if(token!==session||!token)return;students=data.students;render();$('updated').textContent=new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul'})+' 갱신';$('message').textContent='';}
  finally{$('refresh').disabled=false;}
}
$('login-form').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;$('message').textContent='';
  try{const password=$('password').value;$('password').value='';const data=await api('session',{password});token=data.token;sessionTimer=setTimeout(()=>{signedOut();$('message').textContent='관리자 로그인 시간이 만료되었습니다. 다시 로그인하세요.';},30*60000);$('login').hidden=true;$('dashboard').hidden=false;$('logout').hidden=false;await refresh();}
  catch(error){$('message').textContent=error.message;}
  finally{button.disabled=false;}
};
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
