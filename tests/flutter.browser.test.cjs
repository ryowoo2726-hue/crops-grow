// API_BASE_URL=http://127.0.0.1:8787로 빌드하고 프론트 서버를 켠 뒤 실행합니다.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {createBackend} = require('../backend/server.cjs');
const {weekAt} = require('../backend/store.cjs');
const {hashPassword} = require('../backend/admin.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'growgame-browser-db-'));
  const app = createBackend({directory: dataDirectory,adminCredentials:await hashPassword('6815')});
  app.store.importRoster([
    {grade:3,classNo:10,number:24,name:'가상학생'},
    {grade:3,classNo:12,number:30,name:'명단학생'},
    ...Array.from({length:12},(_,i)=>({grade:i<10?2:3,classNo:1,number:i<10?i+1:i-9,name:`테스트학생${i+1}`})),
  ]);
  const apiPort=Number(process.env.GROWGAME_TEST_API_PORT)||8787;
  const startApi = () => new Promise(resolve => app.server.listen(apiPort, '127.0.0.1', resolve));
  const stopApi = () => new Promise(resolve => app.server.close(resolve));
  await startApi();
  app.store.quizBank.importSets({sets:[{id:'english-browser-001',subject:'영어',title:'영어 테스트',
    questions:Array.from({length:10},(_,i)=>({question:`영어 테스트 문제 ${i+1}`,choices:['첫 번째 답','두 번째 답','세 번째 답','네 번째 답'],correctIndex:i<3?0:1,explanation:'정답 해설입니다.'}))}]});
  app.store.importSpecial({week:weekAt(Date.now()),title:'친구에게 고마운 마음 전하기',description:'오늘 고마웠던 친구 한 명에게 감사한 이유를 전해보세요.'});
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'growgame-flutter-'));
  const proc = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'],
    {stdio: 'ignore', windowsHide: true});
  let socket;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; !fs.existsSync(portFile) && i < 100; i++) await sleep(100);
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
    await new Promise(resolve => socket.addEventListener('open', resolve, {once: true}));
    let sequence = 0, pausedAction = null, pausedFont = null;
    const healthMethods=[];
    const quizRequests=[];
    const quizClaims=[];
    const specialSubmissions=[];
    const pending = new Map(), errors = [], harvestImages = new Map(), cropImages = new Map(), missionRequests = [];
    socket.addEventListener('message', event => {
      const m = JSON.parse(event.data);
      if (m.method === 'Fetch.requestPaused') {
        if(m.params.request.url.includes('NotoSansKR-extended-'))pausedFont=m.params.requestId;
        else pausedAction=m.params.requestId;
      }
      if (m.method === 'Network.requestWillBeSent') {
        const url=m.params.request.url;
        if(url.endsWith('/api/health'))healthMethods.push(m.params.request.method);
        if (m.params.request.method==='POST' && /\/api\/quiz-runs(?:\/submit)?$/.test(url)) quizRequests.push({url,body:JSON.parse(m.params.request.postData)});
        if (m.params.request.method==='POST' && url.endsWith('/api/special-quiz/submit')) specialSubmissions.push(JSON.parse(m.params.request.postData));
        if (m.params.request.method==='POST' && url.endsWith('/api/actions')) {
          const body=JSON.parse(m.params.request.postData);
          if(body.kind==='quiz-set')quizClaims.push(body);
        }
        if (/\/rice-stage-0[1-4]-[a-f0-9]+\.webp/.test(url)) cropImages.set(m.params.requestId,{url,complete:false});
        if (/\/api\/(quizzes|missions)\/current/.test(url)) missionRequests.push(url);
      }
      if (m.method === 'Network.loadingFinished' && cropImages.has(m.params.requestId)) cropImages.get(m.params.requestId).complete=true;
      if (m.method === 'Network.requestWillBeSent' && /\/rice-harvest-[a-f0-9]+\.webp/.test(m.params.request.url)) {
        harvestImages.set(m.params.requestId, {complete:false});
      }
      if (m.method === 'Network.loadingFinished' && harvestImages.has(m.params.requestId)) {
        harvestImages.get(m.params.requestId).complete = true;
      }
      if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a=>a.value || a.description));
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, {resolve, reject}); socket.send(JSON.stringify({id, method, params}));
    });
    const run = async expression => {
      const r = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
      assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value;
    };
    const hasSemanticsText = text => `[...document.querySelectorAll('flt-semantics')].some(e=>(e.getAttribute('aria-label')||e.textContent).includes(${JSON.stringify(text)}))`;
    const wait = async expression => {
      for (let i = 0; i < 200; i++) { if (await run(expression)) return; await sleep(100); }
      const shot=await send('Page.captureScreenshot');
      fs.writeFileSync(path.join(os.tmpdir(),'growgame-browser-failure.png'),Buffer.from(shot.data,'base64'));
      throw Error('대기 시간 초과: ' + expression + '\n' + JSON.stringify(errors));
    };
    await send('Runtime.enable');
    await send('Network.enable',{maxPostDataSize:4096});
    await send('Page.enable');
    await send('Fetch.enable',{patterns:[{urlPattern:'*NotoSansKR-extended-*.woff2',requestStage:'Request'}]});
    await send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 1, mobile: true});
    await send('Page.navigate', {url: process.env.GROWGAME_TEST_URL || 'http://localhost:4174/'});
    await wait("!!document.querySelector('flutter-view')");
    await wait("!!document.querySelector('flt-semantics-placeholder')");
    await run("document.querySelector('flt-semantics-placeholder').click()");
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('시작하기')");
    const clickText = async (text, index = 0) => {
      const expression = `(() => {const nodes=[...document.querySelectorAll('flt-semantics[role="button"][flt-tappable],flt-semantics[role="tab"][flt-tappable]')].filter(e=>e.getAttribute('aria-disabled')!=='true' && (e.getAttribute('aria-label')||e.textContent).includes(${JSON.stringify(text)})); if(!nodes[${index}]) return null; const r=nodes[${index}].getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`;
      await wait(expression);
      const point = await run(expression);
      await send('Input.dispatchMouseEvent', {type:'mousePressed', ...point, button:'left', clickCount:1});
      await send('Input.dispatchMouseEvent', {type:'mouseReleased', ...point, button:'left', clickCount:1});
      await sleep(400);
    };
    const fillInput = async (label, text, replace = false) => {
      const selector=`input[aria-label=${JSON.stringify(label)}],textarea[aria-label=${JSON.stringify(label)}]`;
      await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
      const point=await run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
      await sleep(200);
      if(replace)await run(`document.querySelector(${JSON.stringify(selector)}).select()`);
      await send('Input.insertText',{text});
      await sleep(300);
    };
    const clickOption = async text => {
      const expression=`(()=>{const nodes=[...document.querySelectorAll('flt-semantics')].filter(e=>(e.getAttribute('aria-label')||e.textContent)===${JSON.stringify(text)});const e=nodes.at(-1);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`;
      await wait(expression);
      const point=await run(expression);
      await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
      await sleep(400);
    };
    await clickText('선생님');
    await wait("!!document.querySelector('input[aria-label=\"선생님 이름\"]')");
    for (const [width,height] of [[320,568],[390,844],[1920,1080]]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
      await sleep(350);
      const shot=await send('Page.captureScreenshot');
      fs.writeFileSync(path.join(os.tmpdir(),`growgame-teacher-login-${width}.png`),Buffer.from(shot.data,'base64'));
    }
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await sleep(500);
    await clickText('학생');
    await wait("!document.querySelector('input[aria-label=\"선생님 이름\"]')");
    for (const field of ['학년', '반', '번호']) {
      await clickText('선택');
      if(field==='반') assert.equal(await run("document.querySelector('flt-semantics-host').textContent.includes('12반')"),true);
      if (field === '번호') {
        const shot = await send('Page.captureScreenshot');
        fs.writeFileSync(path.join(os.tmpdir(), 'growgame-flutter-number-picker.png'), Buffer.from(shot.data, 'base64'));
      }
      await clickText(field === '번호' ? '24번' : field === '반' ? '10반' : '3학년');
    }
    await wait("!!document.querySelector('input')");
    await run("document.querySelector('input').focus()");
    await send('Input.insertText', {text:'1234'});
    await sleep(300);
    const loginShot = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(os.tmpdir(), 'growgame-flutter-login.png'), Buffer.from(loginShot.data, 'base64'));
    await clickText('시작하기');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('0 / 100%')");
    assert.equal(await run("document.querySelector('flt-semantics-host').textContent.includes('3학년 10반 가상학생')"),true);
    for(let n=0;!pausedFont&&n<100;n++)await sleep(100);
    assert.ok(pausedFont,'보조 폰트 응답을 보류해도 게임 입장이 완료됨');
    assert.ok(healthMethods.includes('GET'),'실제 health 조회를 관찰함');
    assert.ok(!healthMethods.includes('OPTIONS'),'health 조회에 불필요한 사전 확인 없음');
    await send('Fetch.continueRequest',{requestId:pausedFont});pausedFont=null;
    await send('Fetch.disable');
    assert.equal(new Set([...cropImages.values()].filter(image=>image.complete).map(image=>image.url)).size,4,'입장 전에 현재 작물의 네 성장 이미지 준비');
    assert.ok([...harvestImages.values()].some(image=>image.complete),'입장 전에 수확 이미지 준비');
    for (const [width,height] of [[320,568],[1920,1080],[390,844]]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
      await sleep(350);
      assert.ok(await run(`(() => {
        const bounds = label => Array.from(document.querySelectorAll('flt-semantics[role=button]'))
          .find(e => (e.getAttribute('aria-label') || e.textContent).trim() === label)?.getBoundingClientRect();
        const message = bounds('메시지'), prize = bounds('상품');
        return !!(message && prize && prize.top >= message.bottom - 1 && Math.abs(message.right - prize.right) <= 2);
      })()`),'메시지 바로 아래에 상품 버튼 표시');
      await clickText('상품');
      await wait(hasSemanticsText('11월 30일 점심시간'));
      await wait(hasSemanticsText('중앙현관'));
      const prizeShot = await send('Page.captureScreenshot');
      fs.writeFileSync(path.join(os.tmpdir(),`growgame-event-prizes-${width}.png`),Buffer.from(prizeShot.data,'base64'));
      if (width===320) {
        await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:width/2,y:height/2,deltaX:0,deltaY:420});
      }
      await wait(hasSemanticsText('빼빼로'));
      await clickText('내 밭으로');
      await wait(`!(${hasSemanticsText('11월 30일 점심시간')})`);
    }
    console.log('Flutter Chrome 상품 팝업 통과: 320·390·1920px');
    const newMissionBadge=hasSemanticsText('새 특별 미션');
    await wait(newMissionBadge);
    const farmShot = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(os.tmpdir(), 'growgame-flutter-mission-cards.png'), Buffer.from(farmShot.data, 'base64'));
    await clickText('미션');
    await wait(newMissionBadge);
    const selectorShot = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(os.tmpdir(), 'growgame-flutter-mission-selector.png'), Buffer.from(selectorShot.data, 'base64'));
    await clickText('특별 미션');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('오늘 고마웠던 친구 한 명에게 감사한 이유를 전해보세요.')");
    const missionShot = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(os.tmpdir(), 'growgame-flutter-mission-popup.png'), Buffer.from(missionShot.data, 'base64'));
    await clickText('닫기');
    await wait(`!(${newMissionBadge})`);
    app.store.specialMissions.activate({kind:'off',requestId:'browser-no-special-mission'});
    await clickText('미션');
    await wait("![...document.querySelectorAll('flt-semantics[role=button]')].some(e=>(e.getAttribute('aria-label')||e.textContent).includes('특별 미션'))");
    await clickText('닫기');
    assert.equal(await run(newMissionBadge),false);
    const custom=app.store.specialMissions.activate({kind:'custom',title:'새로운 밭 관찰',description:'오늘 밭을 한 번 살펴보세요.',requestId:'browser-new-special-mission'});
    await clickText('도감');await clickText('내 밭');
    await wait(newMissionBadge);
    await clickText('미션');
    await wait(newMissionBadge);
    for(const [width,height] of [[320,568],[390,844],[1920,1080]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
      await sleep(300);
      const shot=await send('Page.captureScreenshot');
      fs.writeFileSync(path.join(os.tmpdir(),`growgame-new-mission-${width}.png`),Buffer.from(shot.data,'base64'));
    }
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await sleep(300);
    await clickText('특별 미션');
    await wait("document.querySelector('flt-semantics-host').textContent.includes('새로운 밭 관찰')");
    await clickText('닫기');
    await wait(`!(${newMissionBadge})`);
    app.store.db.prepare('INSERT INTO special_completions VALUES(?,?)').run(1,`campaign:${custom.id}`);
    await clickText('미션');await clickText('특별 미션');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('이번 특별 미션을 완료했어요.')");
    assert.equal(await run(hasSemanticsText('완료하기')),false);
    await clickText('닫기');
    await send('Fetch.enable',{patterns:[{urlPattern:'*/api/actions',requestStage:'Request'}]});
    await clickText('물 주기');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('물방울이 작물에게 가요!')");
    assert.ok(pausedAction,'서버 응답을 기다리는 동안 물 애니메이션 시작');
    assert.equal(app.store.snapshot(1).progress,0);
    await sleep(1500);
    assert.equal(await run("document.querySelector('flt-semantics-host').textContent.includes('0 / 100%')"),true,'응답 전 성장도 유지');
    assert.equal(await run("document.querySelector('flt-semantics-host').textContent.includes('잠시만요')"),false);
    const wateringShot=await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(os.tmpdir(),'growgame-flutter-water-pending.png'),Buffer.from(wateringShot.data,'base64'));
    await send('Fetch.continueRequest',{requestId:pausedAction});pausedAction=null;
    await send('Fetch.disable');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('50 / 100%')");
    await sleep(1900);
    assert.equal(app.store.snapshot(1).progress,50);
    await wait("[...document.querySelectorAll('flt-semantics[role=button][aria-disabled=true]')].some(e=>/분 뒤 물 주기/.test(e.getAttribute('aria-label')||e.textContent))");
    const cooldownShot=await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(os.tmpdir(),'growgame-flutter-water-cooldown.png'),Buffer.from(cooldownShot.data,'base64'));
    await clickText('미션'); await clickText('퀴즈 미션');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('새 퀴즈는 오전 8시에 열려요.')");
    await clickText('영어 · 오늘의 10문제');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('영어 테스트 문제 1')");
    assert.equal(missionRequests.length,0,'로그인에서 받은 미션으로 열기: 추가 GET 요청 없음');
    for(let i=1;i<=10;i++) {
      await wait(`document.querySelector('flt-semantics-host')?.textContent.includes('영어 테스트 문제 ${i}')`);
      await clickText('첫 번째 답');
      assert.equal(quizRequests.length,1,'문제 풀이 중 서버 통신 없음');
      await clickText(i===10?'채점하고 정답 보기':'다음 문제');
    }
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('10문제 중 3문제 정답')");
    assert.equal(quizRequests.length,2,'세트 배정과 결과 요약 제출을 각각 한 번 요청');
    assert.deepEqual(quizRequests[1].body,{runId:1,growth:30},'성장률과 배정 기록 번호만 제출');
    assert.deepEqual(JSON.parse(app.store.db.prepare('SELECT result_json FROM quiz_runs WHERE id=1').get().result_json),
      {correctCount:3,growth:30},'선택 답안은 서버에 저장하지 않음');
    assert.equal(app.store.snapshot(1).progress,50,'정답 확인 중에는 성장 보상 대기');
    const reviewShot=await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(os.tmpdir(),'growgame-quiz-set-review.png'),Buffer.from(reviewShot.data,'base64'));
    await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:195,y:600,deltaX:0,deltaY:430});
    await sleep(500);
    const wrongShot=await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(os.tmpdir(),'growgame-quiz-answer-colors.png'),Buffer.from(wrongShot.data,'base64'));
    await clickText('닫기');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('80 / 100%')");
    await sleep(1900);
    assert.equal(quizClaims.length,1,'기존 성장 처리 경로를 한 번만 호출');
    assert.deepEqual(Object.keys(quizClaims[0]).sort(),['kind','requestId','runId'],'기존 성장 요청에 성장률을 중복 제출하지 않음');
    await clickText('미션'); await clickText('퀴즈 미션');
    const stampShot=await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(os.tmpdir(),'growgame-quiz-completed-stamp.png'),Buffer.from(stampShot.data,'base64'));
    await clickText('영어 · 오늘 완료 · 정답 보기');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('10문제 중 3문제 정답')");
    assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM quiz_runs').get().n,1,'같은 날 완료한 과목은 새 세트 배정 없음');
    assert.equal(quizRequests.filter(r=>r.url.endsWith('/submit')).length,1,'결과를 다시 열어도 재제출 없음');
    await clickText('닫기');
    assert.equal(app.store.snapshot(1).progress,80,'결과 다시 열기로 중복 성장 없음');
    assert.equal(quizClaims.length,1,'완료 결과를 다시 닫아도 성장 요청을 재전송하지 않음');
    app.store.resetWater({grade:3,classNo:10,number:24});
    await clickText('도감');
    await clickText('내 밭');
    await send('Fetch.enable',{patterns:[{urlPattern:'*/api/actions',requestStage:'Request'}]});
    await clickText('물 주기');
    assert.ok(pausedAction);
    await send('Fetch.fulfillRequest',{requestId:pausedAction,responseCode:503,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'http://localhost:4174'}],body:Buffer.from(JSON.stringify({error:'테스트 연결 실패'})).toString('base64')});pausedAction=null;
    await send('Fetch.disable');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('서버 연결 안 됨')");
    assert.equal(app.store.snapshot(1).progress,80,'실패한 물 주기는 저장하지 않음');
    assert.equal(await run("document.querySelector('flt-semantics-host').textContent.includes('80 / 100%')"),true);
    await clickText('물 주기');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('100 / 100%')");
    await sleep(1900);
    assert.ok([...harvestImages.values()].some(image=>image.complete), '수확 이미지는 수확 전에 준비됨');
    const harvestRequestsBefore = harvestImages.size;
    await clickText('수확하기');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('벼 수확이 개인·반 랭킹에 반영됐어요.')");
    assert.equal(harvestImages.size,harvestRequestsBefore,'수확 팝업을 열 때 추가 이미지 다운로드 없음');
    assert.equal(app.store.snapshot(1).harvestCount,1);
    assert.equal(app.store.snapshot(1).collectionCounts.rice,1);
    assert.equal(await run("localStorage.getItem('growgame.figma-game.v1')"),null);
    await clickText('랭킹 보기');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('내 개인 순위')");
    const newStudents=await Promise.all(Array.from({length:12},(_,i)=>app.store.login(
      {grade:i<10?2:3,classNo:1,number:i<10?i+1:i-9},String(1000+i))));
    const harvestInsert=app.store.db.prepare('INSERT INTO harvests(player_id,crop_id,created_at) VALUES(?,?,?)');
    for(let i=0;i<10;i++)for(let n=0;n<i+2;n++)harvestInsert.run(app.store.authenticate(newStudents[i].token),'apple',new Date().toISOString());
    await clickText('랭킹 새로고침');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('11위')");
    const headerPositions=()=>run(`(()=>Object.fromEntries(['내 개인 순위','우리 반 순위'].map(text=>{
      const e=[...document.querySelectorAll('flt-semantics')].find(e=>e.textContent===text);
      const r=e.getBoundingClientRect();return [text,{x:r.x,y:r.y}];})))()`);
    const beforeScroll=await headerPositions();
    await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:195,y:550,deltaX:0,deltaY:430});
    await sleep(600);
    assert.deepEqual(await headerPositions(),beforeScroll,'랭킹 목록 스크롤 중 내 순위·반 순위 고정');
    let rankingShot=await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(os.tmpdir(),'growgame-rankings-individual.png'),Buffer.from(rankingShot.data,'base64'));
    await clickText('다음 랭킹 페이지');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('내 기록')");
    await clickText('반 랭킹');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('65개')");
    assert.equal(await run("document.querySelector('flt-semantics-host').textContent.includes('수확 1개')"),true,'반 탭에서도 우리 반 요약은 고정');
    rankingShot=await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(os.tmpdir(),'growgame-rankings-class.png'),Buffer.from(rankingShot.data,'base64'));
    for (const [width, height] of [[390,844],[768,1024],[1920,1080]]) {
      await send('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:width===390});
      await sleep(500);
      const stage = await run("(() => {const r=document.querySelector('flt-semantics[role=\"img\"]').getBoundingClientRect();return {width:r.width,height:r.height};})()");
      const scale = Math.min(width / 390, height / 844);
      assert.ok(Math.abs(stage.width - 390 * scale) < 1 && Math.abs(stage.height - 844 * scale) < 1, '세로 모바일 화면을 가용 공간까지 최대 확대');
      const shot = await send('Page.captureScreenshot');
      fs.writeFileSync(path.join(os.tmpdir(), `growgame-flutter-${width}.png`), Buffer.from(shot.data, 'base64'));
    }
    await stopApi();
    await clickText('내 밭');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('서버 연결 안 됨')");
    const offlineShot=await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(os.tmpdir(),'growgame-flutter-offline.png'),Buffer.from(offlineShot.data,'base64'));
    await startApi(); await clickText('도감');
    await wait("!document.querySelector('flt-semantics-host')?.textContent.includes('서버 연결 안 됨')");
    await clickText('내 밭');
    await clickText('3학년 10반 가상학생');
    await clickText('참여 정보 바꾸기');
    await clickText('선생님');
    await fillInput('선생님 이름','가상교사');
    await fillInput('비밀번호 4자리','4321');
    await clickText('시작하기');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('가상교사 선생님')");
    await clickText('물 주기');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('50 / 100%')");
    await sleep(1900);
    const teacherShot=await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(os.tmpdir(),'growgame-teacher-farm.png'),Buffer.from(teacherShot.data,'base64'));
    await clickText('랭킹 보드');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('내 개인 순위')");
    await clickText('다음 랭킹 페이지');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('가상교사 선생님')");
    assert.equal(await run("document.querySelector('flt-semantics-host').textContent.includes('우리 반 순위')"),false);
    await clickText('내 밭');
    await clickText('가상교사 선생님');
    await clickText('참여 정보 바꾸기');
    await fillInput('비밀번호 4자리','4321');
    await clickText('시작하기');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('50 / 100%')");
    const gratitude=app.store.specialMissions.activate({kind:'gratitude',requestId:'browser-gratitude-mission'});
    await clickText('미션');await clickText('특별 미션');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('감사의 말 전하기')");
    await clickText('학년');await clickOption('3학년');
    await clickText('반');await clickOption('10반');
    await clickText('번호');await clickOption('24번');
    await fillInput('감사의 말','친절하게 도와주어서 정말 고맙고 감사해요.');
    const gratitudeShot=await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(os.tmpdir(),'growgame-gratitude-mission.png'),Buffer.from(gratitudeShot.data,'base64'));
    await clickText('검토받기 +25%');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('75 / 100%')");
    await sleep(1900);
    const teacherRecipientName='새수신교사';
    const teacherNameWritten='새수신교샤';
    await clickText('미션');await clickText('특별 미션');await clickText('선생님');
    await fillInput('받는 선생님 성함',teacherNameWritten);
    await fillInput('감사의 말','늘 따뜻하게 가르쳐 주셔서 정말 감사합니다.');
    await clickText('검토받기 +25%');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('100 / 100%')");
    await sleep(1900);
    const savedTeacherMessage=app.store.specialMissions.review('pending',0).items.find(item=>item.recipient.role==='teacher'&&item.recipient.name===teacherNameWritten);
    assert.ok(savedTeacherMessage,'선생님 이름 수신 메시지를 SQLite에 저장');
    assert.equal(savedTeacherMessage.recipientRegistered,false,'미등록 선생님에게 쓴 메시지는 등록 대기로 보관');

    const savedMessage=app.store.specialMissions.review('pending',0).items.find(item=>item.recipient.role!=='teacher');
    assert.ok(savedMessage.id,'메시지가 SQLite에 저장됨');
    assert.equal(app.store.specialMissions.inbox(1,0).total,0,'관리자 전송 전에는 학생에게 메시지가 도착하지 않음');
    const adminResponse=await fetch(`http://127.0.0.1:${apiPort}/api/admin/session`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'6815'})});
    const adminToken=(await adminResponse.json()).token;
    const sentResponse=await fetch(`http://127.0.0.1:${apiPort}/api/admin/send-message`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+adminToken},body:JSON.stringify({id:savedMessage.id})});
    assert.equal(sentResponse.status,200);
    // 기존 수확 검증에서 비워 둔 가상 학생의 밭에 특별 퀴즈 효과 검증용 작물을 준비합니다.
    app.store.db.prepare("UPDATE players SET crop_id='rice',progress=0,revision=revision+1 WHERE id=1").run();
    await clickText('가상교사 선생님');await clickText('참여 정보 바꾸기');
    await clickText('학생');await fillInput('비밀번호 4자리','1234');await clickText('시작하기');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('3학년 10반 가상학생')");
    const unreadBadge="[...document.querySelectorAll('flt-semantics')].some(e=>(e.getAttribute('aria-label')||e.textContent)==='메시지, 안 읽은 메시지 1개')";
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await wait(unreadBadge);
    const unreadShot=await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(os.tmpdir(),'growgame-unread-message-badge.png'),Buffer.from(unreadShot.data,'base64'));
    await clickText('메시지');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('새 메시지')");
    assert.equal(app.store.db.prepare('SELECT read_at FROM gratitude_messages WHERE id=?').get(savedMessage.id).read_at,'','목록 조회만으로 읽음 처리하지 않음');
    assert.equal(await run(hasSemanticsText('친절하게 도와주어서 정말 고맙고 감사해요.')),false,'펼치기 전 메시지 본문은 숨김');
    await clickText('가상교사 선생님');
    await wait(hasSemanticsText('친절하게 도와주어서 정말 고맙고 감사해요.'));
    for(let n=0;n<50&&!app.store.db.prepare('SELECT read_at FROM gratitude_messages WHERE id=?').get(savedMessage.id).read_at;n++)await sleep(100);
    assert.ok(app.store.db.prepare('SELECT read_at FROM gratitude_messages WHERE id=?').get(savedMessage.id).read_at,'메시지 본문을 연 뒤 SQLite에 읽음 시각 저장');
    const inboxShot=await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(os.tmpdir(),'growgame-gratitude-inbox.png'),Buffer.from(inboxShot.data,'base64'));
    await clickText('닫기');
    assert.equal(await run(unreadBadge),false,'읽은 뒤 메시지 개수 강조 제거');
    await clickText('메시지');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('가상교사 선생님')");
    assert.equal(await run("document.querySelector('flt-semantics-host').textContent.includes('새 메시지')"),false,'다시 열어도 읽음 상태 유지');
    await clickText('가상교사 선생님');
    await clickText('삭제');
    await clickText('취소');
    assert.ok(app.store.specialMissions.inbox(1,0).items.some(item=>item.id===savedMessage.id));
    await clickText('삭제');
    const deleteMessageShot=await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(os.tmpdir(),'growgame-inbox-delete.png'),Buffer.from(deleteMessageShot.data,'base64'));
    await clickText('삭제하기');
    await wait("document.querySelector('flt-semantics-host').textContent.includes('아직 도착한 메시지가 없어요.')");
    assert.equal(app.store.specialMissions.inbox(1,0).total,0);
    assert.ok(app.store.specialMissions.review('sent',0).items.some(item=>item.id===savedMessage.id));
    await clickText('닫기');
    // 작성 중 오타가 있어도 관리자가 선택한 선생님에게 전송됩니다.
    await clickText('3학년 10반 가상학생');await clickText('참여 정보 바꾸기');await clickText('선생님');
    await fillInput('선생님 이름',teacherRecipientName,true);await fillInput('비밀번호 4자리','2468');await clickText('시작하기');
    await wait(`document.querySelector('flt-semantics-host')?.textContent.includes('${teacherRecipientName} 선생님')`);
    const teacherSent=await fetch(`http://127.0.0.1:${apiPort}/api/admin/send-message`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+adminToken},body:JSON.stringify({id:savedTeacherMessage.id,teacherName:teacherRecipientName})});
    assert.equal(teacherSent.status,200);
    await clickText('도감');await clickText('내 밭');await wait(unreadBadge);
    await clickText('메시지');await wait("document.querySelector('flt-semantics-host')?.textContent.includes('새 메시지')");
    await clickText('가상교사 선생님');
    await wait(hasSemanticsText('늘 따뜻하게 가르쳐 주셔서 정말 감사합니다.'));
    const teacherDelivery=app.store.db.prepare('SELECT read_at FROM gratitude_teacher_deliveries WHERE message_id=? AND teacher_name=?');
    for(let n=0;n<50&&!teacherDelivery.get(savedTeacherMessage.id,teacherRecipientName).read_at;n++)await sleep(100);
    assert.ok(teacherDelivery.get(savedTeacherMessage.id,teacherRecipientName).read_at);
    await clickText('닫기');assert.equal(await run(unreadBadge),false,'교사 수신 메시지도 읽으면 알림 제거');
    await clickText(`${teacherRecipientName} 선생님`);await clickText('참여 정보 바꾸기');await clickText('학생');
    await fillInput('비밀번호 4자리','1234');await clickText('시작하기');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('3학년 10반 가상학생')");
    const openPosterQuiz=async()=>{
      await clickText('미션');await clickText('특별 미션');
      const startVisible=`(()=>{const e=[...document.querySelectorAll('flt-semantics[role="button"][flt-tappable]')].find(e=>(e.getAttribute('aria-label')||e.textContent).includes('문제 풀기'));if(!e)return false;const r=e.getBoundingClientRect();return r.y>60&&r.bottom<innerHeight-30;})()`;
      for(let n=0;n<30&&!(await run(startVisible));n++){
        await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:195,y:550,deltaX:0,deltaY:400});await sleep(200);
      }
      await wait(startVisible);
      return ()=>clickText('문제 풀기');
    };
    const posterLabels={patriots:'11월 17일 순국선열의 날, 잊지 않겠습니다.',farmers:'벼 이삭을 안고 웃는 농업인',
      'student-independence':'11월 3일 학생독립운동기념일 함께 기억해요.'};
    for(const kind of Object.keys(posterLabels)){
      if(kind==='student-independence'){
        app.store.db.prepare('UPDATE players SET progress=0,revision=revision+1 WHERE id=1').run();
        app.store.db.prepare('UPDATE special_quiz_results SET reward_remaining=0 WHERE player_id=1').run();
        await clickText('도감');await clickText('내 밭');
        await wait("document.querySelector('flt-semantics-host')?.textContent.includes('0 / 100%')");
      }
      const mission=app.store.specialMissions.activate({kind,requestId:'browser-commemoration-'+kind});
      const questions=JSON.parse(app.store.db.prepare('SELECT content_json FROM special_campaigns WHERE id=?').get(mission.id).content_json).questions;
      for(const [width,height] of [[390,844],[320,568],[1920,1080]]){
        await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
        await sleep(350);
        await clickText('미션');await clickText('특별 미션');
        await wait(`document.querySelector('flt-semantics-host')?.textContent.includes('${mission.poster.sections[0].title}')`);
        assert.equal(await run("document.querySelector('flt-semantics-host').textContent.includes('자료:')"),false);
        assert.equal(await run("/독립 · 희생 · 기억|흙 · 수확 · 감사/.test(document.querySelector('flt-semantics-host').textContent)"),false);
        await wait(`!!document.querySelector('[aria-label="${posterLabels[kind]}"]')`);
        const shot=await send('Page.captureScreenshot');
        fs.writeFileSync(path.join(os.tmpdir(),`growgame-${kind}-poster-${width}.png`),Buffer.from(shot.data,'base64'));
        await clickText('닫기');
      }
      await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
      await sleep(350);
      const startQuiz=await openPosterQuiz();
      const readingShot=await send('Page.captureScreenshot');
      fs.writeFileSync(path.join(os.tmpdir(),`growgame-${kind}-reading.png`),Buffer.from(readingShot.data,'base64'));
      await startQuiz();
      await wait("document.querySelector('flt-semantics-host')?.textContent.includes('1 / 10')");
      for(let i=0;i<10;i++){
        await clickText(questions[i].choices[i<7?questions[i].correctIndex:(questions[i].correctIndex+1)%4]);
        if(i===0){const shot=await send('Page.captureScreenshot');fs.writeFileSync(path.join(os.tmpdir(),`growgame-${kind}-quiz.png`),Buffer.from(shot.data,'base64'));}
        await clickText(i===9?'채점하고 정답 보기':'다음 문제');
      }
      await wait("document.querySelector('flt-semantics-host')?.textContent.includes('10문제 중 7문제 정답')");
      const resultShot=await send('Page.captureScreenshot');
      fs.writeFileSync(path.join(os.tmpdir(),`growgame-${kind}-result.png`),Buffer.from(resultShot.data,'base64'));
      const result=app.store.db.prepare('SELECT result_json FROM special_quiz_results WHERE campaign_id=?').get(mission.id);
      assert.equal(JSON.parse(result.result_json).growth,70);
      await clickText('닫기');
      await wait("document.querySelector('flt-semantics-host')?.textContent.includes('영양분이 뿌리로 쏙!')");
      const effectShot=await send('Page.captureScreenshot');
      fs.writeFileSync(path.join(os.tmpdir(),`growgame-${kind}-nutrient-effect.png`),Buffer.from(effectShot.data,'base64'));
      await wait("!document.querySelector('flt-semantics-host')?.textContent.includes('영양분이 뿌리로 쏙!')");
      const expected=kind==='farmers'?100:70;
      assert.equal(app.store.snapshot(1).progress,expected);
      assert.equal(await run(`document.querySelector('flt-semantics-host').textContent.includes('${expected} / 100%')`),true);
      const submissionsBefore=specialSubmissions.length;
      const reopen=await openPosterQuiz();await reopen();
      await wait("document.querySelector('flt-semantics-host')?.textContent.includes('10문제 중 7문제 정답')");
      await clickText('닫기');
      assert.equal(await run("document.querySelector('flt-semantics-host').textContent.includes('영양분이 뿌리로 쏙!')"),false,'완료 결과를 다시 닫아도 효과 재생 없음');
      assert.equal(app.store.snapshot(1).progress,expected,'완료 결과 재열기로 중복 성장 없음');
      assert.equal(specialSubmissions.length,submissionsBefore,'완료 결과 재열기로 재제출 없음');
      if(kind==='farmers'){
        await wait("document.querySelector('flt-semantics-host')?.textContent.includes('다음 씨앗에 줄 영양분 +40%')");
        await clickText('수확하기');await clickText('다음 작물 심기');await clickText('고구마');
        await wait("document.querySelector('flt-semantics-host')?.textContent.includes('영양분이 뿌리로 쏙!')");
        await wait("!document.querySelector('flt-semantics-host')?.textContent.includes('영양분이 뿌리로 쏙!')");
        await wait("document.querySelector('flt-semantics-host')?.textContent.includes('40 / 100%')");
        assert.equal(app.store.snapshot(1).cropId,'sweet-potato');
        assert.equal(app.store.snapshot(1).pendingGrowth,0);
      }
    }
    // 제출 응답 전에 창을 닫아도 보상 처리 중 입력을 막고 응답 후 효과를 이어갑니다.
    app.store.db.prepare("UPDATE players SET crop_id='rice',progress=0,revision=revision+1 WHERE id=1").run();
    app.store.db.prepare('UPDATE special_quiz_results SET reward_remaining=0 WHERE player_id=1').run();
    await clickText('도감');await clickText('내 밭');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('0 / 100%')");
    const raceMission=app.store.specialMissions.activate({kind:'patriots',requestId:'browser-commemoration-close-pending'});
    const raceQuestions=JSON.parse(app.store.db.prepare('SELECT content_json FROM special_campaigns WHERE id=?').get(raceMission.id).content_json).questions;
    const raceStart=await openPosterQuiz();await raceStart();
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('1 / 10')");
    for(let i=0;i<10;i++){
      await clickText(raceQuestions[i].choices[raceQuestions[i].correctIndex]);
      if(i===9)await send('Fetch.enable',{patterns:[{urlPattern:'*/api/special-quiz/submit',requestStage:'Request'}]});
      await clickText(i===9?'채점하고 정답 보기':'다음 문제');
    }
    assert.ok(pausedAction,'특별 퀴즈 제출 응답을 보류함');
    await clickText('닫기');await sleep(500);
    assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM special_quiz_results WHERE campaign_id=?').get(raceMission.id).n,0);
    assert.equal(await run("[...document.querySelectorAll('flt-semantics[role=\"button\"]')].some(e=>(e.getAttribute('aria-label')||e.textContent).includes('물 주기')&&e.getAttribute('aria-disabled')==='true')"),true,'창을 닫은 뒤에도 제출 중 다른 성장 입력 차단');
    await send('Fetch.continueRequest',{requestId:pausedAction});pausedAction=null;await send('Fetch.disable');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('영양분이 뿌리로 쏙!')");
    const pendingClosedShot=await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(os.tmpdir(),'growgame-special-closed-submit-effect.png'),Buffer.from(pendingClosedShot.data,'base64'));
    await wait("!document.querySelector('flt-semantics-host')?.textContent.includes('영양분이 뿌리로 쏙!')");
    assert.equal(app.store.snapshot(1).progress,100);
    assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM special_quiz_results WHERE campaign_id=?').get(raceMission.id).n,1);
    // 닫기 직전의 일일 채점 요청도 응답을 받은 뒤 한 번만 지급합니다.
    const claimsBeforeClose=quizClaims.length;
    app.store.quizBank.importSets({sets:[{id:'delayed-daily',subject:'과학',title:'과학',
      questions:Array.from({length:10},(_,i)=>({question:`과학 문제 ${i+1}`,choices:['일','이','삼','사'],correctIndex:0}))}]});
    await clickText('미션');await clickText('퀴즈 미션');await clickText('과학 · 오늘의 10문제');
    for(let i=0;i<10;i++){
      await clickText('일');
      if(i===9)await send('Fetch.enable',{patterns:[{urlPattern:'*/api/quiz-runs/submit',requestStage:'Request'}]});
      await clickText(i===9?'채점하고 정답 보기':'다음 문제');
    }
    assert.ok(pausedAction);
    await clickText('닫기');
    await send('Fetch.continueRequest',{requestId:pausedAction});pausedAction=null;await send('Fetch.disable');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('다음 씨앗에 줄 영양분 +100%')");
    assert.equal(app.store.snapshot(1).pendingGrowth,100);
    assert.equal(quizClaims.length,claimsBeforeClose+1);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    console.log('Flutter Chrome 통과: 명단·교사·퀴즈·성장·수확·랭킹·복구·학생/교사 메시지 전송·읽음 알림·기념일 3종 영양분 효과·제출 중 닫기·3가지 화면');
  } finally {
    socket?.close(); proc.kill();
    if(app.server.listening) await stopApi();
    app.store.db.close();
    assert.ok(dataDirectory.startsWith(path.resolve(os.tmpdir())+path.sep));
    fs.rmSync(dataDirectory,{recursive:true,force:true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
