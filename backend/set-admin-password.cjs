const fs=require('node:fs');
const path=require('node:path');
const {hashPassword,credentialFile}=require('./admin.cjs');
(async()=>{
  let input='';
  for await (const chunk of process.stdin) {
    input+=chunk;
    if (input.length>256) throw Error('비밀번호 입력이 너무 깁니다.');
  }
  const credentials=await hashPassword(input.trim());
  fs.mkdirSync(path.dirname(credentialFile),{recursive:true});
  fs.writeFileSync(credentialFile,JSON.stringify(credentials)+'\n',{mode:0o600});
  console.log('관리자 비밀번호 해시를 로컬 설정 폴더에 저장했습니다. API를 다시 시작하면 적용됩니다.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
