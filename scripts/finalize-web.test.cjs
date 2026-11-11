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
      fs.writeFileSync(path.join(root,file), '"mainJsPath":"main.dart.js"; canvasKitBaseUrl: undefined');
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
});
