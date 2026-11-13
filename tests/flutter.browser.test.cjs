// API_BASE_URL=http://127.0.0.1:8787로 빌드하고 프론트 서버를 켠 뒤 실행합니다.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {createBackend} = require('../backend/server.cjs');
const {weekAt} = require('../backend/store.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'growgame-browser-db-'));
  const app = createBackend({directory: dataDirectory});
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
    const wait = async expression => {
      for (let i = 0; i < 200; i++) { if (await run(expression)) return; await sleep(100); }
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
    for (const field of ['학년', '반', '번호']) {
      await clickText('선택');
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
    for(let n=0;!pausedFont&&n<100;n++)await sleep(100);
    assert.ok(pausedFont,'보조 폰트 응답을 보류해도 게임 입장이 완료됨');
    assert.ok(healthMethods.includes('GET'),'실제 health 조회를 관찰함');
    assert.ok(!healthMethods.includes('OPTIONS'),'health 조회에 불필요한 사전 확인 없음');
    await send('Fetch.continueRequest',{requestId:pausedFont});pausedFont=null;
    await send('Fetch.disable');
    assert.equal(new Set([...cropImages.values()].filter(image=>image.complete).map(image=>image.url)).size,4,'입장 전에 현재 작물의 네 성장 이미지 준비');
    assert.ok([...harvestImages.values()].some(image=>image.complete),'입장 전에 수확 이미지 준비');
    const farmShot = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(os.tmpdir(), 'growgame-flutter-mission-cards.png'), Buffer.from(farmShot.data, 'base64'));
    await clickText('미션');
    const selectorShot = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(os.tmpdir(), 'growgame-flutter-mission-selector.png'), Buffer.from(selectorShot.data, 'base64'));
    await clickText('특별 미션');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('오늘 고마웠던 친구 한 명에게 감사한 이유를 전해보세요.')");
    const missionShot = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(os.tmpdir(), 'growgame-flutter-mission-popup.png'), Buffer.from(missionShot.data, 'base64'));
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
    await clickText('미션'); await clickText('퀴즈 미션');
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
    await clickText('닫기');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('80 / 100%')");
    await sleep(1900);
    assert.equal(quizClaims.length,1,'기존 성장 처리 경로를 한 번만 호출');
    assert.deepEqual(Object.keys(quizClaims[0]).sort(),['kind','requestId','runId'],'기존 성장 요청에 성장률을 중복 제출하지 않음');
    await clickText('미션'); await clickText('퀴즈 미션');
    await clickText('영어 · 오늘 완료 · 정답 보기');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('10문제 중 3문제 정답')");
    assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM quiz_runs').get().n,1,'같은 날 완료한 과목은 새 세트 배정 없음');
    assert.equal(quizRequests.filter(r=>r.url.endsWith('/submit')).length,1,'결과를 다시 열어도 재제출 없음');
    await clickText('닫기');
    assert.equal(app.store.snapshot(1).progress,80,'결과 다시 열기로 중복 성장 없음');
    assert.equal(quizClaims.length,1,'완료 결과를 다시 닫아도 성장 요청을 재전송하지 않음');
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
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('우리 반 정원에 벼 수확이 더해졌어요.')");
    assert.equal(harvestImages.size,harvestRequestsBefore,'수확 팝업을 열 때 추가 이미지 다운로드 없음');
    assert.equal(app.store.snapshot(1).harvestCount,1);
    assert.equal(app.store.snapshot(1).collectionCounts.rice,1);
    assert.equal(await run("localStorage.getItem('growgame.figma-game.v1')"),null);
    await clickText('정원 보기');
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
    assert.equal(errors.length, 0, JSON.stringify(errors));
    console.log('Flutter Chrome 통과: PIN 등록 → 기기 채점·요약 제출 → 완료 결과 재조회 → 성장·수확·도감 저장 → 오프라인·복구 · 3가지 화면');
  } finally {
    socket?.close(); proc.kill();
    if(app.server.listening) await stopApi();
    app.store.db.close();
    assert.ok(dataDirectory.startsWith(path.resolve(os.tmpdir())+path.sep));
    fs.rmSync(dataDirectory,{recursive:true,force:true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
