const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {finalizeWeb} = require('./finalize-web.cjs');

test('code and engine URLs change only when their contents change', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'growgame-build-test-'));
  t.after(() => {
    assert.ok(root.startsWith(path.join(os.tmpdir(),'growgame-build-test-')));
    fs.rmSync(root,{recursive:true,force:true});
  });
  fs.mkdirSync(path.join(root,'canvaskit','chromium'),{recursive:true});
  fs.writeFileSync(path.join(root,'canvaskit','chromium','canvaskit.wasm'),'engine-one');
  function build(code) {
    fs.writeFileSync(path.join(root,'main.dart.js'),code);
    for (const file of ['index.html','flutter_bootstrap.js']) {
      fs.writeFileSync(path.join(root,file), '"mainJsPath":"main.dart.js"; "mainWasmPath":"main.dart.wasm"; "jsSupportRuntimePath":"main.dart.mjs"; canvasKitBaseUrl: undefined');
    }
    return finalizeWeb(root);
  }
  const first = build('code-one');
  assert.deepEqual(build('code-one'),first);
  const second = build('code-two');
  assert.notEqual(second.mainUrl,first.mainUrl);
  assert.equal(second.engineUrl,first.engineUrl);
  fs.writeFileSync(path.join(root,'canvaskit','chromium','canvaskit.wasm'),'engine-two');
  const third = build('code-two');
  assert.notEqual(third.engineUrl,second.engineUrl);
  assert.equal(fs.readFileSync(path.join(root,first.mainUrl),'utf8'),'code-one');
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.ok(html.includes(third.mainUrl) && html.includes(third.engineUrl));
  fs.writeFileSync(path.join(root,'main.dart.wasm'),'wasm-one');
  fs.writeFileSync(path.join(root,'main.dart.mjs'),'runtime-one');
  fs.mkdirSync(path.join(root,'assets','fonts'),{recursive:true});
  fs.writeFileSync(path.join(root,'assets','fonts','icons.otf'),'font-one');
  fs.writeFileSync(path.join(root,'assets','FontManifest.json'),JSON.stringify([
    {family:'MaterialIcons',fonts:[{asset:'fonts/icons.otf'}]},
  ]));
  const wasm = build('code-two');
  assert.ok(fs.readFileSync(path.join(root,'index.html'),'utf8').includes(wasm.wasmUrl));
  assert.ok(fs.readFileSync(path.join(root,'flutter_bootstrap.js'),'utf8').includes(wasm.runtimeUrl));
  assert.equal(fs.readFileSync(path.join(root,wasm.runtimeUrl),'utf8'),'runtime-one');
  const font = JSON.parse(fs.readFileSync(path.join(root,'assets','FontManifest.json')))[0].fonts[0];
  assert.match(font.asset,/^hashed-fonts\/icons-[a-f0-9]{16}\.otf$/);
  assert.equal(fs.readFileSync(path.join(root,'assets',font.asset),'utf8'),'font-one');
  fs.writeFileSync(path.join(root,'main.dart.wasm'),'wasm-two');
  assert.notEqual(build('code-two').wasmUrl,wasm.wasmUrl);
});
