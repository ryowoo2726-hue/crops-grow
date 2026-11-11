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
  for (const name of ['index.html','flutter_bootstrap.js']) {
    const file = path.join(directory,name);
    const input = fs.readFileSync(file,'utf8');
    if (!input.includes('"mainJsPath":"main.dart.js"') ||
        !/canvasKitBaseUrl:\s*(?:"canvaskit\/"|undefined)/.test(input)) {
      throw Error(`Missing Flutter startup configuration in ${name}`);
    }
    fs.writeFileSync(file, input
      .replace('"mainJsPath":"main.dart.js"',`"mainJsPath":"${mainUrl}"`)
      .replace(/canvasKitBaseUrl:\s*(?:"canvaskit\/"|undefined)/,`canvasKitBaseUrl: "${engineUrl}"`));
  }
  return {mainUrl,engineUrl};
}

if (require.main === module) console.log(finalizeWeb(path.resolve(__dirname,'../build/web')));
module.exports = {finalizeWeb};
