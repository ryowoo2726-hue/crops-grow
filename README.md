# 마석중학교 농작물 키우기

Flutter Web 프론트와 현재 서버 노트북에서 실행하는 Node.js + SQLite 백엔드입니다.

**다른 AI 또는 다음 작업은 [프로젝트 인수인계 문서](docs/PROJECT_HANDOFF.md)를 먼저 읽어주세요.** 현재 상태·규칙·API·DB·검증·주의할 오류와 남은 작업을 기록합니다.

- 프론트 주소: `https://cropgrow.sangsangbar.com`
- 게임 API: `https://cropgrow.sangsangbar.com/api/*` (Pages에서 PC의 Tunnel로 전달)
- 관리자/직접 API: `https://cropgrow-api.sangsangbar.com`
- GitHub `main`과 Cloudflare Pages `cropgrow`를 연결했습니다. push하면 자동 배포됩니다. 프론트 도메인은 `cropgrow.sangsangbar.com`입니다. 2026-11-12 사용자가 백엔드와 Tunnel을 실행한 뒤 외부 API 200을 확인했습니다. 다만 실제 인터넷 조회에 지연·시간 초과·502가 관찰되어 [실제 인터넷 진단](docs/INTERNET_PERFORMANCE_REPORT.md)의 개선 항목이 남아 있습니다.

## 웹 로딩 최적화 (2026-11-11)

**최신 물방울 효과·전체 최적화의 GitHub 업로드와 Cloudflare 운영 배포를 완료했습니다.** 물방울 점프·물 튀김과 미션 영양분 흡수 효과를 실제 게임에 연결했습니다. 전체 최적화는 WebAssembly + 기존 JS 대체 빌드, 배경 조기 표시·용량 축소, 한글 우선 폰트/한자 후속 로딩, 현재 성장 단계 우선 표시, 도감·정원용 256px 이미지, 폰트·엔진·앱의 내용별 캐시를 포함합니다. 원본 PNG와 공식 SQLite·채점 정책은 유지합니다. 배포 결과는 [인수인계](docs/PROJECT_HANDOFF.md) 최상단을 확인하세요.

8Mbps·40ms 로컬 Chrome 측정(각 3회 중앙값)에서 첫 화면 13.38 → 8.41초, 현재 작물 준비 14.57 → 8.68초, 배경 전송 완료 14.79 → 0.25초, 재접속 1.00 → 0.33초입니다. 실제 학교망 속도를 보장하는 수치는 아닙니다.

전체 문자와 굵기를 유지하는 WOFF2 폰트, 폰트 선로딩, HTML 내 Flutter bootstrap을 적용해 운영 배포했습니다. 초기 최적화 당시 로컬 캐시 없음·8Mbps·지연 40ms 측정에서 첫 화면이 약 22.1초에서 16.3초로 줄었습니다. 실제 접속 시간은 네트워크에 따라 달라지며 최신 수치는 위 진단 문서를 확인하세요. 서버를 시작할 때는 프로젝트 폴더의 `GrowGame 시작.cmd`를 실행합니다. 공식 DB의 마지막 지정 위치는 `C:\scr\grow`이며 현재 연결·운영 상태는 인수인계 최신 절을 기준으로 합니다.

사진·화면 전환 최적화: 화면용 이미지 합계 약 60% 감소, 현재 작물의 수확 이미지 선준비, 작물 선택 이미지 백그라운드 준비, 성장 대기 0.7초를 적용했습니다. 앱 코드·엔진·폰트·이미지는 내용별 주소와 장기 브라우저 캐시를 사용합니다. GitHub/Cloudflare 빌드는 마무리 스크립트를 자동 실행합니다.

## 실행과 배포

`GrowGame 시작.cmd` 하나로 백엔드와 도메인 연결을 함께 시작합니다. IP를 수동 등록할 필요가 없습니다. 새 컴퓨터의 최초 실행에는 Node/cloudflared 설치, 저장 폴더 선택과 Tunnel 인증이 필요합니다. 현재 컴퓨터는 사용자 요청에 따라 별도 로컬 테스트 DB를 사용합니다. 최신 실행·배포 상태는 인수인계 문서 맨 위를 확인하세요.

**백엔드 없이 화면·성장·수확·퀴즈만 테스트할 때:**

```powershell
flutter run -d chrome --web-port=4180 --dart-define=LOCAL_TEST_MODE=true
```

전용 브라우저 저장소에 테스트 참여자 1개를 만들고 바로 밭을 엽니다. 테스트용 4지선다 퀴즈와 특별 미션도 사용할 수 있습니다. 공식 서버 데이터와 분리되며, 실제 배포에는 `LOCAL_TEST_MODE=true`를 넣지 않습니다.

서버 노트북에는 Node.js 24 LTS를 설치하고 `backend/start.ps1`을 실행합니다. 최초 실행 시 DB 저장 폴더를 선택하며 다음 실행부터 기억합니다.

```powershell
.\backend\start.ps1
```

프론트는 Flutter stable SDK로 빌드합니다. API 주소 기본값은 위 도메인입니다.

```powershell
flutter pub get
flutter build web --wasm --no-web-resources-cdn
node scripts/finalize-web.cjs
node server.cjs
```

로컬 연결 검증 때만 다음처럼 API 주소를 덮어씁니다.

```powershell
flutter build web --wasm --no-web-resources-cdn --dart-define=API_BASE_URL=http://127.0.0.1:8787
node scripts/finalize-web.cjs
```

개발 중에는 `flutter run -d chrome --web-port=4174 --dart-define=API_BASE_URL=http://127.0.0.1:8787`을 사용할 수 있습니다. 같은 포트의 `node server.cjs`와 동시에 실행하지 않습니다.

[다른 노트북 실행·Cloudflare·GitHub·백업 안내](backend/README.md)

## 데이터와 로그인

이미지·폰트·애니메이션·화면 코드는 Cloudflare Pages에서 배포합니다. 학생은 최초 입장에 숫자 4자리 비밀번호를 정하고, 이후 같은 학년·반·번호의 비밀번호를 확인합니다. PIN 원문은 저장하지 않으며 해시·실패 횟수와 제한을 서버에서 관리합니다.

성장률·수확·작물별 도감 개수는 서버에서 조회합니다. 물주기는 +50%, 미션은 +30%이며, 서버 성공 응답 후에만 반영합니다. 정원은 9개씩 조회합니다. 서버가 끊기면 작은 안내를 띄우고 마지막으로 받아둔 화면은 유지하며, 재접속하면 서버 기록을 다시 가져옵니다. 새로고침하면 로그인부터 다시 시작합니다.

프론트에는 현재 화면 데이터와 세션 토큰만 메모리에 보관합니다. 공식 기록을 localStorage에 저장하지 않습니다. 기존 체험판의 저장 데이터는 삭제하거나 자동으로 DB에 합치지 않았습니다. 개인·일일 규칙은 백엔드가 결정하며 학생이 화면에서 바꿀 수 없습니다.

## 매주 4지선다 퀴즈와 특별 미션

문제·선지·정답은 백엔드의 JSON 관리 파일로 DB에 등록합니다. 정답은 프론트에 전송하지 않으며 정답 판정과 보상 조건도 서버에서 검증합니다. 모든 퀴즈는 정확히 네 가지 보기입니다. 템플릿은 자동으로 등록되지 않습니다.

```powershell
node backend/manage.cjs import-quiz backend/content/이번주.json
node backend/manage.cjs import-special backend/content/특별미션.json
```

팝업 디자인과 진행 UI는 `lib/missions/quiz/popup.dart`, `lib/missions/special/popup.dart`에서 수정합니다. [미션 편집 안내](lib/missions/README.md)를 참고하세요.

## 검증

서버 없는 효과·화면 검증과 로딩 측정은 별도 로컬 빌드를 사용합니다. 아래 로컬 빌드는 배포하지 않습니다.

```powershell
flutter build web --wasm --no-web-resources-cdn --dart-define=LOCAL_TEST_MODE=true
node scripts/finalize-web.cjs
$env:PORT='4180'
node server.cjs
# 위 정적 서버를 유지하고 다른 터미널에서 실행
node tests/flutter.local-vfx.browser.test.cjs
node tests/loading.browser.cjs after
```

측정은 Chrome, 390×844, 8Mbps·40ms 조건으로 첫 접속/재접속 각각 3회입니다. 결과와 스크린샷은 OS 임시 폴더에 저장합니다. 이때 API·Tunnel·학생 DB를 시작하지 않습니다. `WEB_ROOT` 환경변수로 다른 빌드 폴더도 검증할 수 있습니다. 운영 빌드를 만들 때는 `LOCAL_TEST_MODE` 없이 다시 빌드합니다.

`GROWGAME_TEST_FORCE_JS=true`로 효과 검증을 실행하면 JS 대체 모드도 확인합니다. `GROWGAME_TEST_PRODUCTION=true`, `GROWGAME_TEST_URL=https://cropgrow.sangsangbar.com/`를 지정한 `node tests/loading.browser.cjs after-live`는 실제 사이트의 로그인 전 화면만 검사하며 로그인이나 학생 데이터 변경을 하지 않습니다. 캐시 재접속 검증은 후속 폰트 다운로드 완료 뒤에 실행합니다.

```powershell
node --test backend/backend.test.cjs
flutter analyze
flutter test
```

실제 Chrome 통합 검증은 로컬 API 주소로 빌드하고 프론트 서버를 켠 뒤 `node tests/flutter.browser.test.cjs`로 실행합니다. 검증용 임시 DB를 만들고 8787 포트의 API를 직접 시작·종료하므로, 그 포트의 개발 백엔드는 먼저 종료하세요. PIN 등록·서버 채점·보상·수확·도감·서버 중단/복구·모바일/태블릿/PC를 확인합니다.

이 작업 환경의 SDK는 `C:\tmp\growgame-flutter-sdk`입니다. PATH에 없으면 `flutter` 대신 `& 'C:\tmp\growgame-flutter-sdk\bin\flutter.bat'`을 사용합니다. 한글 경로에서 분석 서버 오류가 나면 비어 있는 영문 드라이브 별칭을 만들어 사용합니다.

```powershell
subst X: (Get-Location).Path
Set-Location X:\
& 'C:\tmp\growgame-flutter-sdk\bin\flutter.bat' analyze
```
