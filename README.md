# 마석중학교 농작물 키우기

Flutter Web 프론트와 다른 노트북에서 실행하는 Node.js + SQLite 백엔드입니다.

**다른 AI 또는 다음 작업은 [프로젝트 인수인계 문서](docs/PROJECT_HANDOFF.md)를 먼저 읽어주세요.** 현재 상태·규칙·API·DB·검증·주의할 오류와 남은 작업을 기록합니다.

- 프론트 주소: `https://cropgrow.sangsangbar.com`
- API 주소: `https://cropgrow-api.sangsangbar.com`
- GitHub `main`과 Cloudflare Pages `cropgrow`를 연결했습니다. push하면 자동 배포됩니다. 프론트 도메인은 `cropgrow.sangsangbar.com`입니다. 백엔드 Tunnel과 API DNS도 설정했으며, 서버 노트북 커넥터 실행은 남아 있습니다.

## 실행과 배포

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
flutter build web --no-web-resources-cdn
node server.cjs
```

로컬 연결 검증 때만 다음처럼 API 주소를 덮어씁니다.

```powershell
flutter build web --no-web-resources-cdn --dart-define=API_BASE_URL=http://127.0.0.1:8787
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
