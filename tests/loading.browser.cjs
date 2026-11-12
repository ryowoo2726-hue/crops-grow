// Measure a LOCAL_TEST_MODE build at localhost:4180. No student API is used.
// node tests/loading.browser.cjs before (or after). Results/screenshots go to OS temp.
// Production login-screen audits only read /api/health; no students/actions are created.
// GROWGAME_TEST_UNTHROTTLED=true uses the real connection without the 8Mbps/40ms cap.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const label=process.argv[2]||'loading',url=process.env.GROWGAME_TEST_URL||'http://localhost:4180/';
  const production=process.env.GROWGAME_TEST_PRODUCTION==='true';
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
    let id=0,traceFinished,apiResponses=[];const pending=new Map(),errors=[];
    socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}
      if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
      if(m.method==='Network.responseReceived'&&m.params.response.status>=400&&/\.(wasm|mjs|js|woff2|webp|otf|ttf|json)(\?|$)/.test(m.params.response.url))errors.push({url:m.params.response.url,status:m.params.response.status});
      if(m.method==='Tracing.tracingComplete')traceFinished?.(m.params.stream);
      if(m.method==='Network.responseReceived'&&m.params.response.url.endsWith('/api/health')){
        const r=m.params.response,headers=Object.fromEntries(Object.entries(r.headers).map(([k,v])=>[k.toLowerCase(),v]));
        apiResponses.push({status:r.status,protocol:r.protocol,colo:headers['cf-ray']?.split('-').at(-1),timing:r.timing});
      }
    });
    const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}))});
    const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value};
    const wait=async expression=>{for(let i=0;i<600;i++){if(await run(expression))return;await sleep(100)}throw Error('Timeout '+expression)};
    await send('Runtime.enable');await send('Network.enable');await send('Page.enable');await send('Performance.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    if(process.env.GROWGAME_TEST_UNTHROTTLED!=='true')
      await send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:1000000,uploadThroughput:1000000});
    await send('Page.addScriptToEvaluateOnNewDocument',{source:"window.addEventListener('flutter-first-frame',()=>window.__firstFrame=performance.now(),{once:true});window.__longTasks=[];new PerformanceObserver(list=>window.__longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});"});
    const reports=[];
    for(let iteration=0;iteration<(Number(process.env.GROWGAME_TEST_ROUNDS)||3);iteration++){
      await send('Network.clearBrowserCache');
      for(const visit of ['cold','warm']){
        apiResponses=[];
        const baseline=Object.fromEntries((await send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
        if(process.env.GROWGAME_TEST_TRACE==='true')await send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing,loading',transferMode:'ReturnAsStream'});
        await send('Page.navigate',{url});
        await wait('!!window.__firstFrame');
        await wait("!!document.querySelector('flt-semantics-placeholder')");
        await run("document.querySelector('flt-semantics-placeholder').click()");
        await wait(`document.querySelector('flt-semantics-host')?.textContent.includes('${production?'시작하기':'로컬 테스트'}')`);
        if(production) assert.equal(await run("document.querySelector('flt-semantics-host')?.textContent.includes('로컬 테스트')"),false);
        else await wait("document.querySelector('flt-semantics-host')?.textContent.includes('벼 성장 0%') || !!document.querySelector('flt-semantics[aria-label=\"벼 성장 0%\"]')");
        const metrics=Object.fromEntries((await send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
        const newDocument=metrics.NavigationStart!==baseline.NavigationStart;
        const cpu=Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration'].map(name=>[name,Math.max(0,metrics[name]-(newDocument?0:baseline[name]||0))*1000]));
        if(process.env.GROWGAME_TEST_TRACE==='true'){
          const completed=new Promise(resolve=>traceFinished=resolve);await send('Tracing.end');const stream=await completed;let trace='';
          while(true){const chunk=await send('IO.read',{handle:stream});trace+=chunk.base64Encoded?Buffer.from(chunk.data,'base64').toString():chunk.data;if(chunk.eof)break;}
          await send('IO.close',{handle:stream});fs.writeFileSync(path.join(os.tmpdir(),`growgame-${label}-${visit}-trace.json`),trace);traceFinished=null;
        }
        const cropReadyMs=production?null:await run('performance.now()');
        await sleep(4500);
        // Finish the deferred font download before testing a fully cached revisit.
        if(label.startsWith('after')) await wait("performance.getEntriesByType('resource').some(r=>r.name.includes('NotoSansKR-extended-')&&r.responseEnd>0)");
        const result=await run(`({firstFrameMs:window.__firstFrame,cropReadyMs:${cropReadyMs},navigation:performance.getEntriesByType('navigation')[0].toJSON(),longTasks:window.__longTasks.filter(t=>t.start<window.__firstFrame),resources:performance.getEntriesByType('resource').map(r=>({name:new URL(r.name).pathname,start:r.startTime,end:r.responseEnd,transfer:r.transferSize,encoded:r.encodedBodySize,decoded:r.decodedBodySize}))})`);
        result.cpuToFrameMs=cpu;
        result.apiResponses=apiResponses;
        result.iteration=iteration+1;result.visit=visit;
        if(production) result.galleryRequests=[];
        else {
        const point=await run("(()=>{const e=[...document.querySelectorAll('flt-semantics[role=tab][flt-tappable]')].find(e=>(e.getAttribute('aria-label')||e.textContent).includes('도감'));const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
        const before=await run('performance.getEntriesByType("resource").length');
        await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
        await wait("document.querySelector('flt-semantics-host')?.textContent.includes('작물 도감')");
        await sleep(700);
        result.galleryRequests=await run(`performance.getEntriesByType('resource').slice(${before}).map(r=>({name:new URL(r.name).pathname,transfer:r.transferSize}))`);
        }
        if(label.startsWith('after')){
          const background=result.resources.find(r=>r.name.includes('bg-school'));
          assert.ok(background.start<result.firstFrameMs,'background is requested before the Flutter frame');
          assert.equal(result.galleryRequests.filter(r=>r.name.includes('-thumb-')&&r.transfer>0).length,0,'collection thumbnails are ready before opening');
          if(visit==='warm') assert.deepEqual(result.resources.filter(r=>r.transfer>0&&(/\.(woff2|wasm|mjs|js|webp|ttf|otf)$/.test(r.name))),[],'hashed app/font/image/engine files are reused');
        }
        reports.push(result);
        if(iteration===0){const shot=await send('Page.captureScreenshot');fs.writeFileSync(path.join(os.tmpdir(),`growgame-${label}-${visit}.png`),Buffer.from(shot.data,'base64'))}
        console.log(JSON.stringify({label,iteration:iteration+1,visit,firstFrameMs:Math.round(result.firstFrameMs),cropReadyMs:cropReadyMs===null?null:Math.round(cropReadyMs),bytes:result.resources.reduce((s,r)=>s+r.transfer,0),galleryRequests:result.galleryRequests.length}));
      }
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(os.tmpdir(),`growgame-${label}-loading.json`),JSON.stringify(reports,null,2));
  }finally{socket?.close();chrome.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
