// Registration diagnostics on disposable databases; injected delay is simulated RTT.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {fork}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pin=String(require('node:crypto').randomInt(1000,10000));
const percentile=(values,p)=>values[Math.min(values.length-1,Math.ceil(values.length*p)-1)];

async function sample({count,round=1,delayMs=0,threads,idleMs=0,preflight=false}){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-register-'));
  let child,proxy,sequence=0;const waiting=new Map();
  try{
    child=fork(path.join(__dirname,'backend.load.cjs'),['--worker'],{env:{...process.env,GROWGAME_LOAD_DIR:directory,GROWGAME_PROFILE_HASH:'1',...(threads?{UV_THREADPOOL_SIZE:String(threads)}:{})},execArgv:[],windowsHide:true,stdio:['ignore','inherit','inherit','ipc']});
    const port=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('Worker startup timed out')),15000);
      child.on('message',m=>{if(m.ready){clearTimeout(timeout);resolve(m.port);}else if(m.id){waiting.get(m.id)?.(m.result);waiting.delete(m.id);}});child.once('error',reject);
    });
    const rpc=kind=>new Promise((resolve,reject)=>{const id=++sequence,timeout=setTimeout(()=>reject(Error('Worker response timed out')),15000);waiting.set(id,value=>{clearTimeout(timeout);resolve(value);});child.send({id,kind});});
    let base=`http://127.0.0.1:${port}`;
    if(delayMs){
      const target=base;
      proxy=http.createServer(async(req,res)=>{
        try{
          const chunks=[];for await(const chunk of req)chunks.push(chunk);
          await pause(delayMs/2);if(res.destroyed)return;
          const upstream=await fetch(target+req.url,{method:req.method,headers:{'Content-Type':'application/json',...(req.headers.origin?{Origin:req.headers.origin}:{}),...(req.headers['access-control-request-method']?{'Access-Control-Request-Method':req.headers['access-control-request-method']}:{}),...(req.headers['access-control-request-headers']?{'Access-Control-Request-Headers':req.headers['access-control-request-headers']}: {})},body:Buffer.concat(chunks)});
          const body=await upstream.text();await pause(delayMs/2);
          if(!res.destroyed){res.writeHead(upstream.status,{'Content-Type':'application/json',...(upstream.headers.get('access-control-allow-origin')?{'Access-Control-Allow-Origin':upstream.headers.get('access-control-allow-origin')}:{})});res.end(body);}
        }catch{if(!res.destroyed){res.writeHead(502);res.end('{}');}}
      });
      await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${proxy.address().port}`;
    }
    if(idleMs){console.log('Idle-before-registration: '+idleMs+'ms');await pause(idleMs);}
    const preflighted=new Set();
    const register=async i=>{
      const profile={grade:1,classNo:Math.floor(i/30)+1,number:i%30+1};
      const signal=AbortSignal.timeout(12000),origin='http://localhost:4174';
      if(preflight&&!preflighted.has(i)){
        const response=await fetch(base+'/api/session',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'},signal});
        await response.arrayBuffer();if(response.status!==204||response.headers.get('access-control-allow-origin')!==origin)throw Error('Preflight failed');preflighted.add(i);
      }
      const response=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json',...(preflight?{Origin:origin}:{})},body:JSON.stringify({profile,pin}),signal});
      const data=await response.json();if(!response.ok)throw Error('HTTP '+response.status);
      if(!data.token||data.state.progress!==0)throw Error('Invalid registration state');
    };
    await rpc('begin');const started=performance.now(),latencies=[],failed=[],errors=[];
    await Promise.all(Array.from({length:count},async(_,i)=>{const t=performance.now();try{await register(i);}catch(error){failed.push(i);errors.push(error.name+': '+error.message);}finally{latencies.push(performance.now()-t);}}));
    const total=performance.now()-started,metrics=await rpc('end');latencies.sort((a,b)=>a-b);
    const before=await rpc('inspect'),retryFailedAfterEach=[];let retrying=failed;
    for(let attempt=0;retrying.length&&attempt<2;attempt++){
      const remaining=[];await Promise.all(retrying.map(async i=>{try{await register(i);}catch{remaining.push(i);}}));retrying=remaining;retryFailedAfterEach.push(remaining.length);
    }
    const after=await rpc('inspect');
    const result={count,round,delayMs,preflight,threads:threads||process.env.UV_THREADPOOL_SIZE||'current-default',idleMs,totalMs:Math.round(total),p50Ms:Math.round(percentile(latencies,.5)),p95Ms:Math.round(percentile(latencies,.95)),maxMs:Math.round(latencies.at(-1)),failures:failed.length,errorTypes:[...new Set(errors)],retryFailures:retrying.length,retryFailedAfterEach,playersBeforeRetry:before.players,playersAfterRetry:after.players,...metrics};
    console.log(JSON.stringify(result));return result;
  }finally{
    if(proxy){proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));}
    if(child&&child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.send({kind:'stop'});await exited;}
    if(!directory.startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe temporary path');
    fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
}

(async()=>{
  const report={at:new Date().toISOString(),timeoutMs:12000,networkDelay:'simulated RTT split before forwarding request and returning response; no bandwidth/loss simulation',samples:[]};
  if(!process.argv.includes('--preflight-only')){
    for(const count of [10,30,50,100])for(let round=1;round<=3;round++)report.samples.push(await sample({count,round}));
    for(const delayMs of [300,1000,2000,5000,10000])report.samples.push(await sample({count:100,delayMs}));
    for(let round=1;round<=3;round++)report.samples.push(await sample({count:100,threads:8,round}));
    report.samples.push(await sample({count:100,idleMs:60000}));
  }
  const onlyDelay=process.argv.find(arg=>arg.startsWith('--delay-ms='));
  const onlyCount=process.argv.find(arg=>arg.startsWith('--count='));
  const count=onlyCount?Number(onlyCount.split('=')[1]):100;
  if(!Number.isInteger(count)||count<1||count>100)throw Error('Count must be 1..100');
  const delays=onlyDelay?[Number(onlyDelay.split('=')[1])]:[300,1000,2000,5000,10000];
  if(!delays.every(delay=>Number.isInteger(delay)&&delay>=0&&delay<=10000))throw Error('Delay must be 0..10000ms');
  for(const delayMs of delays)report.samples.push(await sample({count,delayMs,preflight:true}));
  const file=path.join(os.tmpdir(),'growgame-registration-'+Date.now()+'.json');fs.writeFileSync(file,JSON.stringify(report,null,2));console.log('Report: '+file);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
