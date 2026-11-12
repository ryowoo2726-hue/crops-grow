// Read-only production audit. Never creates students or performs game actions.
// Optional --admin-read accepts the administrator password via stdin, never logs it.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {performance}=require('node:perf_hooks');
const local='http://127.0.0.1:8787',publicApi=process.env.GROWGAME_TEST_API_URL||'https://cropgrow-api.sangsangbar.com';
const round=n=>Math.round(n);
const percentile=(values,p)=>values[Math.min(values.length-1,Math.ceil(values.length*p)-1)];
async function request(base,route,{body,token}={}){
  const start=performance.now();
  try{
    const response=await fetch(base+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000),cache:'no-store'});
    const ttfb=performance.now()-start,text=await response.text();
    return {status:response.status,ttfbMs:round(ttfb),totalMs:round(performance.now()-start),bytes:Buffer.byteLength(text),colo:response.headers.get('cf-ray')?.split('-').at(-1),text};
  }catch(error){return {error:error.name,cause:error.cause?.code,totalMs:round(performance.now()-start)};}
}
const clean=({text,...result})=>result;
(async()=>{
  const report={at:new Date().toISOString(),timeoutMs:12000,sequential:[],bursts:[]};
  for(const [base,route] of [[local,'/api/health'],[publicApi,'/api/health'],['https://cropgrow.sangsangbar.com','/version.json']]){
    const samples=[];for(let i=0;i<7;i++)samples.push(clean(await request(base,route)));
    report.sequential.push({base,samples});console.log(JSON.stringify(report.sequential.at(-1)));
  }
  for(const base of [local,publicApi])for(let wave=1;wave<=(base===local?1:3);wave++){
    const start=performance.now();const samples=await Promise.all(Array.from({length:100},async()=>clean(await request(base,'/api/health'))));
    const durations=samples.map(s=>s.totalMs).sort((a,b)=>a-b);
    const burst={base,wave,totalMs:round(performance.now()-start),p50Ms:percentile(durations,.5),p95Ms:percentile(durations,.95),maxMs:durations.at(-1),failures:samples.filter(s=>s.status!==200).length,colos:[...new Set(samples.map(s=>s.colo).filter(Boolean))],samples};report.bursts.push(burst);
    const {samples:_,...summary}=burst;console.log(JSON.stringify(summary));
  }
  if(process.argv.includes('--admin-read')){
    let password='';for await(const chunk of process.stdin)password+=chunk;password=password.trim();
    const login=await request(local,'/api/admin/session',{body:{password}});password='';
    if(login.status!==200){report.adminRead={loginStatus:login.status,error:login.error};}
    else{
      const token=JSON.parse(login.text).token;let rowCount;
      report.adminRead={localLoginMs:login.totalMs,samples:[]};
      try{
        for(const base of [local,publicApi])for(let i=0;i<5;i++){
          const sample=await request(base,'/api/admin/students',{token});
          if(sample.status===200)rowCount=JSON.parse(sample.text).students.length;
          report.adminRead.samples.push({base,...clean(sample)});
        }
        report.adminRead.studentCount=rowCount;
      }finally{await request(local,'/api/admin/logout',{body:{},token});}
    }
    console.log(JSON.stringify({adminRead:report.adminRead}));
  }
  const output=path.join(os.tmpdir(),'growgame-internet-api-'+Date.now()+'.json');fs.writeFileSync(output,JSON.stringify(report,null,2));console.log('Report: '+output);
})().catch(error=>{console.error(error.name);process.exitCode=1;});
