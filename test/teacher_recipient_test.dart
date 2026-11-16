import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:growgame/missions/special/gratitude.dart';

void main() {
  testWidgets('감사 편지의 받는 선생님 성함을 입력하고 학생과 작성 횟수를 공유한다', (tester) async {
    Map<String, dynamic>? submitted;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              child: const Text('열기'),
              onPressed: () => showDialog<void>(
                context: context,
                builder: (_) => Dialog(
                  child: SingleChildScrollView(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: GratitudeMissionPopup(
                        data: {
                          'mission': {'id': 9},
                          'classes': [
                            {
                              'grade': 1,
                              'classNo': 1,
                              'numbers': [1, 2],
                            },
                          ],
                          'submitted': [
                            {'role': 'teacher', 'name': '이미보낸'},
                          ],
                          'remaining': 3,
                        },
                        profile: const {'grade': 1, 'classNo': 1, 'number': 1},
                        submit: (input) async {
                          submitted = input;
                          return {};
                        },
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('열기'));
    await tester.pumpAndSettle();
    expect(find.text('이미보낸 선생님'), findsOneWidget);
    expect(find.text('1 / 4명 작성 완료'), findsOneWidget);
    expect(find.byType(DropdownButtonFormField<int>), findsNWidgets(3));
    await tester.tap(find.text('선생님'));
    await tester.pumpAndSettle();
    expect(find.byType(DropdownButtonFormField<int>), findsNothing);
    final message = find.widgetWithText(TextField, '감사의 말');
    final name = find.widgetWithText(TextField, '받는 선생님 성함');
    await tester.enterText(message, '매일 따뜻하게 알려 주셔서 정말 감사합니다.');
    await tester.pumpAndSettle();
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
    await tester.enterText(name, '  고마운선생님  ');
    await tester.pumpAndSettle();
    final send = find.text('검토받기 +25%');
    await tester.ensureVisible(send);
    await tester.tap(send);
    await tester.pumpAndSettle();
    expect(submitted?['recipient'], {'role': 'teacher', 'name': '고마운선생님'});
    expect(submitted?['missionId'], 9);
    expect(submitted?['message'], '매일 따뜻하게 알려 주셔서 정말 감사합니다.');
    expect(tester.takeException(), isNull);
  });
}
