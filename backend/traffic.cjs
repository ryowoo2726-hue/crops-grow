const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');

function systemCounters(){
  if(process.platform!=='linux')return null;
  const interfaces=fs.readdirSync('/sys/class/net').filter(name=>name!=='lo');
  if(!interfaces.length)return null;
  const sum=kind=>interfaces.reduce((total,name)=>total+Number(fs.readFileSync(`/sys/class/net/${name}/statistics/${kind}_bytes`,'utf8')),0);
  return {rxBytes:sum('rx'),txBytes:sum('tx'),bootId:fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),bootAt:Date.now()-os.uptime()*1000};
}

function createTrafficMeter(directory,{now=Date.now,readCounters=systemCounters}={}){
  const file=path.join(directory,'server-traffic.json');
  let state=null,invalid=false;
  try{
    if(fs.existsSync(file)){
      state=JSON.parse(fs.readFileSync(file,'utf8'));
      if(!/^\d{4}-\d{2}$/.test(state.month)||!['rxBytes','txBytes','lastRx','lastTx','startedAt','sampledAt'].every(key=>Number.isSafeInteger(state[key])&&state[key]>=0)||typeof state.bootId!=='string')invalid=true;
    }
  }catch{invalid=true;}
  function snapshot(){
    try{
      if(invalid)return {available:false};
      const current=readCounters();
      if(!current)return {available:false};
      if(!['rxBytes','txBytes'].every(key=>Number.isSafeInteger(current[key])&&current[key]>=0)||!Number.isFinite(current.bootAt)||typeof current.bootId!=='string')return {available:false};
      const time=now(),month=new Date(time).toISOString().slice(0,7);
      let next;
      if(!state){
        const complete=new Date(current.bootAt).toISOString().slice(0,7)===month;
        next={month,rxBytes:complete?current.rxBytes:0,txBytes:complete?current.txBytes:0,startedAt:Math.trunc(complete?current.bootAt:time)};
      }else{
        const sameMonth=state.month===month;
        const delta=(value,last)=>current.bootId===state.bootId&&value>=last?value-last:value;
        next={month,rxBytes:(sameMonth?state.rxBytes:0)+delta(current.rxBytes,state.lastRx),
          txBytes:(sameMonth?state.txBytes:0)+delta(current.txBytes,state.lastTx),
          startedAt:sameMonth?state.startedAt:Date.parse(month+'-01T00:00:00Z')};
      }
      next={...next,lastRx:current.rxBytes,lastTx:current.txBytes,bootId:current.bootId,sampledAt:time};
      fs.writeFileSync(file+'.tmp',JSON.stringify(next),{mode:0o600});
      fs.renameSync(file+'.tmp',file);state=next;
      return {available:true,month,rxBytes:next.rxBytes,txBytes:next.txBytes,freeOutboundBytes:10*1000**4,
        measuredSince:new Date(next.startedAt).toISOString(),sampledAt:new Date(time).toISOString(),estimated:true};
    }catch{return {available:false};}
  }
  snapshot();
  const timer=setInterval(snapshot,60000);timer.unref();
  return {snapshot,close(){clearInterval(timer);snapshot();}};
}

module.exports={createTrafficMeter};
