import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:growgame/missions/quiz/content.dart';
import 'package:growgame/missions/quiz/set_popup.dart';

void main() {
  testWidgets('10개 답을 모아 채점하고 결과를 확인한 뒤 닫는다', (tester) async {
    var submissions = 0;
    final questions = List.generate(
      10,
      (i) => QuizQuestion(
        id: i,
        question: '문제 ${i + 1}',
        choices: const ['가', '나', '다', '라'],
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: QuizSetPopup(
              questions: questions,
              submit: (answers) async {
                submissions++;
                expect(answers, List.filled(10, 0));
                return {
                  'correctCount': 10,
                  'growth': 100,
                  'answers': List.generate(
                    10,
                    (_) => {
                      'selected': 0,
                      'correctIndex': 0,
                      'correct': true,
                      'explanation': '해설',
                    },
                  ),
                };
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
    expect(find.text('10문제 중 10문제 정답'), findsOneWidget);
    expect(find.text('닫으면 영양분으로 +100% 성장해요.'), findsOneWidget);
    expect(find.text('정답 · 가'), findsNWidgets(10));
    expect(find.text('닫고 영양분 받기'), findsOneWidget);
  });
}
