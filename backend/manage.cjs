const fs = require('node:fs');
const path = require('node:path');
const {backup} = require('node:sqlite');
const {openStore} = require('./store.cjs');
const {dataDirectory} = require('./config.cjs');
(async()=>{
  const args=process.argv.slice(2), command=args[0], file=args[1];
  const store=openStore(dataDirectory(args));
  try {
    if (command==='init') { console.log('데이터베이스 준비 완료'); }
    else if (command==='import-quiz' || command==='import-special') {
      if (!file || file.startsWith('--')) throw Error('가져올 JSON 파일을 지정하세요.');
      const input=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
      command==='import-quiz'?store.importQuiz(input):store.importSpecial(input);
      console.log(`${input.week} 미션 저장 완료`);
    } else if(command==='reset-pin') {
      if(!process.stdin.isTTY) throw Error('PIN 초기화는 노트북 터미널에서 직접 실행하세요.');
      const prompt=require('node:readline/promises').createInterface({input:process.stdin,output:process.stdout});
      try {
        const pin=await prompt.question('새 숫자 4자리 PIN: ');
        await store.resetPin({grade:Number(args[1]),classNo:Number(args[2]),number:Number(args[3])},pin);
        console.log('PIN을 초기화하고 기존 로그인 세션을 종료했습니다.');
      } finally { prompt.close(); }
    } else if(command==='backup') {
      if(!file || file.startsWith('--')) throw Error('백업할 파일 경로를 지정하세요.');
      const destination=path.resolve(file);
      if(fs.existsSync(destination)) throw Error('기존 백업을 덮어쓰지 않습니다. 새 파일명을 지정하세요.');
      fs.mkdirSync(path.dirname(destination),{recursive:true});
      await backup(store.db,destination);
      console.log('백업 완료');
    } else throw Error('명령: init | import-quiz 파일.json | import-special 파일.json | backup 백업.sqlite | reset-pin 학년 반 번호');
  } finally { store.db.close(); }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
