import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:growgame/missions/quiz/content.dart';
import 'package:growgame/missions/quiz/set_popup.dart';

void main() {
  for (final correctCount in [0, 3, 10]) {
    testWidgets('기기에서 $correctCount개 정답을 채점하고 성장률만 한 번 제출한다', (tester) async {
      var submissions = 0;
      final questions = List.generate(
        10,
        (i) => QuizQuestion(
          id: i,
          question: '문제 ${i + 1}',
          choices: const ['가', '나', '다', '라'],
          correctIndex: i < correctCount ? 0 : 1,
          explanation: '해설',
        ),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: QuizSetPopup(
                questions: questions,
                submit: (growth) async {
                  submissions++;
                  expect(growth, correctCount * 10);
                  return {'correctCount': correctCount, 'growth': growth};
                },
              ),
            ),
          ),
        ),
      );
      for (var i = 0; i < 10; i++) {
        expect(submissions, 0);
        await tester.tap(find.text('가'));
        await tester.pump();
        final button = find.text(i == 9 ? '채점하고 정답 보기' : '다음 문제');
        await tester.ensureVisible(button);
        await tester.tap(button);
        await tester.pumpAndSettle();
      }
      expect(submissions, 1);
      expect(find.text('10문제 중 $correctCount문제 정답'), findsOneWidget);
      expect(
        find.text('닫으면 영양분으로 +${correctCount * 10}% 성장해요.'),
        findsOneWidget,
      );
      expect(find.text('정답 · 가'), findsNWidgets(correctCount));
      expect(find.text('정답 · 나'), findsNWidgets(10 - correctCount));
      expect(find.text('내 답 · 가'), findsNWidgets(10));
      expect(find.text('닫고 영양분 받기'), findsOneWidget);
    });
  }

  testWidgets('다시 열면 서버의 성장률 요약과 정답을 표시하고 재제출하지 않는다', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: QuizSetPopup(
              questions: List.generate(
                10,
                (i) => QuizQuestion(
                  id: i,
                  question: '문제 ${i + 1}',
                  choices: const ['가', '나', '다', '라'],
                  correctIndex: 1,
                  explanation: '해설',
                ),
              ),
              result: const {'correctCount': 3, 'growth': 30},
              claimed: true,
              submit: (_) async => throw StateError('완료 세트를 다시 제출하면 안 됩니다.'),
            ),
          ),
        ),
      ),
    );
    expect(find.text('10문제 중 3문제 정답'), findsOneWidget);
    expect(find.text('오늘의 퀴즈를 완료했어요.'), findsOneWidget);
    expect(find.text('정답 · 나'), findsNWidgets(10));
    expect(find.text('해설'), findsNWidgets(10));
    expect(find.textContaining('내 답 ·'), findsNothing);
  });

  test('문제와 함께 받은 정답·해설을 읽고 잘못된 정답 번호를 거부한다', () {
    final raw = {
      'id': 0,
      'question': '문제',
      'choices': ['가', '나', '다', '라'],
      'correctIndex': 2,
      'explanation': '해설',
    };
    final question = parseQuizQuestions([raw]).single;
    expect(question.correctIndex, 2);
    expect(question.explanation, '해설');
    for (final invalid in [-1, 4, '2']) {
      expect(
        () => parseQuizQuestions([
          {...raw, 'correctIndex': invalid},
        ]),
        throwsFormatException,
      );
    }
    expect(
      parseQuizQuestions([
        {...raw}..remove('correctIndex'),
      ]).single.correctIndex,
      isNull,
      reason: '이전 주간 퀴즈 응답도 읽을 수 있어야 함',
    );
  });
}
