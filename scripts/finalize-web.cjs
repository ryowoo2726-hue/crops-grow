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

function finalizeWeb(directory) {
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
  return {mainUrl,engineUrl, ...(wasmUrl ? {wasmUrl,runtimeUrl} : {})};
}

if (require.main === module) console.log(finalizeWeb(path.resolve(__dirname,'../build/web')));
module.exports = {finalizeWeb};
