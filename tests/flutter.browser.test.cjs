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
  const startApi = () => new Promise(resolve => app.server.listen(8787, '127.0.0.1', resolve));
  const stopApi = () => new Promise(resolve => app.server.close(resolve));
  await startApi();
  app.store.importQuiz({week:weekAt(Date.now()), questions:[{question:'이번 주 퀴즈 질문',choices:['정답 보기','다른 보기','세 번째 보기','네 번째 보기'],correctIndex:0,explanation:'정답 해설입니다.'}]});
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
    let sequence = 0;
    const pending = new Map(), errors = [], harvestImages = new Map();
    socket.addEventListener('message', event => {
      const m = JSON.parse(event.data);
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
    await send('Network.enable');
    await send('Page.enable');
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
    await clickText('물 주기');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('50 / 100%')");
    await sleep(1900);
    assert.equal(app.store.snapshot(1).progress,50);
    await clickText('미션'); await clickText('퀴즈 미션');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('이번 주 퀴즈 질문')");
    await clickText('정답 보기'); await clickText('정답 확인');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('정답이에요!')");
    await clickText('미션 완료');
    await wait("document.querySelector('flt-semantics-host')?.textContent.includes('80 / 100%')");
    await sleep(1900); await clickText('물 주기');
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
    console.log('Flutter Chrome 통과: PIN 등록 → 서버 채점 → 성장·수확·도감 저장 → 오프라인·복구 · 3가지 화면');
  } finally {
    socket?.close(); proc.kill();
    if(app.server.listening) await stopApi();
    app.store.db.close();
    assert.ok(dataDirectory.startsWith(path.resolve(os.tmpdir())+path.sep));
    fs.rmSync(dataDirectory,{recursive:true,force:true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
