import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:growgame/event_prizes.dart';
import 'package:growgame/storage_stub.dart';

void main() {
  testWidgets('한국 시간 11월 30일에만 학생별 상품 수령 공지를 표시한다', (tester) async {
    addTearDown(memoryStorage.clear);
    final student = {'role': 'student', 'grade': 1, 'classNo': 1, 'number': 1};
    Map<String, dynamic> profile = student;
    var now = DateTime.utc(2026, 11, 29, 14, 59, 59);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () =>
                  showPrizePickupAnnouncement(context, profile, now: now),
              child: const Text('입장'),
            ),
          ),
        ),
      ),
    );

    Future<void> enter() async {
      await tester.tap(find.text('입장'));
      await tester.pumpAndSettle();
    }

    final heading = find.text('상품 수령');
    await enter();
    expect(heading, findsNothing);

    now = DateTime.utc(2026, 11, 29, 15);
    profile = {'role': 'teacher', 'name': '테스트 교사'};
    await enter();
    expect(heading, findsNothing);

    profile = student;
    await enter();
    expect(heading, findsOneWidget);
    expect(find.text('오늘'), findsOneWidget);
    expect(find.text('점심시간 · 중앙현관'), findsOneWidget);
    for (final text in ['×5', '뻥튀기', '×10', '과일 젤리', '×15', '빼빼로']) {
      expect(find.text(text), findsOneWidget);
    }
    await tester.tap(find.text('닫기'));
    await tester.pumpAndSettle();
    expect(heading, findsNothing);
    expect(memoryStorage, isEmpty);

    await enter();
    expect(heading, findsOneWidget);
    await tester.tap(find.text('오늘 하루 보지 않기'));
    await tester.pumpAndSettle();
    await enter();
    expect(heading, findsNothing);

    profile = {...student, 'number': 2};
    now = DateTime.utc(2026, 11, 30, 14, 59, 59);
    await enter();
    expect(heading, findsOneWidget);
    await tester.tap(find.text('닫기'));
    await tester.pumpAndSettle();

    now = DateTime.utc(2026, 11, 30, 15);
    await enter();
    expect(heading, findsNothing);
    expect(tester.takeException(), isNull);
  });
}
