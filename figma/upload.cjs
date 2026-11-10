const fs = require('node:fs');
const path = require('node:path');
const plan = JSON.parse(Buffer.from(process.env.FIGMA_UPLOAD_PLAN, 'base64').toString('utf8'));
const cropIds = ['rice','sweet-potato','soybean','radish','napa-cabbage','apple','persimmon'];
const files = cropIds.flatMap(id => [1,2,3,4].map(stage => `crops/${id}-stage-0${stage}.png`).concat(`crops/${id}-harvest.png`)).concat(['environment/field-base.png','environment/field-dry-base.png','characters/drop-default.png','characters/drop-cheer.png','characters/drop-happy.png','characters/drop-celebrate.png']);
(async () => {
  const results = await Promise.allSettled(plan.uploads.map(async (upload,index) => {
    const bytes = fs.readFileSync(path.join(__dirname,'../assets',files[index]));
    const response = await fetch(upload.submitUrl,{method:'POST',headers:{'Content-Type':'image/png'},body:bytes});
    if(!response.ok) throw new Error(`${files[index]}: HTTP ${response.status}`);
    return files[index];
  }));
  const failures = results.filter(item=>item.status==='rejected');
  if(failures.length) throw new Error(failures.map(item=>item.reason.message).join('\n'));
  if(plan.commitUrl) {
    const response = await fetch(plan.commitUrl,{method:'POST'});
    if(!response.ok) throw new Error(`최종 반영: HTTP ${response.status}`);
  }
  console.log(`업로드 완료: ${results.length}개 원본 이미지`);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
