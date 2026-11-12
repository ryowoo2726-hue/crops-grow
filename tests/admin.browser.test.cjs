// Isolated SQLite and Chrome profile only. Never starts the official API or Tunnel.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {createBackend}=require('../backend/server.cjs');
const {hashPassword}=require('../backend/admin.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'growgame-admin-browser-'));
  const profile=path.join(directory,'chrome');
  const password='6815';
  const app=createBackend({directory,adminCredentials:await hashPassword(password)});
  let chrome,socket;
  try{
    for(const p of [{grade:1,classNo:1,number:1},{grade:1,classNo:2,number:2},{grade:2,classNo:1,number:3}])await app.store.login(p,'1234');
    app.store.db.prepare("UPDATE players SET crop_id='apple',progress=50 WHERE grade=1 AND class_no=1").run();
    app.store.db.prepare("INSERT INTO harvests(player_id,crop_id,created_at) SELECT id,'rice','2026-11-12T00:00:00Z' FROM players WHERE grade=1 AND class_no=1").run();
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${app.server.address().port}`;
    chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
    const portFile=path.join(profile,'DevToolsActivePort');
    for(let n=0;!fs.existsSync(portFile)&&n<100;n++)await sleep(100);
    const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
    const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
    await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
    let sequence=0;const pending=new Map(),errors=[];
    socket.addEventListener('message',event=>{
      const message=JSON.parse(event.data);
      if(message.id){const p=pending.get(message.id);pending.delete(message.id);message.error?p.reject(message.error):p.resolve(message.result);}
      if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails);
      if(message.method==='Log.entryAdded'&&message.params.entry.source==='security')errors.push(message.params.entry);
    });
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
    const run=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.ok(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value;};
    const wait=async expression=>{for(let n=0;n<100;n++){if(await run(expression))return;await sleep(100);}throw Error('대기 시간 초과: '+expression+' '+await run("document.getElementById('message')?.textContent")+' '+JSON.stringify(errors));};
    await send('Runtime.enable');await send('Page.enable');await send('Log.enable');
    for(const [width,height] of [[390,844],[320,568],[1920,1080]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
      await send('Page.navigate',{url:base+'/admin/'});
      await wait("!!document.getElementById('login-form')?.onsubmit");
      assert.equal(await run("document.getElementById('dashboard').hidden"),true);
      await run(`document.getElementById('password').value=${JSON.stringify(password)};document.querySelector('#login-form button').click()`);
      await wait("document.querySelectorAll('#students tr').length===3");
      assert.equal(await run("document.getElementById('harvest-count').textContent"),'1개');
      assert.equal(await run("document.getElementById('password').value"),'');
      assert.equal(await run("document.documentElement.scrollWidth<=innerWidth"),true);
      await run("document.getElementById('grade').value='1';document.getElementById('grade').dispatchEvent(new Event('change'));document.getElementById('class-no').value='1';document.getElementById('class-no').dispatchEvent(new Event('change'))");
      assert.equal(await run("document.querySelectorAll('#students tr').length"),1);
      assert.equal(await run("document.querySelector('#students tr').textContent.includes('사과')"),true);
      assert.equal(await run("document.querySelector('#students tr').textContent.includes('50%')"),true);
      await run("document.querySelector('.pin-button').click()");
      assert.equal(await run("document.getElementById('pin-dialog').open"),true);
      await run("document.getElementById('new-pin').value='0246';document.querySelector('#pin-form button[type=submit]').click()");
      await wait("document.getElementById('message').textContent.includes('변경했습니다')");
      assert.equal(await run("document.getElementById('new-pin').value"),'');
      const changed=await app.store.login({grade:1,classNo:1,number:1},'0246');
      assert.equal(changed.state.progress,50);assert.equal(changed.state.harvestCount,1);
      await run("document.getElementById('class-no').value='10';document.getElementById('class-no').dispatchEvent(new Event('change'))");
      assert.equal(await run("document.getElementById('empty').hidden"),false);
      await run("document.getElementById('class-no').value='1';document.getElementById('class-no').dispatchEvent(new Event('change'))");
      const shot=await send('Page.captureScreenshot');
      fs.writeFileSync(path.join(os.tmpdir(),`growgame-admin-${width}.png`),Buffer.from(shot.data,'base64'));
      assert.equal(await run("localStorage.length===0&&sessionStorage.length===0"),true);
      await run("document.querySelector('.delete-button').click()");
      assert.equal(await run("document.getElementById('delete-dialog').open"),true);
      assert.equal(await run("document.getElementById('delete-student').textContent"),'1학년 1반 1번');
      assert.equal(await run("document.activeElement.id"),'cancel-delete');
      assert.equal(await run("document.getElementById('delete-dialog').scrollWidth<=document.getElementById('delete-dialog').clientWidth"),true);
      await run("document.getElementById('cancel-delete').click()");
      assert.equal(await run("document.querySelectorAll('#students tr').length"),1);
      assert.equal(app.store.snapshot(app.store.authenticate(changed.token)).harvestCount,1);
      await run("document.querySelector('.delete-button').click()");
      const deleteShot=await send('Page.captureScreenshot');
      fs.writeFileSync(path.join(os.tmpdir(),`growgame-admin-delete-${width}.png`),Buffer.from(deleteShot.data,'base64'));
      await run("document.getElementById('confirm-delete').click()");
      await wait("document.getElementById('message').textContent.includes('삭제했습니다')");
      assert.equal(await run("document.getElementById('delete-dialog').open"),false);
      assert.equal(await run("document.querySelectorAll('#students tr').length"),0);
      assert.equal(await run("document.getElementById('student-count').textContent"),'0명');
      assert.equal(await run("document.getElementById('harvest-count').textContent"),'0개');
      assert.equal(await run("document.getElementById('empty').hidden"),false);
      assert.throws(()=>app.store.authenticate(changed.token),error=>error.status===401);
      assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM players').get().n,2);
      // Restore only fake test data for the next viewport.
      const restored=await app.store.login({grade:1,classNo:1,number:1},'1234');
      const restoredId=app.store.authenticate(restored.token);
      app.store.db.prepare("UPDATE players SET crop_id='apple',progress=50 WHERE id=?").run(restoredId);
      app.store.db.prepare("INSERT INTO harvests(player_id,crop_id,created_at) VALUES(?,'rice','2026-11-12T00:00:00Z')").run(restoredId);
      await run("document.getElementById('logout').click()");
      await wait("!document.getElementById('login').hidden");
      assert.equal(await run("document.querySelectorAll('#students tr').length"),0);
    }
    assert.deepEqual(errors,[]);
    console.log('관리자 브라우저 검증 통과: 모바일 390/320px·PC, 로그인, 학년·반 필터, PIN 변경, 삭제 확인·취소·성공·통계·세션 해제, 로그아웃');
  }finally{
    if(socket)socket.close();
    if(chrome&&chrome.exitCode===null){const exited=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill();await exited;}
    if(app.server.listening)await new Promise(resolve=>app.server.close(resolve));
    app.store.db.close();
    assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));
    fs.rmSync(directory,{recursive:true,force:true,maxRetries:10,retryDelay:200});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
