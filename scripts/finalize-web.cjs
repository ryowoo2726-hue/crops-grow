// Content-addressed URLs let browsers reuse code and engine files across visits.
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');

function filesIn(directory) {
  return fs.readdirSync(directory, {withFileTypes:true}).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(full) : [full];
  }).sort();
}

function finalizeWeb(directory,apiBaseUrl=process.env.API_BASE_URL||'https://cropgrow-api.sangsangbar.com') {
  const apiOrigin=new URL(apiBaseUrl);
  if(!['http:','https:'].includes(apiOrigin.protocol)||apiOrigin.username||apiOrigin.password)throw Error('API_BASE_URL must be an HTTP(S) URL without credentials');
  const fontManifest = path.join(directory,'assets','FontManifest.json');
  if (fs.existsSync(fontManifest)) {
    const families = JSON.parse(fs.readFileSync(fontManifest,'utf8'));
    for (const family of families) for (const font of family.fonts) {
      if (!font.asset.startsWith('fonts/')) continue;
      const source = path.join(directory,'assets',font.asset);
      const bytes = fs.readFileSync(source);
      const hash = createHash('sha256').update(bytes).digest('hex').slice(0,16);
      const name = path.parse(font.asset);
      font.asset = `hashed-fonts/${name.name}-${hash}${name.ext}`;
      const target = path.join(directory,'assets',font.asset);
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.writeFileSync(target,bytes);
    }
    fs.writeFileSync(fontManifest,JSON.stringify(families));
  }
  const main = fs.readFileSync(path.join(directory, 'main.dart.js'));
  const mainHash = createHash('sha256').update(main).digest('hex').slice(0,16);
  const engineRoot = path.join(directory, 'canvaskit');
  const engineDigest = createHash('sha256');
  for (const file of filesIn(engineRoot)) {
    engineDigest.update(path.relative(engineRoot,file).replaceAll('\\','/'));
    engineDigest.update(fs.readFileSync(file));
  }
  const engineHash = engineDigest.digest('hex').slice(0,16);
  const mainUrl = `static/main-${mainHash}.js`;
  const engineUrl = `static/canvaskit-${engineHash}/`;
  fs.mkdirSync(path.join(directory,'static'), {recursive:true});
  fs.writeFileSync(path.join(directory,mainUrl), main);
  fs.cpSync(engineRoot,path.join(directory,engineUrl), {recursive:true});
  let wasmUrl, runtimeUrl;
  if (fs.existsSync(path.join(directory,'main.dart.wasm'))) {
    const wasm = fs.readFileSync(path.join(directory,'main.dart.wasm'));
    const runtime = fs.readFileSync(path.join(directory,'main.dart.mjs'));
    const hash = createHash('sha256').update(wasm).update(runtime).digest('hex').slice(0,16);
    wasmUrl = `static/main-${hash}.wasm`;
    runtimeUrl = `static/main-${hash}.mjs`;
    fs.writeFileSync(path.join(directory,wasmUrl),wasm);
    fs.writeFileSync(path.join(directory,runtimeUrl),runtime);
  }
  for (const name of ['index.html','flutter_bootstrap.js']) {
    const file = path.join(directory,name);
    const input = fs.readFileSync(file,'utf8');
    if (!input.includes('"mainJsPath":"main.dart.js"') ||
        !/canvasKitBaseUrl:\s*(?:"canvaskit\/"|undefined)/.test(input)) {
      throw Error(`Missing Flutter startup configuration in ${name}`);
    }
    let output = input
      .replace('"mainJsPath":"main.dart.js"',`"mainJsPath":"${mainUrl}"`)
      .replace(/canvasKitBaseUrl:\s*(?:"canvaskit\/"|undefined)/,`canvasKitBaseUrl: "${engineUrl}"`);
    if (wasmUrl) output = output
      .replace('"mainWasmPath":"main.dart.wasm"',`"mainWasmPath":"${wasmUrl}"`)
      .replace('"jsSupportRuntimePath":"main.dart.mjs"',`"jsSupportRuntimePath":"${runtimeUrl}"`);
    fs.writeFileSync(file,output);
  }
  const adminDirectory=path.join(directory,'admin');
  fs.cpSync(path.resolve(__dirname,'../backend/admin'),adminDirectory,{recursive:true});
  const adminIndex=path.join(adminDirectory,'index.html');
  fs.writeFileSync(adminIndex,fs.readFileSync(adminIndex,'utf8').replace('name="growgame-api-base" content=""',`name="growgame-api-base" content="${apiOrigin.origin}"`));
  const headers=fs.readFileSync(path.resolve(__dirname,'../web/_headers'),'utf8');
  fs.writeFileSync(path.join(directory,'_headers'),headers+`\n/admin/*\n  Cache-Control: no-store\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ${apiOrigin.origin}; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'\n`);
  return {mainUrl,engineUrl, ...(wasmUrl ? {wasmUrl,runtimeUrl} : {})};
}

if (require.main === module) console.log(finalizeWeb(path.resolve(__dirname,'../build/web')));
module.exports = {finalizeWeb};
