// Figma use_figma 실행용 코드: 컴포넌트·인스턴스를 만들지 않습니다.
const page = await figma.getNodeByIdAsync('0:1');
await figma.setCurrentPageAsync(page);
await Promise.all(['Regular','Bold'].map(style => figma.loadFontAsync({family:'Noto Sans KR',style})));
const created = [];
const C = {cream:'#F7F8F2',green:'#4D9164',ink:'#263C30',muted:'#6D7F71',line:'#E2E8DC',pale:'#EDF3E7',white:'#FFFFFF',scene:'#F3F6EC',gold:'#D3AA45'};
function paint(hex) { const n=parseInt(hex.slice(1),16);return {type:'SOLID',color:{r:((n>>16)&255)/255,g:((n>>8)&255)/255,b:(n&255)/255}}; }
function track(node) { created.push(node.id); return node; }
const files=['rice','sweet-potato','soybean','radish','napa-cabbage','apple','persimmon'].flatMap(c=>[1,2,3,4].map(s=>`crops/${c}-stage-0${s}.png`).concat(`crops/${c}-harvest.png`)).concat(['environment/field-base.png','environment/field-dry-base.png','characters/drop-default.png','characters/drop-cheer.png','characters/drop-happy.png','characters/drop-celebrate.png']);
const sourceNodes=await Promise.all(files.map((_,i)=>figma.getNodeByIdAsync(`5:${3+i*2}`)));
const imagePaints={};
sourceNodes.forEach((node,index)=>{const fill=node.fills.find(p=>p.type==='IMAGE');if(!fill)throw new Error(`원본 이미지 미반영: ${files[index]}`);imagePaints[files[index]]={...fill,scaleMode:'FIT'};});
const cropNames=['벼','고구마','콩','무','배추','사과','감'];
const cropIds=['rice','sweet-potato','soybean','radish','napa-cabbage','apple','persimmon'];
function stack(parent,name,w,direction='VERTICAL',pad=0,gap=12,bg=null) {
  const n=track(figma.createAutoLayout(direction));parent.appendChild(n);n.name=name;n.resize(w,100);
  n.primaryAxisSizingMode=direction==='VERTICAL'?'AUTO':'FIXED';n.counterAxisSizingMode=direction==='VERTICAL'?'FIXED':'AUTO';
  n.itemSpacing=gap;n.paddingLeft=n.paddingRight=n.paddingTop=n.paddingBottom=pad;n.fills=bg?[paint(bg)]:[];n.clipsContent=false;return n;
}
function text(parent,name,value,w,size=13,bold=false,color=C.ink) {
  const n=track(figma.createText());parent.appendChild(n);n.name=name;n.fontName={family:'Noto Sans KR',style:bold?'Bold':'Regular'};
  n.fontSize=size;n.lineHeight={unit:'PIXELS',value:Math.ceil(size*1.65)};n.characters=value;n.fills=[paint(color)];n.resize(w,1);n.textAutoResize='HEIGHT';return n;
}
function rect(parent,name,w,h,color,radius=0) {const n=track(figma.createRectangle());parent.appendChild(n);n.name=name;n.resize(w,h);n.fills=[paint(color)];n.cornerRadius=radius;return n;}
function frame(parent,name,w,h,bg=null,radius=0) {const n=track(figma.createFrame());parent.appendChild(n);n.name=name;n.resize(w,h);n.fills=bg?[paint(bg)]:[];n.cornerRadius=radius;n.clipsContent=false;return n;}
function image(parent,file,w,h,x=0,y=0) {const n=track(figma.createRectangle());parent.appendChild(n);n.name=file;n.resize(w,h);n.fills=[imagePaints[file]];n.x=x;n.y=y;return n;}
function card(parent,name,w,pad=24,bg=C.white,gap=14) {const n=stack(parent,name,w,'VERTICAL',pad,gap,bg);n.cornerRadius=22;n.strokes=[paint(C.line)];n.strokeWeight=1;return n;}
function badge(parent,label,w=92) {const n=stack(parent,`배지 · ${label}`,w,'HORIZONTAL',7,0,C.pale);n.cornerRadius=20;text(n,'배지 문구',label,w-14,10,false,'#58764D');return n;}
function button(parent,label,w,kind='primary') {const bg=kind==='primary'?C.green:kind==='gold'?C.gold:kind==='secondary'?C.white:null;const n=stack(parent,`버튼 · ${label}`,w,'HORIZONTAL',0,0,bg);n.resize(w,48);n.primaryAxisSizingMode='FIXED';n.counterAxisSizingMode='FIXED';n.primaryAxisAlignItems='CENTER';n.counterAxisAlignItems='CENTER';n.cornerRadius=12;if(kind==='secondary'){n.strokes=[paint(C.line)];n.strokeWeight=1;}const t=text(n,'버튼 문구',label,w-24,12,true,kind==='primary'||kind==='gold'?C.white:C.green);t.textAlignHorizontal='CENTER';return n;}
function progress(parent,w,value,label='마음 성장도') {
  const title=stack(parent,'성장도 제목과 숫자',w,'HORIZONTAL',0,0);text(title,'성장도 제목',label,w-100,12);const n=text(title,'성장률 숫자',`${value} / 100%`,100,20,true);n.textAlignHorizontal='RIGHT';
  const bar=frame(parent,'성장 바 · 배경',w,10,'#EDF0E6',10);rect(bar,'성장 바 · 채워진 영역',Math.max(1,w*value/100),10,C.green,10);
  const row=stack(parent,'성장 안내',w,'HORIZONTAL',0,0);text(row,'완성까지 안내',value===100?'마음을 담아 수확해 주세요':`완성까지 ${100-value}% 남았어요`,w-115,9,false,C.muted);const t=text(row,'완성 기준','100%가 되면 수확!',115,9,false,C.muted);t.textAlignHorizontal='RIGHT';
}
function scene(parent,w,value=50,crop='rice',h=310,guide=true) {
  const s=frame(parent,`작물 장면 · ${value}%`,w,h,C.scene,17);
  const caption=text(s,'장면 안내','작은 실천을 기다리는 나의 밭',w-36,10,false,'#91A185');caption.x=18;caption.y=16;
  const square=h; const x=(w-square)/2;
  image(s,`environment/${crop==='rice'?'field-base':'field-dry-base'}.png`,square,square,x,0);
  if(value===50) {
    const a=image(s,`crops/${crop}-stage-02.png`,square*1.06,square*1.06,x-square*.03,-square*.06*.82);a.opacity=.5;
    const b=image(s,`crops/${crop}-stage-03.png`,square*.86,square*.86,x+square*.07,square*.14*.82);b.opacity=.5;
  } else image(s,`crops/${crop}-stage-0${value>=100?4:value===0?1:3}.png`,square,square,x,0);
  if(guide)image(s,`characters/${value>=100?'drop-celebrate':'drop-default'}.png`,80,80,w-85,h-110);
  return s;
}
function miniGarden(parent,w) {const s=frame(parent,'정원 미리보기 · 최근 수확 4개',w,92,C.scene,12);['radish','napa-cabbage','apple','persimmon'].forEach((id,i)=>image(s,`crops/${id}-stage-04.png`,w/4,92,i*w/4,0));return s;}
function mission(parent,w) {const c=card(parent,'오늘의 미션 카드',w,24,'#F0F4E9',16);const iw=w-48;const row=stack(c,'미션 종류와 성장량',iw,'HORIZONTAL',0,iw-180);badge(row,'오늘의 작은 실천',125);text(row,'미션 성장량','+30%',55,12,true,C.green);text(c,'미션 제목','고마운 마음,\n오늘은 전해볼까요?',iw,23,true);text(c,'미션 설명','고마웠던 사람을 떠올리고\n짧은 감사의 말을 전해보세요.',iw,12,false,C.muted);button(c,'미션 살펴보기 →',iw,'secondary');return c;}
function teaser(parent,w) {const c=card(parent,'반 공동 정원 안내 카드',w,24);const iw=w-48;text(c,'정원 영문 안내','TOGETHER WE GROW',iw,10,true,C.green);text(c,'정원 소개','나의 수확이\n우리 반의 정원으로.',iw,20,true);miniGarden(c,iw);text(c,'함께 쌓은 수확','함께 쌓은 수확                         7개',iw,12,false,C.muted);button(c,'우리 반 정원 구경하기 →',iw,'text');return c;}
function farmCard(parent,w,value=50,crop='rice') {
  const c=card(parent,`개인 농장 카드 · ${value}%`,w,24,C.white,14);const iw=w-48;
  const heading=stack(c,'작물 제목과 단계',iw,'HORIZONTAL',0,12);const left=stack(heading,'작물 제목',iw-112,'VERTICAL',0,3);text(left,'농장 영문','MY LITTLE FARM',iw-112,10,true,C.green);text(left,'키우는 작물',`${cropNames[cropIds.indexOf(crop)]} 키우는 중`,iw-112,21,true);badge(heading,value===100?'수확 준비 완료':value===0?'씨앗':'초록빛 성장',100);
  progress(c,iw,value);scene(c,iw,value,crop,310,true);
  const msg=text(c,'성장 상태 안내',value===100?'100% 완성! 우리 반 정원에 더해주세요.':'조금 더 자랐어요. 작은 실천을 이어가요.',iw,11,false,C.muted);msg.textAlignHorizontal='CENTER';
  button(c,value===100?'작물 수확하기 · 우리 반 정원에 더하기':'마음 담아 물 주기                 +20%',iw,value===100?'gold':'primary');
  const note=text(c,'물 주기 규칙','체험 모드에서는 여러 번 물을 줄 수 있어요.',iw,10,false,C.muted);note.textAlignHorizontal='CENTER';return c;
}
function chrome(screen,w,mobile,view) {
  const iw=w-(mobile?36:208);
  const head=stack(screen,'앱 헤더',iw,'HORIZONTAL',0,10);
  const logo=frame(head,'로고 배경',42,42,C.green,13);const glyph=text(logo,'로고 문자','♧',34,29,false,C.white);glyph.x=5;glyph.y=-4;
  const titles=stack(head,'앱 이름과 소개',iw-42-20-66,'VERTICAL',0,0);text(titles,'앱 이름','마음이 자라는 논밭',iw-128,mobile?14:17,true);text(titles,'앱 소개','작은 실천이 모여, 함께 자라는 우리',iw-128,9,false,C.muted);text(head,'참여 안내 링크','참여 안내',66,11,false,C.muted);
  rect(screen,'헤더 구분선',iw,1,C.line);
  const intro=stack(screen,'인사와 참여 정보',iw,'VERTICAL',0,5);text(intro,'인사 작은 제목','우리의 가을, 우리의 정원',iw,10,true,C.green);text(intro,'오늘의 인사','오늘도 마음 한 뼘 자라요.',iw,mobile?24:30,true);text(intro,'인사 설명','나의 작은 실천이 우리 반 정원이 되는 곳.',iw,12,false,C.muted);
  if(!mobile)text(intro,'참여 정보','2학년 3반 · 12번의 논밭  /  예시 참여 정보',iw,11,false,C.muted);
  const strip=stack(screen,'체험판 안내와 일일 규칙',iw,'HORIZONTAL',10,0,'#EEF2E8');strip.cornerRadius=10;text(strip,'로컬 저장 안내','● 로컬 체험판 · 이 브라우저에 저장',mobile?183:iw-200,10,false,C.muted);text(strip,'일일 규칙 토글','□ 하루 1회 규칙 체험',mobile?iw-203:180,10,false,C.muted);
  const nav=stack(screen,'주요 화면 내비게이션',iw,'HORIZONTAL',0,22);['나의 논밭','우리 반 정원  7','작물 도감'].forEach((label,i)=>{const item=stack(nav,`탭 · ${label}`,mobile?[64,102,65][i]:130,'VERTICAL',0,9);text(item,'탭 이름',label,mobile?[64,102,65][i]:130,12,true,i===view?C.green:C.muted);if(i===view)rect(item,'선택된 탭 표시',mobile?[64,102,65][i]:130,2,C.green);});return iw;
}
function footer(screen,w) {text(screen,'다시 참여 안내','하루를 놓쳐도 괜찮아요. 언제든 다시 함께 자라요.',w,10,false,'#8A9986');}
function garden(parent,w,mobile) {
  const c=card(parent,'우리 반 공동 정원',w,mobile?20:28,C.white,18);const iw=w-(mobile?40:56);
  text(c,'정원 영문','OUR CLASS GARDEN',iw,10,true,C.green);text(c,'정원 제목','작은 실천이 모여 만든 정원',iw,mobile?19:24,true);text(c,'정원 설명','우리가 수확할 때마다, 정원도 한 칸씩 자라요.',iw,12,false,C.muted);badge(c,'2학년 3반',96);
  const summary=card(c,'학급 공동 목표',iw,18,'#F4F7EF',8);const sw=iw-36;text(summary,'누적 수확','함께 모은 수확  7개',sw,20,true);text(summary,'다음 공동 목표','수확 3개가 더 모이면 꽃이 피어요.',sw,12,false,C.muted);const bar=frame(summary,'공동 목표 바',sw,8,'#E7EDDF',8);rect(bar,'공동 목표 진행',sw*.4,8,C.green,8);
  const notice=card(c,'로컬 정원 안내',iw,12,'#F6F5EE',0);text(notice,'로컬 정원 안내 문구','체험판 정원입니다. 이 브라우저의 수확만 반영되며 다른 학생과 실시간으로 공유되지는 않아요.',iw-24,11,false,'#817C60');
  text(c,'공동 목표 달성 안내','✿ 정원에 꽃 1송이가 피었어요!',iw,12,true,C.green);
  const gap=mobile?8:12;const tw=(iw-gap*2)/3;
  for(let row=0;row<3;row++){const r=stack(c,`정원 ${row+1}번째 줄`,iw,'HORIZONTAL',0,gap);for(let col=0;col<3;col++){const i=row*3+col;const cell=frame(r,`정원 칸 ${i+1}`,tw,mobile?tw*1.2:tw,'#F6F8F0',16);if(i<7){image(cell,`environment/${i===0?'field-base':'field-dry-base'}.png`,tw,tw,0,0);image(cell,`crops/${cropIds[i]}-stage-04.png`,tw,tw,0,0);const label=text(cell,'작물 이름',cropNames[i],tw,10,false,C.muted);label.textAlignHorizontal='CENTER';label.y=cell.height-22;}else{const t=text(cell,'빈 정원 칸','+',tw,22,false,'#B0BCA3');t.textAlignHorizontal='CENTER';t.y=cell.height/2-18;}}}
  text(c,'정원 구역 이동','← 이전 구역                   1 / 1 구역                   다음 구역 →',iw,10,false,C.muted);return c;
}
function collection(parent,w,mobile) {
  const c=card(parent,'작물 도감',w,mobile?20:28,C.white,18);const iw=w-(mobile?40:56);
  text(c,'도감 영문','MY HARVEST COLLECTION',iw,10,true,C.green);text(c,'도감 제목','차곡차곡, 나의 작물 도감',iw,mobile?19:24,true);text(c,'도감 설명','처음 수확한 작물이 도감에 남아요.',iw,12,false,C.muted);badge(c,'7 / 7종',80);
  const columns=mobile?2:4;const tw=(iw-(columns-1)*12)/columns;
  for(let start=0;start<7;start+=columns){const row=stack(c,`도감 ${Math.floor(start/columns)+1}번째 줄`,iw,'HORIZONTAL',0,12);for(let i=start;i<Math.min(7,start+columns);i++){const item=card(row,`도감 카드 · ${cropNames[i]}`,tw,10,'#FCFCF8',7);const imageNode=image(item,`crops/${cropIds[i]}-harvest.png`,tw-20,tw-20);const title=text(item,'작물 이름',cropNames[i],tw-20,13,true);title.textAlignHorizontal='CENTER';const note=text(item,'수확 횟수','1번의 수확',tw-20,11,false,C.muted);note.textAlignHorizontal='CENTER';}}
  const reward=card(c,'보상 안내',iw,18,'#F6F6ED',6);text(reward,'보상 제목','작은 실천을 응원해요',iw-36,15,true);text(reward,'보상 안내 문구','내 누적 수확 7개 · 실제 상품과 지급 기준은 선생님 안내 예정입니다.',iw-36,12,false,C.muted);return c;
}
const maxX=Math.max(0,...page.children.map(n=>n.x+n.width));
const board=frame(page,'작물 키우기 UI · 편집용 화면 모음',4140,1000,'#E9ECE5');board.x=maxX+100;board.y=100;
text(board,'문서 제목','마음이 자라는 논밭 · UI 편집본',4000,34,true).set({x:40,y:28});
text(board,'편집 안내','컴포넌트 0개 · 일반 프레임 / 텍스트 / 이미지 레이어 · Noto Sans KR · 모바일 390px / PC 1280px',4000,15,false,C.muted).set({x:40,y:96});
const screens=[];
function makeScreen(name,w,x,y,view,value=50) {
  const mobile=w===390;const s=stack(board,name,w,'VERTICAL',mobile?18:104,18,C.cream);s.x=x;s.y=y;s.paddingTop=24;s.paddingBottom=24;s.clipsContent=false;
  const iw=chrome(s,w,mobile,view);
  if(view===0){if(mobile){farmCard(s,iw,value);mission(s,iw);teaser(s,iw);text(s,'개인 누적 수확','내가 차곡차곡 모은 수확                     7개',iw,12,false,C.muted);}else{const body=stack(s,'개인 농장과 안내 열',iw,'HORIZONTAL',0,24);const left=Math.floor((iw-24)*.6);farmCard(body,left,value);const side=stack(body,'미션과 정원 안내',iw-24-left,'VERTICAL',0,18);mission(side,iw-24-left);teaser(side,iw-24-left);text(side,'개인 누적 수확','내가 차곡차곡 모은 수확                  7개',iw-24-left,12,false,C.muted);}}
  if(view===1)garden(s,iw,mobile);if(view===2)collection(s,iw,mobile);footer(s,iw);screens.push(s);return s;
}
const desktopY=158;
const desktops=[makeScreen('PC · 01 나의 논밭',1280,40,desktopY,0),makeScreen('PC · 02 우리 반 정원',1280,1380,desktopY,1),makeScreen('PC · 03 작물 도감',1280,2720,desktopY,2)];
const mobileY=Math.max(...desktops.map(n=>n.y+n.height))+100;
const mobiles=[makeScreen('모바일 · 01 나의 논밭 50%',390,40,mobileY,0),makeScreen('모바일 · 02 우리 반 정원',390,490,mobileY,1),makeScreen('모바일 · 03 작물 도감',390,940,mobileY,2),makeScreen('모바일 · 04 수확 준비 100%',390,1390,mobileY,0,100),makeScreen('모바일 · 05 씨앗 0%',390,1840,mobileY,0,0)];
const modalY=Math.max(...mobiles.map(n=>n.y+n.height))+100;
function popup(name,x,type) {
  const phone=frame(board,`모바일 · ${name}`,390,900,C.cream,0);phone.x=x;phone.y=modalY;screens.push(phone);
  const backdrop=rect(phone,'팝업 배경 오버레이',390,900,C.ink);backdrop.opacity=.35;
  const dialog=card(phone,`팝업 · ${name}`,350,27,C.white,16);dialog.x=20;dialog.y=80;
  const iw=296;const close=stack(dialog,'팝업 제목과 닫기',iw,'HORIZONTAL',0,0);text(close,'팝업 작은 제목',type==='mission'?'감사 실천 · 성장 +30%':type==='harvest'?'100%의 마음이 맺은 결실':type==='choose'?'A NEW LITTLE BEGINNING':'체험판 이용 안내',iw-30,11,true,C.green);text(close,'닫기','×',30,20,false,C.muted);
  if(type==='mission'){text(dialog,'미션 제목','고마운 마음 전하기',iw,23,true);text(dialog,'미션 설명','오늘 고마웠던 사람 한 명을 떠올려 보세요. 짧은 말이나 편지로 감사한 이유를 전해요.',iw,13,false,C.muted);text(dialog,'미션 실천 순서','1. 고마웠던 사람 떠올리기\n2. 고마운 이유 한 가지 생각하기\n3. 직접 마음 전하기',iw,13);const check=card(dialog,'미션 완료 체크',iw,12,C.pale,0);text(check,'체크박스와 확인 문구','□ 감사한 마음을 전했어요.',iw-24,12);button(dialog,'실천 완료하고 성장하기',iw);text(dialog,'제출 안내','편지 내용이나 사진은 제출하지 않아도 괜찮아요.',iw,10,false,C.muted);}
  if(type==='harvest'){image(dialog,'crops/rice-harvest.png',iw,160);text(dialog,'수확 제목','벼, 수확했어요!',iw,24,true);text(dialog,'수확 안내','내 도감에 기록하고,\n우리 반 정원에도 한 칸 더했어요.',iw,13,false,C.muted);button(dialog,'다음 작물 골라보기',iw);button(dialog,'우리 반 정원에서 확인하기 →',iw,'text');}
  if(type==='choose'){text(dialog,'작물 선택 제목','다음에는 무엇을 키울까요?',iw,21,true);text(dialog,'작물 선택 안내','어떤 작물이든 100%를 채우면 수확할 수 있어요.',iw,12,false,C.muted);for(let start=0;start<7;start+=3){const row=stack(dialog,`작물 선택 ${Math.floor(start/3)+1}번째 줄`,iw,'HORIZONTAL',0,8);for(let i=start;i<Math.min(7,start+3);i++){const choice=card(row,`작물 선택 · ${cropNames[i]}`,93,6,'#FCFCF8',4);image(choice,`crops/${cropIds[i]}-harvest.png`,81,81);const t=text(choice,'선택 문구',`${cropNames[i]} 심기`,81,11);t.textAlignHorizontal='CENTER';}}}
  if(type==='info'){text(dialog,'참여 안내 제목','마음이 자라는 논밭',iw,23,true);text(dialog,'참여 안내 본문','물 주기 +20%, 미션 실천 +30%.\n위쪽 성장 바와 작물이 함께 천천히 자라요.\n\n100%를 채우면 작물 하나가 완성됩니다.\n\n수확하면 도감과 반 정원에 함께 기록되고, 다음 작물을 선택할 수 있어요.',iw,13,false,C.muted);text(dialog,'데모 제한 안내','로컬 데모입니다. 참여 정보는 예시이며, 기록은 이 브라우저에만 보관됩니다.',iw,12,false,C.muted);button(dialog,'이 데모의 저장 기록 초기화',iw,'text');}
  return phone;
}
popup('미션 안내',40,'mission');popup('수확 완료',490,'harvest');popup('다음 작물 선택',940,'choose');popup('참여 안내',1390,'info');
board.resize(4140,modalY+1000);
const sheet=await figma.getNodeByIdAsync('5:2');sheet.x=board.x;sheet.y=board.y+board.height+100;
page.name='작물 키우기 UI';
const all=[board,...board.findAll(()=>true)];
const counts={};all.forEach(n=>counts[n.type]=(counts[n.type]||0)+1);
const imageNodes=all.filter(n=>'fills' in n&&Array.isArray(n.fills)&&n.fills.some(p=>p.type==='IMAGE')).map(n=>({id:n.id,name:n.name,type:n.type,width:n.width,height:n.height}));
const texts=board.findAllWithCriteria({types:['TEXT']});
if(texts.some(n=>n.fontName.family!=='Noto Sans KR'))throw new Error('글꼴 불일치');
if((counts.COMPONENT||0)+(counts.INSTANCE||0)+(counts.COMPONENT_SET||0)>0)throw new Error('컴포넌트 생성됨');
figma.viewport.scrollAndZoomIntoView([mobiles[0]]);
return {createdNodeIds:created,mutatedNodeIds:['0:1','5:2'],boardId:board.id,screens:screens.map(n=>({id:n.id,name:n.name,width:n.width,height:n.height,x:n.x,y:n.y})),totalDescendants:all.length-1,counts,fontFamily:'Noto Sans KR',imageNodes};

