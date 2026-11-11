// flutter build web --no-web-resources-cdn --dart-define=LOCAL_TEST_MODE=true
// PORT=4180 node server.cjs, then node tests/flutter.local-vfx.browser.test.cjs
// Only a fresh browser profile and local-test records are used. No API is started.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'growgame-vfx-browser-'));
  const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
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
    const pending = new Map(), errors = [], apiRequests = [];
    socket.addEventListener('message', event => {
      const m = JSON.parse(event.data);
      if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a=>a.value || a.description));
      if (m.method === 'Network.requestWillBeSent' && /\/api\//.test(m.params.request.url)) apiRequests.push(m.params.request.url);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, {resolve, reject}); socket.send(JSON.stringify({id, method, params}));
    });
    const run = async expression => {
      const r = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
      assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value;
    };
    const wait = async expression => {
      for (let i = 0; i < 300; i++) { if (await run(expression)) return; await sleep(100); }
      throw Error('대기 시간 초과: ' + expression + '\n' + JSON.stringify(errors));
    };
    const has = text => `document.querySelector('flt-semantics-host')?.textContent.includes(${JSON.stringify(text)})`;
    const buttonPoint = text => `(() => {const e=[...document.querySelectorAll('flt-semantics[role="button"][flt-tappable],flt-semantics[role="checkbox"]')].find(e=>e.getAttribute('aria-disabled')!=='true'&&(e.getAttribute('aria-label')||e.textContent).includes(${JSON.stringify(text)}));if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`;
    const click = async text => {
      const expression = buttonPoint(text); await wait(expression); const point = await run(expression);
      await send('Input.dispatchMouseEvent', {type:'mousePressed', ...point, button:'left', clickCount:1});
      await send('Input.dispatchMouseEvent', {type:'mouseReleased', ...point, button:'left', clickCount:1});
    };
    const shot = async name => {
      const result = await send('Page.captureScreenshot');
      fs.writeFileSync(path.join(os.tmpdir(), `growgame-vfx-${name}.png`), Buffer.from(result.data, 'base64'));
    };
    await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
    if(process.env.GROWGAME_TEST_FORCE_JS==='true')
      await send('Page.addScriptToEvaluateOnNewDocument',{source:'WebAssembly.validate = () => false;'});
    for (const [width, height] of [[390,844],[320,568],[1920,1080]]) {
      await send('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:width<600});
      await send('Page.navigate', {url:process.env.GROWGAME_TEST_URL || 'http://localhost:4180/'});
      await wait("!!document.querySelector('flutter-view')");
      await wait("!!document.querySelector('flt-semantics-placeholder')");
      await run("document.querySelector('flt-semantics-placeholder').click()");
      await wait(has('로컬 테스트'));
      // Reset only this isolated browser's test data before each viewport.
      await run("localStorage.removeItem('growgame.local-test.v1')");
      await send('Page.reload');
      await wait("!!document.querySelector('flt-semantics-placeholder')");
      await run("document.querySelector('flt-semantics-placeholder').click()");
      await wait(has('0 / 100%'));
      await click('물 주기');
      await wait(has('물방울이 작물에게 가요!'));
      assert.equal(await run(has('0 / 100%')), true, '도착 전 성장 게이지 유지');
      assert.equal(await run(buttonPoint('물 주기')), null, '연출 중 물주기 비활성');
      await sleep(650); await shot(`${width}-jump`);
      await wait(has('촉촉하게, 쑥쑥 자라요!')); await sleep(180); await shot(`${width}-splash`);
      await wait(has('50 / 100%')); await wait(buttonPoint('미션'));
      await click('미션');
      if (width === 320) {
        await click('특별 미션'); await click('미션을 완료했어요'); await click('완료하기');
      } else {
        await click('퀴즈 미션'); await click('50%'); await click('정답 확인'); await click('미션 완료');
      }
      await wait(has('영양분이 뿌리로 쏙!')); await sleep(950); await shot(`${width}-nutrients`);
      await wait(has('80 / 100%')); await wait(buttonPoint('물 주기'));
      await click('물 주기'); await wait(has('100 / 100%')); await wait(buttonPoint('수확하기'));
      await shot(`${width}-ready`);
      const state = await run("JSON.parse(localStorage.getItem('growgame.local-test.v1')).records[0]");
      assert.equal(state.progress, 100);
      assert.equal(await run("localStorage.getItem('growgame.figma-game.v1')"), null);
      await click('수확하기'); await wait(has('우리 반 정원에 벼 수확이 더해졌어요.')); await click('정원 보기');
      await wait(has('수확 1개'));
    }
    assert.deepEqual(apiRequests, [], '로컬 모드에서 공식 API 접속 없음');
    assert.deepEqual(errors, [], '브라우저 실행 오류 없음');
    console.log('Chrome VFX 통과: 3가지 화면 · 점프/물 튀김 · 퀴즈/특별 미션 영양분 · 중복 입력 차단 · 100%/수확 · API 미사용');
    console.log('스크린샷: ' + path.join(os.tmpdir(), 'growgame-vfx-*.png'));
  } finally {socket?.close(); chrome.kill();}
})().catch(error => {console.error(error);process.exitCode = 1});
