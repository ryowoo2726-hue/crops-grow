# 노트북 백엔드 준비

처음 설치한다면 [다른 노트북 서버·저장소 설정 설명서](../docs/서버_노트북_설정_설명서.md)를 순서대로 따라 하세요.

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

다른 노트북에서 커넥터를 아직 실행하지 않아 Tunnel은 현재 `inactive`입니다. 커넥터 없이 DNS만 생성되어 있어도 API가 서비스되는 것은 아닙니다. 학교망은 Cloudflare로 나가는 7844 TCP/UDP 연결이 허용되어야 합니다. 차단되어 있으면 학교 네트워크 담당자에게 허용을 요청하세요. 관련 [공식 조건](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/)을 참고합니다.

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
- PIN 분실 시 서버 노트북에서 `node backend/manage.cjs reset-pin 학년 반 번호`를 실행하고 새 PIN을 입력합니다. 기존 로그인 세션도 종료됩니다. 공개된 관리자 쓰기 API는 없습니다.

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
