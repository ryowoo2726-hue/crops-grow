const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createTrafficMeter}=require('./traffic.cjs');

test('월간 네트워크 사용량: 재시작·재부팅·월 경계·수집 실패',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-traffic-'));
  let time=Date.parse('2026-11-18T00:00:00Z');
  let counters={rxBytes:1000,txBytes:500,bootId:'first-boot',bootAt:time-3600000};
  const options={now:()=>time,readCounters:()=>counters};
  let meter=createTrafficMeter(directory,options);
  t.after(()=>{meter.close();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  assert.equal(meter.snapshot().txBytes,500);
  counters={...counters,rxBytes:1400,txBytes:800};
  assert.equal(meter.snapshot().txBytes,800);assert.equal(meter.snapshot().rxBytes,1400);
  meter.close();meter=createTrafficMeter(directory,options);
  assert.equal(meter.snapshot().txBytes,800,'재시작해도 중복 집계하지 않는다');
  counters={...counters,rxBytes:50,txBytes:20,bootId:'second-boot',bootAt:time};
  assert.equal(meter.snapshot().txBytes,820);assert.equal(meter.snapshot().rxBytes,1450);
  time=Date.parse('2026-12-01T00:00:01Z');counters={...counters,rxBytes:70,txBytes:30};
  const next=meter.snapshot();
  assert.equal(next.month,'2026-12');assert.equal(next.txBytes,10);assert.equal(next.rxBytes,20);
  assert.equal(next.freeOutboundBytes,10*1000**4);assert.equal(next.estimated,true);
  counters=null;assert.deepEqual(meter.snapshot(),{available:false});
});

test('이전 달부터 켜진 서버는 수집 시작 이후 증가량만 계산한다',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-traffic-partial-'));
  const time=Date.parse('2026-11-18T00:00:00Z');
  let counters={rxBytes:1000000,txBytes:500000,bootId:'old-boot',bootAt:Date.parse('2026-10-18T00:00:00Z')};
  const meter=createTrafficMeter(directory,{now:()=>time,readCounters:()=>counters});
  t.after(()=>{meter.close();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  assert.equal(meter.snapshot().txBytes,0);
  counters={...counters,txBytes:500050};assert.equal(meter.snapshot().txBytes,50);
  assert.equal(meter.snapshot().measuredSince,new Date(time).toISOString());
});

test('손상된 기록은 사용량을 0으로 표시하지 않고 수집 불가로 반환한다',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-traffic-invalid-'));
  fs.writeFileSync(path.join(directory,'server-traffic.json'),'{}');
  const meter=createTrafficMeter(directory,{readCounters:()=>{throw Error('unavailable');}});
  t.after(()=>{meter.close();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  assert.deepEqual(meter.snapshot(),{available:false});
});
