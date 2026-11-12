# 노트북 백엔드 준비

## 과목별 퀴즈 세트 (2026-11-12)

`backend/content/quiz-bank.json`을 수정·저장하면 학생의 다음 과목 목록/퀴즈 요청에서 자동 반영됩니다. 영어·과학·역사 예시를 각 10문제씩 현재 PC에 준비했습니다. 새 서버에서는 quiz-bank.template.json을 해당 경로로 복사합니다. 과목별 100문제는 10문제 세트 10개로 작성하세요. 데이터 편집과 학생별 일일 제한·채점·보상 규칙은 [미션 운영 안내](../lib/missions/README.md)에 정리했습니다. 새 프론트의 GitHub 검사·Cloudflare 배포를 완료했습니다. 현재 API·Tunnel은 종료 상태이며 다음 실행부터 백엔드 스키마와 문제은행이 적용됩니다.

## 현재 실행 방법 (2026-11-12 갱신)

최적화 GitHub/Pages 배포와 외부 테스트 완료. 사용자 요청으로 현재 이 PC의 테스트 API·Tunnel을 종료했습니다. 새 게임 API 경로의 동시 health 300건 실패 0, p95 80~190ms를 확인했습니다. 종료 후 터널 정리·숨김 재시작 검증은 자동 승인 검토에 차단되어 미검증이며 서비스/부팅 자동 시작은 설치하지 않았습니다.

`GrowGame 시작.cmd` 또는 `backend/start.ps1` 하나로 API와 Cloudflare Tunnel을 함께 시작합니다. 실행 창을 유지하고 종료할 때 Ctrl+C를 누르세요. `-LocalOnly`는 터널 없이 API만 실행합니다. 공인 IP가 바뀌어도 Tunnel이 현재 PC에서 다시 연결하므로 DNS의 IP를 수동 변경하지 않습니다. 새 PC에는 Node/cloudflared 설치, DB 폴더 선택과 최초 Tunnel 인증이 필요합니다. 토큰은 해당 Windows 사용자의 DPAPI로 암호화합니다. 서로 다른 DB를 가진 컴퓨터 두 대에서 같은 Tunnel을 동시에 실행하지 마세요.

현재 PC는 사용자 지정 **테스트 서버**이며 DB는 `%LOCALAPPDATA%\growgame-test-data`입니다. 기존 공식 학생 DB와 구분합니다. 게임은 `https://cropgrow.sangsangbar.com`, API 전달 경로는 같은 도메인의 `/api/*` → Cloudflare → `cropgrow-api.sangsangbar.com` Tunnel → 이 PC의 8787입니다. 관리자 주소는 기존 API 도메인의 `/admin/`을 사용합니다. 이 PC의 관리자 비밀번호는 사용자 지정값의 해시로 설정했고 다음 서버 실행부터 적용됩니다.

보조 한자 폰트는 입장을 막지 않고 뒤에서 로드하며, 현재 작물 이미지들은 함께 준비합니다. API 응답은 캐시하지 않고 이미지·코드의 기존 해시 캐시를 유지합니다. 최신 배포/검증 결과는 인수인계 문서의 맨 위를 확인하세요. 아래 내용은 과거 실행 이력입니다.

## 실제 인터넷 연결 진단 (2026-11-12)

사용자가 API와 Tunnel을 실행한 뒤 외부 health 200과 관리자 목록 읽기를 확인했습니다. 실제 인터넷 health 동시 100건씩 3회는 실패 5/300, 일부 12초 시간 초과와 별도 진단의 502가 있었습니다. DNS·API 접속 경로·로그인 보조 폰트 대기 개선 항목은 [실제 인터넷 성능 보고서](../docs/INTERNET_PERFORMANCE_REPORT.md)를 확인하세요. 이번 진단에서 운영 설정과 학생 기록은 바꾸지 않았고 실행 중 서버도 종료하지 않았습니다.

## 관리자 학생 삭제 (2026-11-12)

학생 표 오른쪽 **관리 → 삭제**에서 학년·반·번호를 확인한 뒤 **삭제하기**를 누릅니다. 학생 비밀번호·재배·수확·퀴즈 풀이 기록과 로그인 세션을 모두 삭제합니다. 취소하면 기록을 유지하며, 삭제한 기록을 화면에서 되돌리는 기능은 없습니다. 같은 학년·반·번호로 다시 참여하면 새 학생으로 등록됩니다. 다른 학생과 공통 미션 콘텐츠는 유지합니다. API를 다시 시작하고 관리자 페이지를 새로고침하면 사용할 수 있습니다. 별도 Pages 재배포는 필요 없습니다.

## 로그인 자료 선준비·관리자 자동 열기 (2026-11-12)

구현·검증·GitHub 업로드와 프론트 Pages 운영 배포 완료. 백엔드의 새 기능은 다음 API 실행부터 적용됩니다. 검증용 서버는 종료했으며 운영 API·Tunnel을 대신 실행하지 않았습니다.

`backend/start.ps1`, API 바로가기 또는 `GrowGame 시작.cmd`로 백엔드를 실행하면 서버 대기가 시작된 뒤 기본 브라우저에 로컬 `/admin/`을 자동으로 엽니다. `PORT`를 바꾸면 해당 포트를 사용합니다. 브라우저를 열지 않는 서버 환경에서는 `GROWGAME_OPEN_ADMIN=0`으로 설정합니다. 자동 열기가 실패해도 API는 계속 실행하며 콘솔 주소로 직접 접속할 수 있습니다.

학생 로그인 응답에는 공식 기록과 정원 첫 페이지, 정답 없는 퀴즈, 특별 미션을 함께 제공합니다. 프론트는 현재 작물의 네 성장 이미지와 수확 이미지, 공통 이미지·도감·정원 썸네일을 준비한 뒤 입장합니다. 미션은 로그인 후 60초 동안 메모리 자료로 열고, 이후에는 서버에서 다시 읽습니다. 내용 변경 충돌 시 자료를 비우고 다시 조회하며, 채점·성장·수확 저장은 계속 SQLite 서버 판정입니다. 프론트 변경은 Pages 재배포, 백엔드 변경은 API 재시작 후 적용됩니다.

## 관리자 웹 화면 (2026-11-12)

백엔드 시작 후 `http://127.0.0.1:8787/admin/`에서 관리자 로그인합니다. Tunnel도 실행 중이면 `https://cropgrow-api.sangsangbar.com/admin/`에서 같은 화면을 사용합니다. 학년·반으로 학생을 구분하고 현재 재배 작물, 성장도, 총 수확 개수를 확인합니다. 새로고침으로 최신 SQLite 기록을 조회합니다. 별도 프론트 빌드나 Pages 배포는 필요 없습니다.

관리자 비밀번호 설정·변경은 서버에서 `./backend/set-admin-password.ps1`을 실행하고 숨김 입력합니다. salt/scrypt 해시만 저장소 밖 로컬 설정 폴더의 `admin-credentials.json`에 저장하며, API를 다시 시작하면 적용됩니다. 현재 노트북에는 사용자 지정값 설정을 완료했습니다. 다른 노트북에서는 다시 설정해야 합니다. 설정 파일과 실제 비밀번호는 Git에 올리지 않습니다.

학생 비밀번호는 원문을 보관하지 않아 조회할 수 없습니다. 관리자 화면의 **변경**에서 새 숫자 4자리 PIN을 지정하고 학생에게 직접 전달합니다. 해당 학생의 기존 로그인은 종료되며 재배·수확 기록은 유지됩니다. 관리자 세션은 30분 후 만료되고 비밀번호 5회 실패 시 15분간 로그인이 제한됩니다. 서버 재시작 시 관리자 세션은 종료됩니다.

백엔드 검증: `node --test backend/backend.test.cjs`. 임시 DB와 분리된 Chrome 프로필만 사용하는 관리자 브라우저 검증: `node tests/admin.browser.test.cjs`. 이 자동 테스트는 공식 API나 Tunnel을 켜지 않습니다. 사용자가 실행한 운영 서버의 최신 외부 연결·성능 상태는 위 실제 인터넷 진단 절을 확인하세요.

## 2026-11-11 DB 저장 폴더 변경 완료

사용자 요청으로 DB 본체와 WAL·SHM 세 파일을 서버 종료 상태에서 C:\scr\grow로 이동했다. 기존 대상 파일 덮어쓰기 없이 이동 전후 SHA-256 일치 및 SQLite integrity_check 정상 결과를 확인했다. 로컬 config.json의 dataDirectory도 C:\scr\grow로 변경했다. 공식 DB는 C:\scr\grow\growgame.sqlite이며 통합 실행 파일은 이 설정을 그대로 사용한다. 서버는 종료 상태를 유지한다.


## 2026-11-11 사용자 요청으로 서버 종료

사용자 요청으로 현재 노트북의 GrowGame API와 Cloudflare Tunnel을 종료했다. 두 프로세스 종료와 로컬 8787 포트 대기 없음 확인. 이전 healthy·외부 health 200은 실행 중에 확인한 이력이며 현재 가동 상태가 아니다. DB `C:\scr\growgame.sqlite`, 로컬 설정, 암호화된 Tunnel 토큰과 바탕화면 바로가기는 보존했다.

직접 시작: 현재 프로젝트 폴더의 **GrowGame 시작.cmd**를 더블클릭하면 API와 Tunnel 실행 창이 함께 열린다. 두 창을 유지한다. 이 통합 실행 파일은 같은 폴더의 기존 바로가기 두 개를 사용하므로 세 파일을 함께 보관한다. 개별 실행도 가능하다. 프로젝트 폴더의 바로가기 두 개는 이 PC 전용이며 Git 로컬 제외 목록으로 업로드를 방지했다. 두 창을 유지한다. 종료: Tunnel 창에서 Ctrl+C, API 창에서 Ctrl+C를 누른 뒤 창을 닫는다. 재부팅 후 자동 실행되지 않는다.


## 현재 노트북 서버 설정 완료 (2026-11-11)

사용자가 현재 이 노트북을 백엔드 서버로 지정했다. 이전의 다른 노트북 사용 방침을 대체한다. 학생 DB는 사용자 지정 `C:\scr\growgame.sqlite`에 저장하며 기존 폴더와 파일은 보존했다. Node.js 24.20.0, cloudflared 2026.10.1을 확인했다. DB 경로 설정은 `%LOCALAPPDATA%\growgame-server\config.json`에, Tunnel 토큰은 같은 설정 폴더의 `tunnel-token.clixml`에 Windows 사용자 DPAPI로 암호화해 보관한다.

현재 API와 HTTP/2 Tunnel을 실행했다. 로컬 및 외부 `/api/health` HTTP 200, 프론트 Origin 허용 헤더, Tunnel `healthy`와 연결 4개를 확인했다. `node --test backend/backend.test.cjs` 통과. 실제 미션 콘텐츠 등록, 학생 등록·행동, 학교 Wi-Fi 다수 사용자 검증은 남아 있다. 실제 콘텐츠나 학생 기록을 자동 입력하지 않았다.

API와 Tunnel은 현재 도구 관리 세션에서 실행 중이다. 숨김 백그라운드 시작은 자동 승인 검토에서 거부되어 적용하지 않았다. Windows 서비스·자동 시작·전원 설정은 변경하지 않았다. 재부팅 또는 실행 세션 종료 후 바탕화면 **GrowGame API**, **GrowGame Tunnel**을 각각 실행하고 두 창을 유지한다. 이미 실행 중이면 중복 실행하지 않는다. 종료는 각 창의 Ctrl+C다.

아래 다른 노트북·Tunnel inactive 관련 과거 기록은 위 설정 이전의 이력이다. Understand 분석은 제외 목록 확인 단계에서 대기 중이며 그래프는 아직 생성하지 않았다.


Node.js **24.13 이상, 24 LTS**를 사용합니다. HTTP·SQLite·비밀번호 해시는 Node 기본 기능으로 처리하므로 `npm install`, Docker, 별도 DB 서버가 필요 없습니다.

## 다른 노트북에서 처음 실행

프로젝트를 복사하고 PowerShell에서 실행합니다.

```powershell
$env:FRONTEND_ORIGINS='https://cropgrow.sangsangbar.com'
.\backend\start.ps1
```

처음에 **저장 폴더 선택창**이 열립니다. 예: `C:\GrowGameData`. 그 안에 `growgame.sqlite`가 자동 생성되고, 이후에는 선택한 폴더를 기억합니다. 설정은 해당 노트북의 `%LOCALAPPDATA%\growgame-server\config.json`에 저장합니다. 실행 중인 DB는 Google Drive·OneDrive·공유 드라이브 대신 로컬 디스크에 두세요. 껐다 켜도 선택한 폴더의 DB를 계속 사용합니다.

다른 폴더를 선택하려면:

```powershell
.\backend\start.ps1 -ChooseFolder
```

새 빈 폴더를 선택하면 새 DB가 만들어집니다. 기존 데이터를 자동 이동하지 않습니다. 저장 폴더를 바꿀 때 기록을 이어가려면 아래 백업·복원 방법을 사용하세요. Node 또는 PowerShell 정책으로 실행이 막히면 Node 24 설치 및 해당 스크립트 실행 허용을 먼저 확인하세요.

Windows 외 환경 또는 폴더를 직접 지정할 때:

```text
node backend/server.cjs --data-dir /absolute/local/path
```

API는 **127.0.0.1:8787**에서만 대기합니다. Cloudflare Tunnel이 여기에 연결됩니다. 프론트 이미지·폰트를 노트북에서 제공하지 않습니다.

## Cloudflare / GitHub 연결 상태

2026-11-10에 Cloudflare 플러그인으로 `cropgrow-api` Tunnel과 API 도메인의 proxied CNAME을 생성했습니다. 실제 식별자는 `tunnel-info.json`과 [인수인계 문서](../docs/PROJECT_HANDOFF.md)에 있습니다. 요청 경로는 `cropgrow-api.sangsangbar.com` → Tunnel → 서버 노트북의 `http://127.0.0.1:8787`입니다.

서버 노트북에서 API를 실행한 다음 **다른 PowerShell 창**에서 연결합니다.

```powershell
.\backend\start-tunnel.ps1
```

첫 실행에는 Cloudflare 대시보드의 **Networking → Tunnels → cropgrow-api → Add a replica**에서 확인한 해당 Tunnel 토큰을 숨김 입력합니다. 토큰은 Windows DPAPI로 해당 노트북 사용자에게 암호화해 `%LOCALAPPDATA%\growgame-server\tunnel-token.clixml`에 기억합니다. 토큰을 채팅이나 저장소에 넣지 마세요. 새 토큰은 `-ResetToken` 옵션으로 입력하고, 학교망에서 TCP 연결을 사용하려면 `-Protocol http2`를 지정합니다. 노트북과 Windows 사용자가 바뀌면 토큰을 다시 입력합니다.

현재 노트북에서 커넥터를 실행해 Tunnel `healthy`와 외부 API 응답을 확인했습니다. 커넥터 없이 DNS만 생성되어 있어도 API가 서비스되는 것은 아닙니다. 학교망은 Cloudflare로 나가는 7844 TCP/UDP 연결이 허용되어야 합니다. 차단되어 있으면 학교 네트워크 담당자에게 허용을 요청하세요. 관련 [공식 조건](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/)을 참고합니다.

프론트 `cropgrow.sangsangbar.com`은 Pages `cropgrow`와 연결했습니다. GitHub 저장소 `ryowoo2726-hue/crops-grow`의 `main` push 시 자동 배포됩니다. 빌드 명령은 `bash scripts/build-web.sh`, 출력 폴더는 `build/web`, `API_BASE_URL=https://cropgrow-api.sangsangbar.com`입니다. `.github/workflows/frontend.yml`은 검사·빌드 아티팩트용입니다. 별도 Cloudflare API 토큰을 GitHub에 넣을 필요가 없습니다. 노트북 API와 Tunnel 실행은 별도로 필요합니다.

서버의 `FRONTEND_ORIGINS`는 실제 프론트 주소와 정확히 맞춥니다. 여러 주소는 쉼표로 구분합니다. CORS는 브라우저 접근 범위를 정하며 학생 인증은 별도의 세션으로 확인합니다. 노트북이 꺼지거나 API/Tunnel이 중지되면 프론트는 작은 연결 안내를 표시하고, 열려 있는 마지막 화면을 유지하되 서버 성공 응답 없이 보상·기록을 늘리지 않습니다.

로컬 연결 테스트용 빌드:

```powershell
flutter build web --no-web-resources-cdn --dart-define=API_BASE_URL=http://127.0.0.1:8787
node server.cjs
```

실제 배포에서는 `API_BASE_URL`에 **HTTPS 도메인**을 넣어야 합니다. 주소가 없으면 연결 대기 상태가 됩니다. Flutter 화면·팝업을 바꿀 때만 프론트를 다시 배포하고, 문제 변경은 DB만 갱신합니다.

## 매주 문제 업데이트

`quiz.template.json`을 `backend/content/이번주.json`으로 복사해 실제 내용을 입력합니다. 템플릿은 자동 등록하지 않습니다. `week`는 **서울 날짜 기준 월요일**이고 한 주에 최대 20문제입니다. 모든 문제는 서로 다른 보기 **정확히 4개**, `correctIndex`는 0~3입니다.

```powershell
node backend/manage.cjs import-quiz backend/content/이번주.json
node backend/manage.cjs import-special backend/content/특별미션.json
```

서버 실행창에서 폴더를 선택한 이후 관리 명령도 같은 폴더를 사용합니다. 직접 경로를 지정하려면 명령 끝에 `--data-dir C:\GrowGameData`를 붙이세요. 같은 주차를 다시 등록하면 내용과 버전을 갱신합니다. 이전 버전의 답안으로 새 문제의 보상을 받을 수 없습니다. 특별 미션은 `special.template.json` 형식을 사용합니다.

팝업 디자인·진행 방식: `lib/missions/quiz/popup.dart`, `lib/missions/special/popup.dart`. **배포 프론트에는 문제 정답을 넣지 않습니다.** 문제 응답은 질문과 보기만 포함하며 채점·해설 제공은 서버에서 처리합니다.

## 기록과 로그인

- 최초 입장: 학년·반·번호와 숫자 4자리 PIN으로 등록합니다. 이후에는 기존 PIN을 확인합니다.
- PIN은 salt와 scrypt 해시만 저장하고 원문을 보관하지 않습니다. 5회 실패하면 해당 학생의 로그인을 15분 제한합니다.
- 로그인 세션은 8시간이며 토큰은 프론트 메모리에만 둡니다. 새로고침하면 다시 로그인합니다. DB에는 토큰 해시만 보관합니다.
- 최초 등록은 번호를 먼저 등록한 사람 기준입니다. 본인 명단 확인 기능은 아직 없습니다. 실제 행사 전 교사가 번호를 확인하거나 사전 등록하는 운영 방식을 정해야 합니다.
- 물주기 +50%, 미션 +30%, 100% 수확·다음 작물 심기는 모두 서버에서 검증하고 저장합니다. 요청 번호로 중복 전송을 막습니다.
- 현재 기본은 기존 앱처럼 여러 번 참여하는 규칙입니다. `$env:DAILY_LIMIT='true'`로 실행하면 물주기와 미션 보상을 각각 서울 날짜 기준 하루 1회로 제한합니다. 퀴즈·특별 미션은 같은 일일 미션 보상 횟수를 공유합니다.
- 기존 브라우저 체험 기록은 자동으로 서버에 합치지 않습니다. 기존 원본 localStorage는 삭제하지 않으며, 공식 데이터는 새 DB에서 시작합니다.
- PIN 분실 시 관리자 웹 화면에서 변경하거나 서버 노트북에서 `node backend/manage.cjs reset-pin 학년 반 번호`를 실행하고 새 PIN을 입력합니다. 해당 학생의 기존 로그인 세션도 종료됩니다. 관리자 쓰기 API는 관리자 인증 후에만 사용할 수 있습니다.

## 백업·복원

```powershell
node backend/manage.cjs backup C:\GrowGameBackups\growgame-2026-11-10.sqlite
```

실행 중에도 SQLite 백업 API로 일관된 백업을 만듭니다. 같은 이름은 덮어쓰지 않습니다. DB가 열려 있을 때 `.sqlite`만 단순 복사하면 WAL에 남은 최근 기록을 놓칠 수 있습니다.

복원할 때는 서버를 종료한 뒤, **새 빈 폴더**에 백업을 `growgame.sqlite`라는 이름으로 복사하고 `start.ps1 -ChooseFolder`로 그 폴더를 선택합니다. 과거 DB와 WAL 파일을 섞지 마세요.

## 저장 위치와 응답 크기

| 위치 | 보관할 데이터 |
|---|---|
| Cloudflare Pages/CDN | 이미지, 폰트, Flutter 코드, 애니메이션 |
| 프론트 메모리 | 현재 학생 상태, 현재 퀴즈, 현재 정원 9칸, 세션 토큰 |
| 노트북 SQLite | 학생 PIN 해시, 작물·성장률, 수확 이력, 주차별 퀴즈·정답, 정답 확인 기록, 중복 방지 요청 |
| 백업 파일 | 종료·장애·노트북 교체에 대비한 DB 스냅샷 |

도감 개수는 수확 테이블에서 집계하므로 중복 저장 불일치를 피합니다. 개인 조회에는 전체 수확 이력 대신 작물별 개수만 보내고, 반 정원은 9개씩 조회합니다. 60초 주기의 작은 개인 상태 조회와 사용자 행동 시 요청을 사용하며, 전체 학급 자료를 모든 기기에 내려보내지 않습니다. SQLite의 페이지 캐시는 약 4MiB로 설정했지만 프로세스 전체 RAM 제한을 의미하지 않습니다. PIN 해시는 비동기로 계산합니다. 100~500명 운영 성능은 실제 서버 노트북과 학교 Wi-Fi에서 행사 전 부하 검증이 필요합니다.

## API / 검사

`POST /api/session`, `POST /api/logout`, `GET /api/me`, `GET /api/garden?page=0`, `GET /api/quizzes/current`, `POST /api/quizzes/check`, `GET /api/missions/current`, `POST /api/actions`, `GET /api/health`.

```powershell
node --test backend/backend.test.cjs
flutter analyze
flutter test
```

참고: [Cloudflare Tunnel 연결](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/), [Pages CI 배포](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/), [연결 중단 문제 확인](https://developers.cloudflare.com/tunnel/troubleshooting/).
