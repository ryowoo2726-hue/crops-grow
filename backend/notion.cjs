const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {setTimeout:pause} = require('node:timers/promises');
const {configFile} = require('./config.cjs');

function readNotionSettings() {
  const directory = path.dirname(configFile);
  const settingsFile = path.join(directory,'notion-config.json');
  const settings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile,'utf8').replace(/^\uFEFF/,'')) : {};
  let token = process.env.NOTION_API_KEY;
  const tokenFile = path.join(directory,'notion-token.clixml');
  if (!token && process.platform === 'win32' && fs.existsSync(tokenFile)) {
    const script = "$secret=Import-Clixml -LiteralPath $env:GROWGAME_NOTION_TOKEN_FILE; try { [Console]::Write(([Net.NetworkCredential]::new('', $secret)).Password) } finally { $secret.Dispose() }";
    const result = spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{
      encoding:'utf8',windowsHide:true,timeout:15000,env:{...process.env,GROWGAME_NOTION_TOKEN_FILE:tokenFile},
    });
    if (result.status !== 0) throw Error('로컬 노션 인증 설정을 읽지 못했습니다.');
    token = result.stdout.trim();
  }
  const dataSourceId = process.env.GROWGAME_NOTION_DATA_SOURCE || settings.dataSourceId;
  if (!token || !dataSourceId) return null;
  if (!/^[a-f0-9-]{32,36}$/i.test(dataSourceId)) throw Error('노션 검토함 설정을 확인하세요.');
  return {token,dataSourceId,reviewPageUrl:settings.reviewPageUrl || ''};
}

function profileLabel(profile) {
  if (profile.role === 'teacher') return `${profile.name} 선생님`;
  return `${profile.grade}학년 ${profile.classNo}반 ${profile.number}번 ${profile.name || ''}`.trim();
}
const richText = text => [{type:'text',text:{content:text}}];

function createNotionClient(settings, fetcher = fetch) {
  if (!settings) return null;
  let nextRequestAt = 0;
  async function request(route, method = 'GET', body) {
    await pause(Math.max(0,nextRequestAt-Date.now()));
    nextRequestAt = Date.now()+350;
    const response = await fetcher('https://api.notion.com/v1/'+route,{
      method,headers:{Authorization:'Bearer '+settings.token,'Notion-Version':'2025-09-03','Content-Type':'application/json'},
      ...(body ? {body:JSON.stringify(body)} : {}),signal:AbortSignal.timeout(8000),
    });
    if (!response.ok) throw Error('노션 연결 또는 검토함 권한을 확인하세요.');
    return response.json();
  }
  async function ensurePage(message) {
    const existing = await request(`data_sources/${settings.dataSourceId}/query`,'POST',{
      filter:{property:'기록 ID',rich_text:{equals:message.id}},page_size:1,
    });
    if (existing.results.length) return existing.results[0].id;
    const sender = profileLabel(JSON.parse(message.sender_json));
    const recipient = profileLabel({grade:message.recipient_grade,classNo:message.recipient_class,number:message.recipient_number,name:message.recipient_name});
    const page = await request('pages','POST',{
      parent:{type:'data_source_id',data_source_id:settings.dataSourceId},
      properties:{
        '메시지':{title:richText(`${sender} → ${recipient}`)},
        '보낸 사람':{rich_text:richText(sender)},'받는 학생':{rich_text:richText(recipient)},
        '감사의 말':{rich_text:richText(message.body)},'글자 수':{number:message.char_count},
        '검토 상태':{select:{name:'검토 대기'}},'제출 시각':{date:{start:message.created_at}},
        '미션 번호':{number:message.campaign_id},'기록 ID':{rich_text:richText(message.id)},
      },
      children:[{object:'block',type:'paragraph',paragraph:{rich_text:richText(message.body)}}],
    });
    return page.id;
  }
  async function markDelivered(message) {
    await request('pages/'+message.notion_page_id,'PATCH',{
      properties:{'검토 상태':{select:{name:'전송 완료'}},'전송 시각':{date:{start:message.delivered_at}}},
    });
  }
  return {ensurePage,markDelivered,reviewPageUrl:settings.reviewPageUrl};
}

function createNotionSync(store, client, now = Date.now) {
  let running = null, stopped = false, lastError = false;
  function status() {
    const pending = store.db.prepare("SELECT COUNT(*) n FROM gratitude_messages WHERE notion_page_id='' OR (delivered_at<>'' AND notion_delivered=0)").get().n;
    return {configured:!!client,pending,error:lastError,reviewPageUrl:client?.reviewPageUrl || ''};
  }
  async function syncBatch() {
    if (!client || stopped) return;
    const rows = store.db.prepare(`SELECT * FROM gratitude_messages
      WHERE (notion_page_id='' OR (delivered_at<>'' AND notion_delivered=0)) AND sync_after<=?
      ORDER BY created_at,id LIMIT 20`).all(now());
    for (const row of rows) {
      if (stopped) break;
      const lease = store.db.prepare('UPDATE gratitude_messages SET sync_after=? WHERE id=? AND sync_after<=?').run(now()+120000,row.id,now());
      if (!lease.changes) continue;
      try {
        if (!row.notion_page_id) {
          const pageId = await client.ensurePage(row);
          if (stopped) return;
          store.db.prepare('UPDATE gratitude_messages SET notion_page_id=?,sync_after=0 WHERE id=?').run(pageId,row.id);
        } else {
          await client.markDelivered(row);
          if (stopped) return;
          store.db.prepare('UPDATE gratitude_messages SET notion_delivered=1,sync_after=0 WHERE id=?').run(row.id);
        }
        lastError = false;
      } catch {
        if (stopped) return;
        store.db.prepare('UPDATE gratitude_messages SET sync_after=? WHERE id=?').run(now()+60000,row.id);
        lastError = true;
      }
    }
  }
  function flush() {
    if (!running) running = syncBatch().finally(()=>{running=null;});
    return running;
  }
  return {flush,status,start:()=>{stopped=false;},stop:()=>{stopped=true;}};
}
module.exports = {readNotionSettings,createNotionClient,createNotionSync};
