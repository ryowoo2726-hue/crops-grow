const http = require('node:http');
const {openStore,ApiError} = require('./store.cjs');
const {dataDirectory} = require('./config.cjs');

function createBackend({directory,origins=['http://localhost:4174','http://127.0.0.1:4174'],now=Date.now,dailyLimit=false} = {}) {
  const store = openStore(directory,{now,dailyLimit});
  const server = http.createServer(async(req,res)=>{
    const origin = req.headers.origin;
    const reply = (status,data) => { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(data)); };
    if (origin && !origins.includes(origin)) { reply(403,{error:'허용되지 않은 사이트입니다.'}); return; }
    if (origin) { res.setHeader('Access-Control-Allow-Origin',origin); res.setHeader('Vary','Origin'); }
    if (req.method==='OPTIONS') {
      res.writeHead(204,{'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Max-Age':'600'}); res.end(); return;
    }
    try {
      const url = new URL(req.url,'http://localhost');
      if (req.method==='GET' && url.pathname==='/api/health') { reply(200,{ok:true}); return; }
      let input;
      if (req.method==='POST') {
        if (!(req.headers['content-type']||'').startsWith('application/json')) throw new ApiError(415,'JSON 요청이 필요합니다.');
        const chunks=[]; let bytes=0;
        for await (const chunk of req) { bytes+=chunk.length; if(bytes<=4096) chunks.push(chunk); }
        if(bytes>4096) throw new ApiError(413,'요청 내용이 너무 큽니다.');
        try { input=JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError(400,'요청 형식을 확인해 주세요.'); }
        if (!input || Array.isArray(input) || typeof input!=='object') throw new ApiError(400,'요청 형식을 확인해 주세요.');
      }
      if (req.method==='POST' && url.pathname==='/api/session') { reply(200,await store.login(input.profile,input.pin)); return; }
      const token = (req.headers.authorization||'').replace(/^Bearer /,'');
      const playerId = store.authenticate(token);
      if (req.method==='POST' && url.pathname==='/api/logout') {
        store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(require('node:crypto').createHash('sha256').update(token).digest('hex'));
        reply(200,{ok:true}); return;
      }
      if (req.method==='GET' && url.pathname==='/api/me') { reply(200,{state:store.snapshot(playerId)}); return; }
      if (req.method==='GET' && url.pathname==='/api/garden') { reply(200,store.garden(playerId,Number(url.searchParams.get('page')||0))); return; }
      if (req.method==='GET' && url.pathname==='/api/quizzes/current') { reply(200,store.quiz()); return; }
      if (req.method==='GET' && url.pathname==='/api/missions/current') { reply(200,{mission:store.special()}); return; }
      if (req.method==='POST' && url.pathname==='/api/quizzes/check') { reply(200,store.checkAnswer(playerId,input)); return; }
      if (req.method==='POST' && url.pathname==='/api/actions') { reply(200,store.action(playerId,input)); return; }
      reply(404,{error:'요청한 기능을 찾을 수 없어요.'});
    } catch(error) {
      if (!(error instanceof ApiError)) console.error('Backend error:',error.message);
      reply(error.status||500,{error:error instanceof ApiError?error.message:'서버에서 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'});
    }
  });
  server.requestTimeout=15000; server.headersTimeout=10000;
  server.maxRequestsPerSocket=100;
  return {server,store};
}
if(require.main===module) {
  const directory=dataDirectory();
  const {server,store}=createBackend({directory,origins:(process.env.FRONTEND_ORIGINS||'https://cropgrow.sangsangbar.com,http://localhost:4174,http://127.0.0.1:4174').split(',').map(x=>x.trim()).filter(Boolean),dailyLimit:process.env.DAILY_LIMIT==='true'});
  server.listen(Number(process.env.PORT)||8787,'127.0.0.1',()=>console.log(`GrowGame API: http://127.0.0.1:${server.address().port}\nDB 폴더: ${directory}`));
  const stop=()=>server.close(()=>{store.db.close();process.exit(0);});
  process.on('SIGINT',stop); process.on('SIGTERM',stop);
}
module.exports={createBackend};
