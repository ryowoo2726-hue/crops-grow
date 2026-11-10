const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const configFile = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(),'.config'),'growgame-server','config.json');
function dataDirectory(args = process.argv.slice(2)) {
  const index = args.indexOf('--data-dir');
  const directory = index>=0 ? args[index+1] : process.env.GROWGAME_DATA_DIR || (fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile,'utf8').replace(/^\uFEFF/,'')).dataDirectory : '');
  if (!directory || !path.isAbsolute(directory)) throw Error('먼저 backend/start.ps1에서 저장 폴더를 선택하거나 --data-dir 절대경로를 지정하세요.');
  return path.resolve(directory);
}
module.exports = {dataDirectory};
