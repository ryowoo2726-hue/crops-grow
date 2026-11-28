const {createServer} = require('node:http');
const {createHash,randomBytes,scrypt,timingSafeEqual} = require('node:crypto');
const {promisify} = require('node:util');
const {existsSync,readFileSync} = require('node:fs');
const {DatabaseSync} = require('node:sqlite');
const {createRecords} = require('./records.cjs');
const {loginPage,rankingPage,pickupPage,quizReportPage} = require('./views.cjs');

const derive = promisify(scrypt);
const hashToken = token => createHash('sha256').update(token).digest('hex');
const stylesheet = readFileSync(require.resolve('./dashboard.css'));
const lifespan = 4 * 60 * 60 * 1000;
const lockout = 15 * 60 * 1000;
const cookie = 'growgame_operator';
const pickupPath = '/dashboard/pickup';
const reportPath = '/dashboard/report';
const root = '/dashboard/';
const positiveId = value => /^\d{1,15}$/.test(value ?? '') ? Number(value) : 0;

async function readForm(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') {
    throw Object.assign(Error('지원하지 않는 요청입니다.'),{status:415});
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw Object.assign(Error('입력이 너무 깁니다.'),{status:413});
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function createDashboard(db, {origin, credentials, now = Date.now}) {
  const expected = new URL(origin);
  if (!/^https?:$/.test(expected.protocol) || origin !== expected.origin ||
      !/^[a-f0-9]{32}$/.test(credentials?.salt) || !/^[a-f0-9]{64}$/.test(credentials?.hash)) {
    throw Error('대시보드 주소와 비밀번호 해시 설정을 확인하세요.');
  }
  const records = createRecords(db,now);
  const sessions = new Map();
  let attempts = 0;
  let lockedUntil = 0;
  const cookieOptions = `Path=${root}; HttpOnly; SameSite=Strict${expected.protocol === 'https:' ? '; Secure' : ''}`;
  const sessionCookie = req => (req.headers.cookie ?? '').split(';').map(value => value.trim())
    .find(value => value.startsWith(cookie+'='))?.slice(cookie.length+1) ?? '';
  const headers = {
    'Content-Type':'text/html; charset=utf-8',
    'Cache-Control':'no-store',
    'Content-Security-Policy':"default-src 'none'; style-src 'self'; connect-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    'Cross-Origin-Resource-Policy':'same-origin',
    'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'DENY',
    'Referrer-Policy':'same-origin',
    'X-Robots-Tag':'noindex, nofollow',
  };

  const server = createServer(async (req,res) => {
    const reply = (status,body,extra = {}) => {
      res.writeHead(status,{...headers,...extra});
      res.end(body);
    };
    const redirect = (location,extra) => reply(303,'',{Location:location,...extra});
    try {
      if (req.headers.host !== expected.host) return reply(421,'올바른 주소로 접속해 주세요.');
      const url = new URL(req.url,origin);
      if (url.origin !== origin) return reply(400,'요청 주소를 확인해 주세요.');
      if (req.method === 'GET' && url.pathname === '/dashboard/dashboard.css') {
        return reply(200,stylesheet,{'Content-Type':'text/css; charset=utf-8'});
      }
      if (req.headers['sec-fetch-mode'] && req.headers['sec-fetch-mode'] !== 'navigate') {
        return reply(403,'화면 주소를 직접 열어 주세요.');
      }
      if (req.method === 'GET' && url.pathname === '/dashboard') return redirect(root);
      const relevant = [root,pickupPath,reportPath,'/dashboard/sign-in','/dashboard/sign-out','/dashboard/pickup/search','/dashboard/pickup/redeem'];
      if (!relevant.includes(url.pathname)) return reply(404,'요청한 화면을 찾을 수 없습니다.');

      let form;
      if (req.method === 'POST') {
        if (req.headers.origin !== origin || ['cross-site','same-site'].includes(req.headers['sec-fetch-site'])) {
          return reply(403,'이 화면에서 다시 요청해 주세요.');
        }
        form = await readForm(req);
      }
      const requestedPage = form?.get('next') || url.pathname;
      const next = [pickupPath,reportPath].includes(requestedPage) ? requestedPage : root;
      const session = sessionCookie(req);
      const sessionKey = /^[A-Za-z0-9_-]{43}$/.test(session) ? hashToken(session) : '';
      const signedIn = sessions.get(sessionKey) > now();

      if (req.method === 'POST' && url.pathname === '/dashboard/sign-in') {
        if (lockedUntil > now()) return reply(429,loginPage(next,'로그인 시도가 많습니다. 15분 뒤 다시 시도하세요.'));
        if (lockedUntil) { attempts = 0; lockedUntil = 0; }
        if (++attempts >= 5) lockedUntil = now() + lockout;
        const password = form.get('password') ?? '';
        const valid = /^\d{4,64}$/.test(password) &&
          timingSafeEqual(await derive(password,credentials.salt,32),Buffer.from(credentials.hash,'hex'));
        if (!valid) return reply(401,loginPage(next,'비밀번호를 확인해 주세요.'));
        attempts = 0;
        lockedUntil = 0;
        for (const [key,expires] of sessions) if (expires <= now()) sessions.delete(key);
        if (signedIn) sessions.delete(sessionKey);
        const token = randomBytes(32).toString('base64url');
        sessions.set(hashToken(token),now()+lifespan);
        return redirect(next,{'Set-Cookie':`${cookie}=${token}; ${cookieOptions}; Max-Age=${lifespan/1000}`});
      }
      if (!signedIn) return reply(req.method === 'GET' ? 200 : 401,loginPage(next));
      if (req.method === 'POST' && url.pathname === '/dashboard/sign-out') {
        sessions.delete(sessionKey);
        return redirect(root,{'Set-Cookie':`${cookie}=; ${cookieOptions}; Max-Age=0`});
      }
      if (req.method === 'GET' && url.pathname === root) return reply(200,rankingPage(records.students(),url.searchParams));
      if (req.method === 'GET' && url.pathname === reportPath) return reply(200,quizReportPage(records,url.searchParams));
      if (req.method === 'GET' && url.pathname === pickupPath) {
        const person = records.person(positiveId(url.searchParams.get('person')));
        const receipt = records.receipt(positiveId(url.searchParams.get('receipt')));
        return reply(200,pickupPage(records,{person,receipt,page:positiveId(url.searchParams.get('page'))}));
      }
      if (req.method === 'POST' && url.pathname === '/dashboard/pickup/search') {
        const query = (form.get('query') ?? '').trim().normalize('NFC').slice(0,80);
        const role = ['student','teacher'].includes(form.get('role')) ? form.get('role') : '';
        return reply(200,pickupPage(records,{query,role}));
      }
      if (req.method === 'POST' && url.pathname === '/dashboard/pickup/redeem') {
        const result = records.redeem(positiveId(form.get('person')),form.get('key'));
        if (result.receipt) return redirect(`${pickupPath}?receipt=${result.receipt.id}`);
        return reply(result.status,pickupPage(records,{error:result.message}));
      }
      return reply(405,'요청 방법을 확인해 주세요.');
    } catch (error) {
      if (error.status) return reply(error.status,error.message);
      console.error('Dashboard request failed:',error.code ?? error.name);
      return reply(500,'기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  });
  server.headersTimeout=10000;
  server.requestTimeout=15000;
  return server;
}

if (require.main === module) {
  const file = process.env.GROWGAME_DASHBOARD_DB;
  if (!file || !existsSync(file)) throw Error('운영 SQLite 경로를 확인하세요.');
  const db = new DatabaseSync(file);
  const credentials = JSON.parse(readFileSync(process.env.GROWGAME_DASHBOARD_CREDENTIALS,'utf8'));
  const origin = process.env.GROWGAME_DASHBOARD_ORIGIN;
  const port = Number(process.env.GROWGAME_DASHBOARD_PORT) || 4189;
  const server = createDashboard(db,{origin,credentials});
  server.listen(port,'127.0.0.1');
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal,() => server.close(() => db.close()));
}

module.exports = {createDashboard};
