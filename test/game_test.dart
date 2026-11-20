import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:growgame/game.dart';
import 'package:growgame/main.dart';
import 'package:growgame/missions.dart';
import 'package:growgame/storage_stub.dart' as test_storage;
import 'package:growgame/missions/quiz/content.dart';
import 'package:growgame/missions/quiz/popup.dart';
import 'package:growgame/missions/special/gratitude.dart';

void main() {
  testWidgets('감사 미션에서 받는 학생을 선택하고 10자 이상 작성한다', (tester) async {
    Map<String, dynamic>? submitted;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showDialog<Map<String, dynamic>>(
                context: context,
                builder: (_) => Dialog(
                  child: SingleChildScrollView(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: GratitudeMissionPopup(
                        data: {
                          'mission': {'id': 7},
                          'classes': [
                            {
                              'grade': 1,
                              'classNo': 12,
                              'numbers': [1, 2, 3],
                            },
                          ],
                          'submitted': [],
                          'remaining': 4,
                        },
                        profile: const {
                          'role': 'student',
                          'grade': 1,
                          'classNo': 12,
                          'number': 1,
                        },
                        submit: (input) async {
                          submitted = input;
                          return {'saved': true};
                        },
                      ),
                    ),
                  ),
                ),
              ),
              child: const Text('특별 미션 열기'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('특별 미션 열기'));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(DropdownButtonFormField<int>).at(1));
    await tester.pumpAndSettle();
    await tester.tap(find.text('12반').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byType(DropdownButtonFormField<int>).at(2));
    await tester.pumpAndSettle();
    await tester.tap(find.text('2번').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '고마워');
    await tester.pump();
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
    await tester.enterText(find.byType(TextField), '매일 친절하게 도와줘서 고마워요.');
    await tester.pump();
    await tester.tap(find.text('검토받기 +25%'));
    await tester.pumpAndSettle();
    expect(submitted?['recipient'], {'grade': 1, 'classNo': 12, 'number': 2});
    expect(submitted?['missionId'], 7);
    expect(tester.takeException(), isNull);
  });

  testWidgets('선생님 이름으로 참여하고 상단 표시와 기록을 복원한다', (tester) async {
    test_storage.memoryStorage.clear();
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(const GrowGame(demo: true));
    await tester.pumpAndSettle();
    await tester.tap(find.text('선생님'));
    await tester.pumpAndSettle();
    expect(find.text('선택'), findsNothing);
    await tester.enterText(find.byType(TextField), '가상교사');
    await tester.pump();
    await tester.tap(find.text('시작하기'));
    await tester.pumpAndSettle();
    expect(find.text('가상교사 선생님'), findsOneWidget);
    await tester.tap(find.text('물 주기 +50%'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('랭킹 보드'));
    await tester.pumpAndSettle();
    expect(find.text('우리 반 순위'), findsNothing);
    expect(find.text('가상교사 선생님'), findsOneWidget);
    await tester.tap(find.text('내 밭'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('가상교사 선생님'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('참여 정보 바꾸기'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('시작하기'));
    await tester.pumpAndSettle();
    expect(find.text('50 / 100%'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  test('명단 학생과 이전 기록의 프로필 표시 및 교사 식별', () {
    expect(
      profileDisplayLabel({
        'grade': 1,
        'classNo': 12,
        'number': 1,
        'name': '가상학생',
      }),
      '1학년 12반 가상학생',
    );
    expect(
      profileDisplayLabel({'grade': 1, 'classNo': 1, 'number': 1}),
      '1학년 1반 1번',
    );
    expect(validProfile({'role': 'teacher', 'name': '가상교사'}), isTrue);
    expect(validProfile({'role': 'teacher', 'name': ''}), isFalse);
    final records = [
      freshRecord({'role': 'teacher', 'name': '가상교사'}),
      freshRecord({'role': 'teacher', 'name': '다른교사'}),
    ];
    expect(
      decodeRecords(jsonEncode({'version': 1, 'records': records})),
      hasLength(2),
    );
    expect(
      localRankings(records, records.first['profile'], 'class', 0)['total'],
      0,
    );
  });

  testWidgets('퀴즈 오답 재시도와 모든 문제 완료', (tester) async {
    bool? result;
    const questions = [
      QuizQuestion(
        question: '질문 가',
        choices: ['오답', '정답', '보기 다', '보기 라'],
        correctIndex: 1,
      ),
      QuizQuestion(
        question: '질문 나',
        choices: ['맞아요', '아니에요', '보기 셋', '보기 넷'],
        correctIndex: 0,
      ),
    ];
    expect(questions.every((q) => q.isValid), isTrue);
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () async {
              result = await showDialog<bool>(
                context: context,
                builder: (_) => const Dialog(
                  child: QuizMissionPopup(
                    questions: questions,
                    canComplete: true,
                  ),
                ),
              );
            },
            child: const Text('열기'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('열기'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('오답'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('정답 확인'));
    await tester.pumpAndSettle();
    expect(find.text('다시 생각해 보세요.'), findsOneWidget);
    expect(result, isNull);
    await tester.tap(find.text('정답'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('정답 확인'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('다음 문제'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('맞아요'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('정답 확인'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('미션 완료'));
    await tester.pumpAndSettle();
    expect(result, isTrue);
    expect(missionWeek('2026-11-15'), '2026-11-09');
    expect(missionWeek('2026-11-16'), '2026-11-16');
  });
  test('날짜별 미션 저장·복원과 잘못된 입력 검증', () {
    test_storage.memoryStorage.clear();
    final data = {
      '2026-11-10': {'title': '인사하기', 'description': '친구에게 먼저 인사해요.'},
      '2026-11-11': {'title': '감사하기', 'description': '고마운 마음을 전해요.'},
    };
    saveMissions(data);
    expect(loadMissions(), data);
    expect(
      () => decodeMissions(
        '{"missions":{"2026-02-30":{"title":"미션","description":"내용"}}}',
      ),
      throwsFormatException,
    );
    expect(
      () => decodeMissions(
        '{"missions":{"2026-11-10":{"title":"","description":"내용"}}}',
      ),
      throwsFormatException,
    );
  });
  test('기존 저장 기록 호환, 성장 제한, 서울 날짜', () {
    final record = freshRecord({'grade': 2, 'classNo': 3, 'number': 12});
    expect(
      decodeRecords(
        jsonEncode({
          'version': 1,
          'records': [record],
        }),
      ).single,
      record,
    );
    for (var i = 0; i < 2; i++) {
      expect(growRecord(record, 'water'), isTrue);
      expect(record['progress'], (i + 1) * 50);
    }
    expect(record['progress'], 100);
    expect(growRecord(record, 'mission'), isFalse);
    record['progress'] = 0;
    record['dailyMode'] = true;
    expect(growRecord(record, 'water'), isFalse);
    expect(growRecord(record, 'mission'), isTrue);
    expect(growRecord(record, 'mission'), isFalse);
    expect(seoulDay(DateTime.utc(2026, 11, 9, 15)), '2026-11-10');
    expect(() => decodeRecords('{broken'), throwsFormatException);
    expect(
      () => decodeRecords(
        jsonEncode({
          'version': 1,
          'records': [record, record],
        }),
      ),
      throwsFormatException,
    );
  });

  test('태블릿과 PC는 모바일 비율을 유지하며 화면 안에서 최대 확대', () {
    for (final viewport in [
      const Size(768, 1024),
      const Size(1920, 1080),
      const Size(2560, 1440),
    ]) {
      final stage = stageSize(viewport);
      expect(stage, const Size(390, 844));
    }
    expect(stageSize(const Size(390, 844)), const Size(390, 844));
    expect(stageSize(const Size(375, 667)).height, 694);
  });

  testWidgets('모든 화면 크기에서 입장, 미션, 수확, 도감, 정원 동작', (tester) async {
    for (final size in [
      const Size(320, 568),
      const Size(390, 844),
      const Size(844, 390),
      const Size(768, 1024),
      const Size(1920, 1080),
    ]) {
      test_storage.memoryStorage.clear();
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      await tester.pumpWidget(const GrowGame(demo: true));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(tester.getSize(find.byType(FittedBox).first), size);
      for (final field in ['학년', '반', '번호']) {
        await tester.tap(find.text('선택').first);
        await tester.pumpAndSettle();
        await tester.tap(
          find.text(
            field == '번호'
                ? '24번'
                : field == '반'
                ? '10반'
                : '3학년',
          ),
        );
        await tester.pumpAndSettle();
      }
      final fields = tester.widgetList<Text>(find.text('24번'));
      expect(fields.single.maxLines, 1);
      expect(fields.single.softWrap, isFalse);
      final fieldButtons = tester.widgetList<OutlinedButton>(
        find.byType(OutlinedButton),
      );
      final sizes = fieldButtons
          .map((button) => tester.getSize(find.byWidget(button)))
          .toList();
      expect(sizes.toSet().length, 1);
      await tester.tap(find.text('시작하기'));
      await tester.pumpAndSettle();
      expect(find.text('등록된 미션이 없어요.'), findsNothing);
      await tester.tap(find.text('미션'));
      await tester.pumpAndSettle();
      expect(find.text('등록된 미션이 없어요.'), findsNothing);
      expect(find.text('퀴즈 미션'), findsOneWidget);
      expect(find.text('특별 미션'), findsNothing);
      expect(find.text('새 미션'), findsNothing);
      await tester.tap(find.text('퀴즈 미션'));
      await tester.pumpAndSettle();
      expect(find.text('이번 주 퀴즈를 준비하고 있어요.'), findsOneWidget);
      await tester.tap(find.byTooltip('닫기'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('메시지'));
      await tester.pumpAndSettle();
      expect(find.text('아직 도착한 메시지가 없어요.'), findsOneWidget);
      await tester.tap(find.byTooltip('닫기'));
      await tester.pumpAndSettle();
      expect(
        tester.getTopLeft(find.text('미션')).dx,
        lessThan(tester.getTopLeft(find.text('메시지')).dx),
      );
      expect(
        tester.getTopLeft(find.text('미션')).dy,
        greaterThan(
          tester.getBottomLeft(find.byType(LinearProgressIndicator).first).dy,
        ),
      );
      expect(find.byIcon(Icons.settings_outlined), findsNothing);
      await tester.tap(find.text('3학년 10반 24번'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('관리자 미션 관리'));
      await tester.pumpAndSettle();
      // 빈 내용은 저장하지 않습니다.
      await tester.tap(find.text('미션 저장'));
      await tester.pumpAndSettle();
      expect(find.text('제목을 입력해 주세요.'), findsOneWidget);
      await tester.enterText(
        find.byType(TextFormField).first,
        '친구에게 고마운 마음을 전해요',
      );
      await tester.enterText(
        find.byType(TextFormField).last,
        '친구 한 명에게 감사한 이유를 전해보세요.',
      );
      await tester.ensureVisible(find.text('미션 저장'));
      await tester.tap(find.text('미션 저장'));
      await tester.pumpAndSettle();
      expect(loadMissions()[seoulDay()]?['title'], '친구에게 고마운 마음을 전해요');
      await tester.tap(find.byTooltip('닫기'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('미션'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('특별 미션'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('미션을 완료했어요'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('완료하기'));
      await tester.pumpAndSettle();
      for (var i = 0; i < 2; i++) {
        await tester.tap(find.text('물 주기 +50%'));
        await tester.pumpAndSettle();
      }
      await tester.tap(find.text('수확하기'));
      await tester.pumpAndSettle();
      expect(find.text('수확 성공!'), findsOneWidget);
      await tester.tap(find.text('랭킹 보기'));
      await tester.pumpAndSettle();
      expect(find.text('수확 1개'), findsNWidgets(2));
      expect(find.text('내 개인 순위'), findsOneWidget);
      expect(find.text('우리 반 순위'), findsOneWidget);
      await tester.tap(find.text('반 랭킹'));
      await tester.pumpAndSettle();
      expect(find.text('우리 반'), findsOneWidget);
      await tester.tap(find.text('도감'));
      await tester.pumpAndSettle();
      expect(find.text('작물 도감  1/${crops.length}'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    }
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}
