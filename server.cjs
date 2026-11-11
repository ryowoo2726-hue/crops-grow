const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const webRoot=path.join(__dirname,'build','web');
const port=Number(process.env.PORT)||4174;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml','.ttf':'font/ttf','.json':'application/json; charset=utf-8','.wasm':'application/wasm'};
http.createServer((req,res)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
  const route=pathname==='/'?'/index.html':pathname;
  const built=path.resolve(webRoot,'.'+route);
  if(!built.startsWith(webRoot+path.sep)){res.writeHead(403);res.end();return;}
  if(pathname==='/' && !fs.existsSync(built)){
    res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8'});
    res.end('Flutter Web 빌드가 필요합니다. flutter pub get 후 flutter build web --no-web-resources-cdn을 실행하세요.');return;
  }
  const immutable=route.startsWith('/static/')||route.startsWith('/assets/assets/optimized/')||/^\/assets\/assets\/fonts\/NotoSansKR-[a-f0-9]{16}\.woff2$/.test(route);
  fs.readFile(built,(error,bytes)=>{if(error){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':types[path.extname(built)]||'application/octet-stream','Cache-Control':immutable?'public, max-age=31536000, immutable':'no-cache'});res.end(bytes);});
}).listen(port,'0.0.0.0',()=>console.log(`작물 키우기: http://localhost:${port} · 같은 네트워크 접속 허용`));
