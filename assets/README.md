# 게임 이미지와 디자인 자료

현재 앱 실행·검증 방법은 [프로젝트 안내](../README.md)를 참고하세요.

- `crops/`: 작물 11종 × 성장 4단계와 수확물, 총 55장.
- `environment/`: 학교 텃밭 배경과 논·마른 흙 바닥.
- `characters/`: 물방울 캐릭터 원본.
- `fonts/`: Noto Sans KR 글꼴과 OFL 라이선스.
- `ui-mockups/`: 원본 화면 디자인 참고 시안.
- `asset-manifest.json`: 원본 이미지 메타데이터와 컬러 토큰.

실제 앱 리소스는 `pubspec.yaml`에 등록합니다. 게임 화면은 `lib/main.dart`, 11종 공통 성장 애니메이션은 `lib/crops/crop_growth.dart`에 있습니다. 이전 HTML 미리보기·JavaScript 성장 렌더러·SVG 아이콘은 Flutter 전환 후 정리했습니다.

작물과 바닥 PNG는 1024×1024 투명 이미지이며 작물 밑동은 가로 50%, 세로 82% 위치를 기준으로 맞췄습니다. 벼는 `field-base.png`, 나머지 작물은 `field-dry-base.png`와 조합합니다.

제작 명세: [기본 이미지 프롬프트](../디자인_이미지_생성_프롬프트.md), [가을 작물 프롬프트](../가을_작물_이미지_생성_프롬프트.md).
