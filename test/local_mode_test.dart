import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:growgame/local_test_data.dart';
import 'package:growgame/main.dart';
import 'package:growgame/storage_stub.dart';

void main() {
  testWidgets('서버 없는 테스트는 전용 기록 한 개로 시작하고 저장됨', (tester) async {
    memoryStorage.clear();
    await tester.pumpWidget(const GrowGame(demo: true));
    await tester.pumpAndSettle();
    expect(find.text('로컬 테스트'), findsOneWidget);
    expect(find.text('1학년 1반 1번'), findsOneWidget);
    expect(find.text('0 / 100%'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    await tester.tap(find.text('물 주기 +50%'));
    await tester.pumpAndSettle();
    expect(find.text('50 / 100%'), findsOneWidget);
    expect(memoryStorage.containsKey(localTestStorageKey), isTrue);
    expect(memoryStorage.containsKey('growgame.figma-game.v1'), isFalse);
    await tester.tap(find.text('미션'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('퀴즈 미션'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('50%'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('정답 확인'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('미션 완료'));
    await tester.pumpAndSettle();
    expect(find.text('80 / 100%'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(const GrowGame(demo: true));
    await tester.pumpAndSettle();
    expect(find.text('80 / 100%'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  }, skip: !localTestMode);
}
