// Measure a LOCAL_TEST_MODE build at localhost:4180. No student API is used.
// node tests/loading.browser.cjs before (or after). Results/screenshots go to OS temp.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const label=process.argv[2]||'loading',url=process.env.GROWGAME_TEST_URL||'http://localhost:4180/';
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-loading-'));
  const chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
  let socket;
  try{
    const portFile=path.join(profile,'DevToolsActivePort');
    for(let i=0;!fs.existsSync(portFile)&&i<100;i++)await sleep(100);
    const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
    const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
    await new Promise(r=>socket.addEventListener('open',r,{once:true}));
    let id=0;const pending=new Map(),errors=[];
    socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}
      if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails)});
    const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}))});
    const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value};
    const wait=async expression=>{for(let i=0;i<600;i++){if(await run(expression))return;await sleep(100)}throw Error('Timeout '+expression)};
    await send('Runtime.enable');await send('Network.enable');await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:1000000,uploadThroughput:1000000});
    await send('Page.addScriptToEvaluateOnNewDocument',{source:"window.addEventListener('flutter-first-frame',()=>window.__firstFrame=performance.now(),{once:true})"});
    const reports=[];
    for(let iteration=0;iteration<3;iteration++){
      await send('Network.clearBrowserCache');
      for(const visit of ['cold','warm']){
        await send('Page.navigate',{url});
        await wait('!!window.__firstFrame');
        await wait("!!document.querySelector('flt-semantics-placeholder')");
        await run("document.querySelector('flt-semantics-placeholder').click()");
        await wait("document.querySelector('flt-semantics-host')?.textContent.includes('로컬 테스트')");
        await wait("document.querySelector('flt-semantics-host')?.textContent.includes('벼 성장 0%') || !!document.querySelector('flt-semantics[aria-label=\"벼 성장 0%\"]')");
        const cropReadyMs=await run('performance.now()');
        await sleep(4500);
        const result=await run(`({firstFrameMs:window.__firstFrame,cropReadyMs:${cropReadyMs},resources:performance.getEntriesByType('resource').map(r=>({name:new URL(r.name).pathname,start:r.startTime,end:r.responseEnd,transfer:r.transferSize,encoded:r.encodedBodySize,decoded:r.decodedBodySize}))})`);
        result.iteration=iteration+1;result.visit=visit;
        const point=await run("(()=>{const e=[...document.querySelectorAll('flt-semantics[role=tab][flt-tappable]')].find(e=>(e.getAttribute('aria-label')||e.textContent).includes('도감'));const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
        const before=await run('performance.getEntriesByType("resource").length');
        await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
        await wait("document.querySelector('flt-semantics-host')?.textContent.includes('작물 도감')");
        await sleep(700);
        result.galleryRequests=await run(`performance.getEntriesByType('resource').slice(${before}).map(r=>({name:new URL(r.name).pathname,transfer:r.transferSize}))`);
        if(label.startsWith('after')){
          const background=result.resources.find(r=>r.name.includes('bg-school'));
          assert.ok(background.start<result.firstFrameMs,'background is requested before the Flutter frame');
          assert.equal(result.galleryRequests.filter(r=>r.name.includes('-thumb-')&&r.transfer>0).length,0,'collection thumbnails are ready before opening');
          if(visit==='warm') assert.deepEqual(result.resources.filter(r=>r.transfer>0&&(/\.(woff2|wasm|mjs|js|webp|ttf|otf)$/.test(r.name))),[],'hashed app/font/image/engine files are reused');
        }
        reports.push(result);
        if(iteration===0){const shot=await send('Page.captureScreenshot');fs.writeFileSync(path.join(os.tmpdir(),`growgame-${label}-${visit}.png`),Buffer.from(shot.data,'base64'))}
        console.log(JSON.stringify({label,iteration:iteration+1,visit,firstFrameMs:Math.round(result.firstFrameMs),cropReadyMs:Math.round(cropReadyMs),bytes:result.resources.reduce((s,r)=>s+r.transfer,0),galleryRequests:result.galleryRequests.length}));
      }
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(os.tmpdir(),`growgame-${label}-loading.json`),JSON.stringify(reports,null,2));
  }finally{socket?.close();chrome.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
