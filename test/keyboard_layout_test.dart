import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:growgame/main.dart';
import 'package:growgame/missions/special/gratitude.dart';
import 'package:growgame/storage_stub.dart' as test_storage;

void main() {
  testWidgets('모바일 키보드가 열려도 게임 화면의 크기와 배율은 유지한다', (tester) async {
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetViewInsets);
    addTearDown(tester.view.resetViewPadding);
    addTearDown(tester.view.resetPadding);
    for (final viewport in [const Size(320, 568), const Size(390, 844)]) {
      test_storage.memoryStorage.clear();
      tester.view.physicalSize = viewport;
      tester.view.devicePixelRatio = 1;
      tester.view.viewInsets = FakeViewPadding.zero;
      tester.view.viewPadding = const FakeViewPadding(bottom: 34);
      tester.view.padding = const FakeViewPadding(bottom: 34);
      await tester.pumpWidget(const GrowGame(demo: true));
      await tester.pumpAndSettle();
      final image = find.byType(Image).first;
      final before = tester.getRect(image);
      final stage = tester.getSize(find.byType(FarmGame));
      tester.view.viewInsets = FakeViewPadding(bottom: viewport.height * .4);
      tester.view.padding = FakeViewPadding.zero;
      await tester.pumpAndSettle();
      expect(tester.getRect(image), before);
      expect(tester.getSize(find.byType(FarmGame)), stage);
      final context = tester.element(find.byType(FarmGame));
      expect(MediaQuery.viewInsetsOf(context).bottom, greaterThan(0));
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    }
  });

  testWidgets('감사 입력칸은 키보드 위로 스크롤되고 작성 내용이 유지된다', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          resizeToAvoidBottomInset: false,
          body: Builder(
            builder: (context) => TextButton(
              child: const Text('작성하기'),
              onPressed: () => showDialog<void>(
                context: context,
                builder: (context) => Dialog(
                  insetPadding: const EdgeInsets.all(22),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      maxHeight:
                          MediaQuery.sizeOf(context).height -
                          MediaQuery.viewInsetsOf(context).bottom -
                          60,
                    ),
                    child: const Padding(
                      padding: EdgeInsets.all(20),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('특별 미션'),
                          SizedBox(height: 12),
                          Flexible(
                            child: SingleChildScrollView(
                              child: GratitudeMissionPopup(
                                data: {
                                  'mission': {'id': 1},
                                  'classes': [
                                    {
                                      'grade': 1,
                                      'classNo': 1,
                                      'numbers': [1, 2],
                                    },
                                  ],
                                  'submitted': [],
                                  'remaining': 4,
                                },
                                profile: {
                                  'role': 'student',
                                  'grade': 1,
                                  'classNo': 1,
                                  'number': 1,
                                },
                                submit: _unusedSubmit,
                              ),
                            ),
                          ),
                        ],
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
    await tester.tap(find.text('작성하기'));
    await tester.pumpAndSettle();
    final field = find.byType(TextField);
    await tester.ensureVisible(field);
    await tester.tap(field);
    await tester.pumpAndSettle();
    await tester.enterText(field, '매일 친절하게 도와줘서 고마워요.\n앞으로도 함께 즐겁게 지내요.');
    tester.view.viewInsets = const FakeViewPadding(bottom: 330);
    await tester.pumpAndSettle();
    final rect = tester.getRect(field);
    expect(rect.bottom, lessThanOrEqualTo(844 - 330));
    expect(rect.top, greaterThanOrEqualTo(0));
    expect(tester.widget<TextField>(field).focusNode!.hasFocus, isTrue);
    expect(
      tester.widget<TextField>(field).controller!.text,
      '매일 친절하게 도와줘서 고마워요.\n앞으로도 함께 즐겁게 지내요.',
    );
    tester.view.viewInsets = FakeViewPadding.zero;
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}

Future<Map<String, dynamic>> _unusedSubmit(Map<String, dynamic> _) async => {};
