# 미션 내용과 팝업 수정

## 내용은 백엔드에서 관리

- 퀴즈: `backend/quiz.template.json`을 복사해서 작성합니다. 문제마다 보기 네 개와 정답 번호 `correctIndex` 0~3을 등록합니다.
- 특별 미션: `backend/special.template.json` 형식으로 작성합니다.
- `week`는 서울 날짜 기준 월요일입니다. 같은 주차를 다시 등록하면 내용과 버전을 갱신합니다.

```powershell
node backend/manage.cjs import-quiz backend/content/이번주.json
node backend/manage.cjs import-special backend/content/특별미션.json
```

내용 변경에는 프론트 재배포가 필요 없습니다. 정답은 서버에만 저장합니다. `quiz/content.dart`는 API 응답의 데이터 형식과 네 가지 보기 검증을 정의하며, 실제 문제를 넣는 파일이 아닙니다.

## 화면과 진행 방식

- `quiz/popup.dart`: 보기 선택, 정답 확인 요청, 오답 재시도, 다음 문제, 완료 화면.
- `special/popup.dart`: 특별 미션 내용과 수행 확인 UI.
- `lib/main.dart`: 두 종류의 미션 선택 팝업과 API 연결.

모든 문제를 맞힌 뒤 서버에서 확인해야 성장 +30%를 받습니다. 하루 제한을 켜면 퀴즈·특별 미션은 하루 보상 횟수를 공유합니다. 판정과 보상 규칙을 바꿀 때는 `backend/store.cjs`도 함께 수정합니다.

팝업 코드를 바꾼 뒤 `flutter test`, `flutter build web --no-web-resources-cdn`을 실행합니다. [실행·DB·백업 안내](../../backend/README.md)를 참고하세요.
