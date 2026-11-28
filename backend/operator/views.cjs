const {prizes,classLabel,participantDetails,participantLabel} = require('./records.cjs');

const root = '/dashboard/';
const pickup = '/dashboard/pickup';
const report = '/dashboard/report';
const reportSubjects = ['과학','영어','역사'];
const number = new Intl.NumberFormat('ko-KR');
const percent = new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1});
const time = new Intl.DateTimeFormat('ko-KR',{
  timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',hour12:false,
});
const reportDate = new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium'});
const reportTime = new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'});
const escape = value => String(value ?? '').replace(/[&<>"']/g,char =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const integer = value => number.format(value);
const accuracy = (correct,total) => total ? `${percent.format(correct/total*100)}%` : '—';
const score = (correct,total) => total ? `${integer(correct)} / ${integer(total)}문항` : '제출 없음';
const pathWith = (path,filters) => escape(path+'?'+new URLSearchParams(filters));

function layout(title,active,content) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escape(title)} · 작물키우기</title>
  <link rel="stylesheet" href="/dashboard/dashboard.css">
</head>
<body class="${active ?? ''}">
  <a class="skip" href="#main">본문으로</a>
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="${root}"><span class="brand-mark" aria-hidden="true"></span>작물키우기</a>
      ${active ? `<nav aria-label="대시보드 메뉴">
        <a href="${root}" ${active==='ranking'?'aria-current="page"':''}>랭킹·통계</a>
        <a href="${report}" ${active==='report'?'aria-current="page"':''}>퀴즈 보고서</a>
        <a href="${pickup}" ${active==='pickup'?'aria-current="page"':''}>상품 수령</a>
      </nav>
      <form method="post" action="/dashboard/sign-out"><button class="plain" type="submit">로그아웃</button></form>` : ''}
    </div>
  </header>
  <main id="main">${content}</main>
</body>
</html>`;
}

function loginPage(next,error) {
  return layout('대시보드 로그인',null,`
    <section class="login panel" aria-labelledby="login-title">
      <h1 id="login-title">대시보드 로그인</h1>
      <p>학생 랭킹과 상품 수령 기록을 확인합니다.</p>
      <form method="post" action="/dashboard/sign-in" class="login-form">
        <input type="hidden" name="next" value="${escape(next)}">
        <label for="password">비밀번호</label>
        <input id="password" name="password" type="password" inputmode="numeric"
          autocomplete="current-password" minlength="4" maxlength="64" required ${error?'aria-describedby="login-error" aria-invalid="true"':''}>
        ${error?`<p id="login-error" class="error" role="alert">${escape(error)}</p>`:''}
        <button type="submit">로그인</button>
      </form>
    </section>`);
}

function options(values,selected) {
  return values.map(([value,label]) =>
    `<option value="${escape(value)}"${String(value)===selected?' selected':''}>${escape(label)}</option>`).join('');
}

const sum = (totals,item) => {
  for (const field of ['harvestCount','dailyCorrect','dailyTotal','specialCorrect','specialTotal']) totals[field] += item[field];
  totals.students++;
  return totals;
};
const emptyTotals = () => ({harvestCount:0,dailyCorrect:0,dailyTotal:0,specialCorrect:0,specialTotal:0,students:0});
const rowScore = (row,metric) => {
  if (metric==='harvest') return row.harvestCount;
  return row[metric+'Total'] ? row[metric+'Correct']/row[metric+'Total'] : -1;
};
const kpi = (name,value,detail = '') =>
  `<article class="kpi"><h2>${name}</h2><strong>${value}</strong>${detail?`<small>${detail}</small>`:''}</article>`;
function chartLine(label,value,max,summary,detail = '',color = '') {
  return `<li class="chart-line ${color}">
    <div><strong>${label}</strong><span>${summary}</span></div>
    ${value===null?'':`<meter min="0" max="${max}" value="${value}" aria-hidden="true"></meter>`}
    ${detail?`<small>${detail}</small>`:''}
  </li>`;
}

function pageNav(path,page,pages,filters) {
  if (pages<2) return '';
  return `<nav class="pagination" aria-label="페이지 이동">
    ${page>1?`<a class="button secondary" href="${pathWith(path,{...filters,page:page-1})}">이전</a>`:'<span></span>'}
    <span>${page} / ${pages}쪽</span>
    ${page<pages?`<a class="button secondary" href="${pathWith(path,{...filters,page:page+1})}">다음</a>`:'<span></span>'}
  </nav>`;
}

function rankingPage(students,params) {
  const grade = /^[1-3]$/.test(params.get('grade') ?? '') ? params.get('grade') : '';
  const classNo = /^[1-9]\d?$/.test(params.get('classNo') ?? '') ? params.get('classNo') : '';
  const scope = params.get('scope')==='class' ? 'class' : 'student';
  const metric = ['daily','special'].includes(params.get('metric')) ? params.get('metric') : 'harvest';
  const filters = {grade,classNo,metric,scope};
  const inGrade = students.filter(student => !grade || student.grade===Number(grade));
  const classNumbers = [...new Set(inGrade.map(student=>student.classNo))].sort((a,b)=>a-b);
  if (classNo && !classNumbers.includes(Number(classNo))) classNumbers.push(Number(classNo));
  const filtered = inGrade.filter(student => !classNo || student.classNo===Number(classNo));
  const totals = filtered.reduce(sum,emptyTotals());
  const classes = new Map();
  for (const student of filtered) {
    const label = classLabel(student);
    if (!classes.has(label)) classes.set(label,{...emptyTotals(),label});
    sum(classes.get(label),student);
  }
  const allClasses = [...classes.values()];
  const top = allClasses.slice().sort((a,b)=>b.harvestCount-a.harvestCount).slice(0,6);
  const maxHarvest = Math.max(1,...top.map(row=>row.harvestCount));
  const rows = (scope==='class'?allClasses:filtered).slice().sort((a,b)=>rowScore(b,metric)-rowScore(a,metric));
  const pages = Math.max(1,Math.ceil(rows.length/15));
  const page = Math.min(pages,Math.max(1,Number(params.get('page')) || 1));
  const offset = Math.floor(page-1)*15;
  let lastValue = -2, rank = 0;
  const ranked = rows.map((row,index) => {
    const value = rowScore(row,metric);
    if (value !== lastValue) { rank = index+1; lastValue = value; }
    return {...row,rank:value<0?'—':rank};
  });
  const rowsHtml = ranked.slice(offset,offset+15).map(row => `<tr>
    <td class="number rank">${row.rank}</td>
    <th scope="row">${scope==='class'?escape(row.label):escape(participantLabel(row))}
      <small>${scope==='class'?`${integer(row.students)}명`:escape(`${classLabel(row)} ${row.number}번`)}</small>
    </th>
    <td class="number harvest">${integer(row.harvestCount)}개</td>
    <td class="number">${accuracy(row.dailyCorrect,row.dailyTotal)}<small>${score(row.dailyCorrect,row.dailyTotal)}</small></td>
    <td class="number">${accuracy(row.specialCorrect,row.specialTotal)}<small>${score(row.specialCorrect,row.specialTotal)}</small></td>
  </tr>`).join('');
  const chartScores = ['daily','special'].map((key,index) => {
    const correct = totals[key+'Correct'], total = totals[key+'Total'];
    return chartLine(index?'특별 퀴즈':'일일 퀴즈',total?correct/total*100:0,100,
      accuracy(correct,total),score(correct,total),index?'amber':'');
  }).join('');
  return layout('학생 랭킹','ranking',`
    <div class="heading">
      <h1>학생 랭킹</h1>
      <span>${grade?grade+'학년':'전체 학년'} · ${classNo?classNo+'반':'전체 반'}</span>
    </div>
    <form class="filters panel" method="get" action="${root}">
      <input type="hidden" name="scope" value="${scope}">
      <label>학년<select name="grade">${options([['','전체 학년'],[1,'1학년'],[2,'2학년'],[3,'3학년']],grade)}</select></label>
      <label>반<select name="classNo">${options([['','전체 반'],...classNumbers.map(value=>[value,value+'반'])],classNo)}</select></label>
      <label>순위 기준<select name="metric">${options([['harvest','수확 개수'],['daily','일일 퀴즈 정답률'],['special','특별 퀴즈 정답률']],metric)}</select></label>
      <button type="submit">필터 적용</button>
      ${grade||classNo||metric!=='harvest'?`<a class="button secondary" href="${pathWith(root,{scope})}">초기화</a>`:''}
    </form>
    <div class="kpis">
      ${kpi('참여 학생',integer(totals.students)+'<span>명</span>')}
      ${kpi('총 수확',integer(totals.harvestCount)+'<span>개</span>')}
      ${kpi('일일 퀴즈 정답률',accuracy(totals.dailyCorrect,totals.dailyTotal),score(totals.dailyCorrect,totals.dailyTotal))}
      ${kpi('특별 퀴즈 정답률',accuracy(totals.specialCorrect,totals.specialTotal),score(totals.specialCorrect,totals.specialTotal))}
    </div>
    <div class="charts">
      <section class="panel chart" aria-labelledby="harvest-chart">
        <div class="section-head"><h2 id="harvest-chart">반별 수확</h2><span>${allClasses.length>6?'상위 6개 반':'선택한 범위'}</span></div>
        ${top.length?`<ul>${top.map(row=>chartLine(escape(row.label),row.harvestCount,maxHarvest,integer(row.harvestCount)+'개')).join('')}</ul>`:'<p class="empty">이 범위에 참여한 학생이 없습니다.</p>'}
      </section>
      <section class="panel chart" aria-labelledby="accuracy-chart">
        <div class="section-head"><h2 id="accuracy-chart">퀴즈 정답률</h2>
          <a class="button secondary" href="${pathWith(report,{grade,classNo})}">퀴즈 보고서</a></div>
        <ul>${chartScores}</ul>
        <p class="chart-note">일일 퀴즈는 기기에 채점되어 저장된 결과를 집계합니다. 특별 퀴즈는 서버 채점 결과를 집계합니다.</p>
      </section>
    </div>
    <section class="panel listing" aria-labelledby="ranking-list">
      <div class="section-head"><h2 id="ranking-list">${scope==='class'?'반별 순위':'학생별 순위'}</h2><span>${integer(rows.length)}${scope==='class'?'개 반':'명'}</span></div>
      <nav class="switch" aria-label="순위 범위">
        <a href="${pathWith(root,{...filters,scope:'student'})}" ${scope==='student'?'aria-current="page"':''}>학생별</a>
        <a href="${pathWith(root,{...filters,scope:'class'})}" ${scope==='class'?'aria-current="page"':''}>반별</a>
      </nav>
      ${rows.length?`<div class="table-scroll" tabindex="0" role="region" aria-label="순위 표">
        <table><thead><tr><th scope="col">순위</th><th scope="col">${scope==='class'?'학급':'학생'}</th>
        <th scope="col" ${metric==='harvest'?'aria-sort="descending"':''}>수확</th>
        <th scope="col" ${metric==='daily'?'aria-sort="descending"':''}>일일 퀴즈</th>
        <th scope="col" ${metric==='special'?'aria-sort="descending"':''}>특별 퀴즈</th>
        </tr></thead><tbody>${rowsHtml}</tbody></table></div>`:'<p class="empty">조건에 맞는 순위가 없습니다.</p>'}
      ${pageNav(root,Math.floor(page),pages,filters)}
    </section>`);
}

function reportChart(rows,color = '') {
  return `<ul class="report-chart">${rows.map(({label,correct,total,details}) => chartLine(
    escape(label),total?correct/total*100:null,100,accuracy(correct,total),
    [total ? `정답 ${score(correct,total)}` : '제출 없음',details].filter(Boolean).join(' · '),color,
  )).join('')}</ul>`;
}

function quizReportPage(records,params) {
  const grade = /^[1-3]$/.test(params.get('grade') ?? '') ? params.get('grade') : '';
  const classNo = /^[1-9]\d?$/.test(params.get('classNo') ?? '') ? params.get('classNo') : '';
  const subject = reportSubjects.includes(params.get('subject')) ? params.get('subject') : reportSubjects[0];
  const {classNumbers,subjects,sets,rounds,generatedAt} = records.quizReport(Number(grade),Number(classNo),subject);
  if (classNo && !classNumbers.includes(Number(classNo))) classNumbers.push(Number(classNo));
  const scope = `${grade?grade+'학년':'전체 학년'} · ${classNo?classNo+'반':'전체 반'}`;
  const dailyDetails = ({students,submissions}) => `${integer(students)}명 · ${integer(submissions)}회 제출`;
  const subjectRows = reportSubjects.map(label => {
    const row = subjects.find(item=>item.subject===label);
    return row ? {...row,label,details:dailyDetails(row)} : {label,correct:0,total:0};
  });
  return layout('퀴즈 보고서','report',`
    <div class="heading"><h1>퀴즈 보고서</h1><span>${scope} · 집계 ${reportTime.format(generatedAt)} <span class="report-timezone">(한국 시간)</span></span></div>
    <form class="filters panel" method="get" action="${report}">
      <input type="hidden" name="subject" value="${subject}">
      <label>학년<select name="grade">${options([['','전체 학년'],[1,'1학년'],[2,'2학년'],[3,'3학년']],grade)}</select></label>
      <label>반<select name="classNo">${options([['','전체 반'],...classNumbers.map(value=>[value,value+'반'])],classNo)}</select></label>
      <button type="submit">필터 적용</button>
      ${grade||classNo?`<a class="button secondary" href="${pathWith(report,{subject})}">초기화</a>`:''}
    </form>
    <p class="report-method">학생이 제출한 퀴즈를 집계합니다. 정답률은 정답 수를 제출 문항 수로 나눈 값입니다.
      일일 퀴즈는 SQLite에 저장된 점수 요약, 특별 퀴즈는 서버 채점 결과를 사용합니다.</p>
    <div class="charts">
      <section class="panel chart" aria-labelledby="subject-chart">
        <div class="section-head"><h2 id="subject-chart">과목별 정답률</h2><span>일일 퀴즈</span></div>
        ${reportChart(subjectRows)}
      </section>
      <section class="panel chart" aria-labelledby="round-chart">
        <div class="section-head"><h2 id="round-chart">특별 미션별 정답률</h2><span>퀴즈 회차별</span></div>
        ${rounds.length?reportChart(rounds.map(round=>({...round,
          label:`${round.title} · ${round.id}회차`,
          details:`${round.total?`${integer(round.students)}명 제출 · `:''}개설 ${reportDate.format(new Date(round.startedAt))}`,
        })),'amber'):'<p class="empty">개설된 특별 퀴즈가 없습니다.</p>'}
      </section>
    </div>
    <section class="panel chart" aria-labelledby="set-chart">
      <div class="section-head"><h2 id="set-chart">${subject} 세트별 정답률</h2><span>정답률 낮은 순</span></div>
      <nav class="switch report-switch" aria-label="세트별 통계 과목">
        ${reportSubjects.map(value=>`<a href="${pathWith(report,{grade,classNo,subject:value})}#set-chart"
          ${value===subject?'aria-current="page"':''}>${value}</a>`).join('')}
      </nav>
      ${sets.length?reportChart(sets.map(row=>({...row,label:row.title,details:dailyDetails(row)}))):
        '<p class="empty">선택한 범위에 이 과목의 제출 기록이 없습니다.</p>'}
    </section>`);
}

function participant(person) {
  return `<strong>${escape(participantLabel(person))}</strong><small>${escape(participantDetails(person))}</small>`;
}

function pickupPage(records,{query='',role='',page=1,person,receipt,error} = {}) {
  const found = records.search(query,role);
  const count = records.receiptCount();
  const pages = Math.max(1,Math.ceil(count/15));
  page = Math.min(pages,Math.max(1,page));
  const history = records.receipts(15,(page-1)*15);
  const results = found.people.map(item => `<tr>
    <th scope="row">${participant(item)}</th>
    <td class="number harvest">${integer(item.harvestCount)}개</td>
    <td>${escape(item.receipt?.prize ?? item.prize ?? '기준 미달')}</td>
    <td>${item.receipt?`<span class="received">수령 완료</span><small>${time.format(new Date(item.receipt.receivedAt))}</small>`:
      item.prize?`<a class="button secondary" href="${pickup}?person=${item.id}" aria-label="${escape(participantLabel(item)+' '+participantDetails(item)+' 상품 수령')}">상품 수령</a>`:'—'}</td>
  </tr>`).join('');
  return layout('상품 수령','pickup',`
    <div class="heading"><h1>상품 수령</h1><span>11월 30일(월) · 중앙현관</span></div>
    <div class="prize-rules panel">
      ${prizes.slice().reverse().map(prize=>`<div><strong>수확 ×${prize.minimum}</strong><span>${prize.name}</span></div>`).join('')}
    </div>
    ${error?`<p class="feedback error" role="alert">${escape(error)}</p>`:''}
    ${receipt?`<section class="feedback" role="status"><strong>${escape(participantLabel(receipt))} ${escape(participantDetails(receipt))} · 수령 완료</strong>
      <span>${escape(receipt.prize)} · 수확 ${integer(receipt.harvestCount)}개 · ${time.format(new Date(receipt.receivedAt))}</span></section>`:''}
    ${person?`<section class="panel confirmation" aria-labelledby="confirm-title">
      <h2 id="confirm-title">수령 확인</h2>
      <p>${participant(person)} · 수확 ${integer(person.harvestCount)}개 · ${escape(person.receipt?.prize ?? person.prize ?? '기준 미달')}</p>
      ${person.receipt?'<p class="received">이미 수령했습니다.</p>':person.prize?`<form method="post" action="${pickup}/redeem" class="confirm-actions">
        <input type="hidden" name="person" value="${person.id}"><input type="hidden" name="key" value="${escape(person.key)}">
        <button type="submit">수령 확정</button><a class="button secondary" href="${pickup}">취소</a>
      </form>`:'<p>수확 작물 5개부터 상품을 받을 수 있습니다.</p>'}
    </section>`:''}
    <section class="panel pickup-search" aria-labelledby="search-title">
      <div class="section-head"><h2 id="search-title">학생·선생님 검색</h2>${query?`<span>${integer(found.total)}명</span>`:''}</div>
      <form class="filters" method="post" action="${pickup}/search">
        <label>구분<select name="role">${options([['','전체'],['student','학생'],['teacher','선생님']],role)}</select></label>
        <label class="search-label">이름 또는 학년·반·번호<input type="search" name="query" maxlength="80"
          placeholder="예: 이름 또는 1학년 2반 3번" value="${escape(query)}" required></label>
        <button type="submit">검색</button>
        ${query?`<a class="button secondary" href="${pickup}">초기화</a>`:''}
      </form>
      ${query && !results?'<p class="empty">검색 결과가 없습니다. 이름이나 번호를 다시 확인해 주세요.</p>':''}
      ${results?`<div class="table-scroll" tabindex="0" role="region" aria-label="참여자 검색 결과">
        <table><thead><tr><th scope="col">참여자</th><th scope="col">수확</th><th scope="col">상품</th><th scope="col">상태</th></tr></thead>
        <tbody>${results}</tbody></table></div>
        ${found.total>30?'<p class="empty">처음 30명입니다. 학년·반이나 이름을 추가해 검색 범위를 좁혀 주세요.</p>':''}`:''}
    </section>
    <section class="panel listing" aria-labelledby="history-title">
      <div class="section-head"><h2 id="history-title">수령 완료 명단</h2><span>${integer(count)}명</span></div>
      ${history.length?`<div class="table-scroll" tabindex="0" role="region" aria-label="수령 완료 표">
        <table><thead><tr><th scope="col">참여자</th><th scope="col">수확</th><th scope="col">받은 상품</th><th scope="col">수령 시각</th></tr></thead>
        <tbody>${history.map(item=>`<tr><th scope="row">${participant(item)}</th><td class="number harvest">${integer(item.harvestCount)}개</td>
          <td>${escape(item.prize)}</td><td>${time.format(new Date(item.receivedAt))}</td></tr>`).join('')}</tbody>
        </table></div>`:'<p class="empty">아직 수령 기록이 없습니다.</p>'}
      ${pageNav(pickup,page,pages,{})}
    </section>`);
}

module.exports = {loginPage,rankingPage,pickupPage,quizReportPage};
