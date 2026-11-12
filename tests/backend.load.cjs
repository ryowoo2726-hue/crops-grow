// Explicit load test: isolated temporary DB and child API, never the official server.
// Add --tunnel to measure a separate, temporary Cloudflare Quick Tunnel too.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fork,spawn,execFileSync}=require('node:child_process');
const {performance,monitorEventLoopDelay}=require('node:perf_hooks');
const mib=n=>Math.round(n/1048576*10)/10;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

if(process.argv.includes('--worker')){
  let hashTimes=[],hashOutstanding=0,hashPeak=0,sqlMs=0,sqlCalls=0;
  const profiling=process.env.GROWGAME_PROFILE_HASH==='1';
  if(profiling){
    const crypto=require('node:crypto'),original=crypto.scrypt;
    crypto.scrypt=(...args)=>{
      const callback=args.pop(),start=performance.now();hashPeak=Math.max(hashPeak,++hashOutstanding);
      return original(...args,(error,value)=>{hashTimes.push(performance.now()-start);hashOutstanding--;callback(error,value);});
    };
    const {DatabaseSync,StatementSync}=require('node:sqlite');
    for(const [prototype,names]of [[DatabaseSync.prototype,['prepare','exec']],[StatementSync.prototype,['get','all','run']]])for(const name of names){
      const original=prototype[name];prototype[name]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{sqlMs+=performance.now()-start;sqlCalls++;}};
    }
  }
  const {createBackend}=require('../backend/server.cjs');
  const app=createBackend({directory:process.env.GROWGAME_LOAD_DIR});
  const {weekAt}=require('../backend/store.cjs');
  app.store.importQuiz({week:weekAt(Date.now()),questions:Array.from({length:20},(_,i)=>({question:`부하 검증 문제 ${i+1}`,choices:['가','나','다','라'],correctIndex:i%4}))});
  app.store.importSpecial({week:weekAt(Date.now()),title:'부하 검증 미션',description:'실제 학생 기록을 사용하지 않는 임시 미션입니다.'});
  const lag=monitorEventLoopDelay({resolution:10});lag.enable();
  let started,cpu,hostCpu,peak=process.memoryUsage().rss;
  const timer=setInterval(()=>{peak=Math.max(peak,process.memoryUsage().rss);},10);
  app.server.listen(0,'127.0.0.1',()=>process.send({ready:true,port:app.server.address().port}));
  process.on('message',message=>{
    if(message.kind==='begin'){
      started=performance.now();cpu=process.cpuUsage();hostCpu=os.cpus();peak=process.memoryUsage().rss;lag.reset();hashTimes=[];hashPeak=hashOutstanding;sqlMs=0;sqlCalls=0;
      process.send({id:message.id,result:{}});
    }else if(message.kind==='end'){
      const elapsed=performance.now()-started,used=process.cpuUsage(cpu),memory=process.memoryUsage();
      hashTimes.sort((a,b)=>a-b);
      const hostAfter=os.cpus();let total=0,idle=0;hostAfter.forEach((c,i)=>{for(const key of Object.keys(c.times))total+=c.times[key]-hostCpu[i].times[key];idle+=c.times.idle-hostCpu[i].times.idle;});
      process.send({id:message.id,result:{serverPeakRssMiB:mib(Math.max(peak,memory.rss)),serverHeapUsedMiB:mib(memory.heapUsed),cpuTimeMs:Math.round((used.user+used.system)/1000),cpuPercentOfLogicalCapacity:Math.round((used.user+used.system)/1000/elapsed/os.cpus().length*1000)/10,hostCpuPercent:Math.round((1-idle/total)*1000)/10,eventLoopP95Ms:Math.round(lag.percentile(95)/1e6*10)/10,eventLoopMaxMs:Math.round(lag.max/1e6*10)/10,heapLimitMiB:mib(require('node:v8').getHeapStatistics().heap_size_limit),...(profiling?{hashCalls:hashTimes.length,hashQueuedOrRunningPeak:hashPeak,hashP50Ms:Math.round(hashTimes[Math.floor(hashTimes.length*.5)]||0),hashP95Ms:Math.round(hashTimes[Math.min(hashTimes.length-1,Math.ceil(hashTimes.length*.95)-1)]||0),sqlTimeMs:Math.round(sqlMs*10)/10,sqlCalls}:{})}});
    }else if(message.kind==='inspect'){
      process.send({id:message.id,result:{players:app.store.db.prepare('SELECT COUNT(*) n FROM players').get().n,sessions:app.store.db.prepare('SELECT COUNT(*) n FROM sessions').get().n}});
    }else if(message.kind==='seed-harvests'){
      app.store.db.exec('BEGIN IMMEDIATE');
      try{
        for(let i=0;i<3;i++)app.store.db.prepare("INSERT INTO harvests(player_id,crop_id,created_at) SELECT p.id,'rice',? FROM players p WHERE (SELECT COUNT(*) FROM harvests h WHERE h.player_id=p.id)=?").run(new Date().toISOString(),i);
        app.store.db.exec('COMMIT');
      }catch(error){app.store.db.exec('ROLLBACK');throw error;}
      process.send({id:message.id,result:{}});
    }else if(message.kind==='stop'){
      clearInterval(timer);lag.disable();app.server.close(()=>{app.store.db.close();process.exit(0);});app.server.closeAllConnections();
    }
  });
}else{
  (async()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-load-'));
    const report={at:new Date().toISOString(),students:100,rounds:3,system:{cpu:os.cpus()[0].model,logicalCores:os.cpus().length,totalMemoryMiB:mib(os.totalmem()),freeMemoryBeforeMiB:mib(os.freemem()),node:process.version},phases:[]};
    let child,tunnel,timer,freeMinimum=os.freemem(),sequence=0;
    const requests=new Map();
    const pin=String(require('node:crypto').randomInt(1000,10000));
    const profile=index=>({grade:Math.floor(index/300)+1,classNo:Math.floor(index%300/30)+1,number:index%30+1});
    const percentile=(values,p)=>values[Math.min(values.length-1,Math.ceil(values.length*p)-1)];
    try{
      child=fork(__filename,['--worker'],{env:{...process.env,GROWGAME_LOAD_DIR:directory},execArgv:[],windowsHide:true,stdio:['ignore','inherit','inherit','ipc']});
      const port=await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(Error('Temporary API startup timed out')),10000);
        child.on('message',m=>{if(m.ready){clearTimeout(timeout);resolve(m.port);}else if(m.id){requests.get(m.id)?.(m.result);requests.delete(m.id);}});
        child.once('error',reject);
      });
      const rpc=kind=>new Promise(resolve=>{const id=++sequence;requests.set(id,resolve);child.send({id,kind});});
      timer=setInterval(()=>{freeMinimum=Math.min(freeMinimum,os.freemem());},100);
      const call=async(base,route,body,token)=>{
        const response=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
        const data=await response.json();if(!response.ok)throw Error('HTTP '+response.status);
        return data;
      };
      const phase=async(transport,round,name,task)=>{
        await rpc('begin');const start=performance.now(),latencies=[],errors=[];
        const results=await Promise.all(Array.from({length:100},async(_,i)=>{
          const t=performance.now();try{return await task(i);}catch(error){errors.push(error.message);return null;}finally{latencies.push(performance.now()-t);}
        }));
        const total=performance.now()-start,metrics=await rpc('end');latencies.sort((a,b)=>a-b);
        const entry={transport,round,name,totalMs:Math.round(total),p50Ms:Math.round(percentile(latencies,.5)),p95Ms:Math.round(percentile(latencies,.95)),maxMs:Math.round(latencies.at(-1)),failures:errors.length,errorTypes:[...new Set(errors)],...metrics};
        report.phases.push(entry);console.log(JSON.stringify(entry));return results;
      };
      const bases=[['loopback',`http://127.0.0.1:${port}`]];
      if(process.argv.includes('--tunnel')){
        tunnel=spawn(process.env.CLOUDFLARED_PATH||'C:/Program Files (x86)/cloudflared/cloudflared.exe',['tunnel','--no-autoupdate','--protocol','http2','--url',bases[0][1]],{stdio:['ignore','pipe','pipe'],windowsHide:true});
        let output='',tunnelError;
        const read=chunk=>{output=(output+chunk).slice(-20000);};tunnel.stdout.on('data',read);tunnel.stderr.on('data',read);tunnel.on('error',error=>tunnelError=error);
        let url;
        for(let n=0;n<120;n++){url=output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];if(url||tunnelError||tunnel.exitCode!==null)break;await pause(500);}
        if(url){
          for(let n=0;n<20;n++){try{await call(url,'/api/health');bases.push(['quick-tunnel-http2',url]);break;}catch{await pause(1000);}}
        }
        report.tunnel={connected:bases.length===2,protocol:'http2',error:tunnelError?.message||(!url?(output.match(/quick tunnel provisioning failed[^\r\n]*/)?.[0]||'Quick Tunnel startup timed out'):bases.length===1?'Temporary tunnel health check failed':undefined)};
        console.log('Temporary internet tunnel connected: '+report.tunnel.connected);
      }
      for(const [transport,base]of bases){
        for(let round=0;round<3;round++){
          const offset=(transport==='loopback'?0:300)+round*100;
          const sessions=await phase(transport,round+1,'register-100',i=>call(base,'/api/session',{profile:profile(offset+i),pin}));
          await rpc('seed-harvests');
          await phase(transport,round+1,'water-100',async i=>{
            if(!sessions[i])throw Error('Login failed');
            const result=await call(base,'/api/actions',{kind:'water',requestId:`load-${transport}-${round}-${i}-water`},sessions[i].token);
            if(result.state.progress!==50)throw Error('Unexpected growth');
          });
          await phase(transport,round+1,'login-existing-100',i=>call(base,'/api/session',{profile:profile(offset+i),pin}));
        }
      }
      const ids=[child.pid,...(tunnel&&tunnel.exitCode===null?[tunnel.pid]:[])].join(',');
      try{report.osProcesses=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',`Get-Process -Id ${ids} | Select-Object Id,ProcessName,WorkingSet64,PeakWorkingSet64,CPU | ConvertTo-Json -Compress`],{windowsHide:true,encoding:'utf8'}));}catch{report.osProcesses=[];}
      report.system.freeMemoryMinimumMiB=mib(freeMinimum);
      report.failures=report.phases.reduce((n,p)=>n+p.failures,0);
      const output=path.join(os.tmpdir(),'growgame-load-'+Date.now()+'.json');fs.writeFileSync(output,JSON.stringify(report,null,2));console.log('Report: '+output);
      if(report.failures)process.exitCode=1;
    }finally{
      clearInterval(timer);
      if(tunnel&&tunnel.exitCode===null){const exited=new Promise(resolve=>tunnel.once('exit',resolve));tunnel.kill();await exited;}
      if(child&&child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.send({kind:'stop'});await exited;}
      if(!directory.startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe temporary path');
      fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:200});
    }
  })().catch(error=>{console.error(error.message);process.exitCode=1;});
}
