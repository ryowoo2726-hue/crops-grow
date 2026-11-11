import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:growgame/crops/reward_effect.dart';
import 'package:growgame/game.dart';
import 'package:growgame/main.dart';
import 'package:growgame/storage_stub.dart';

Future<void> enterFarm(WidgetTester tester, {bool reduceMotion = false}) async {
  memoryStorage.clear();
  final record = freshRecord({'grade': 1, 'classNo': 1, 'number': 1});
  record['progress'] = 70;
  memoryStorage[storageKey] = jsonEncode({
    'version': 1,
    'records': [record],
  });
  await tester.pumpWidget(
    MaterialApp(
      theme: gameTheme(),
      builder: (_, child) => MediaQuery(
        data: MediaQueryData(
          size: const Size(390, 844),
          disableAnimations: reduceMotion,
        ),
        child: child!,
      ),
      home: const FarmGame(demo: true),
    ),
  );
  await tester.pumpAndSettle();
  for (final value in ['1학년', '1반', '1번']) {
    await tester.tap(find.text('선택').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text(value));
    await tester.pumpAndSettle();
  }
  await tester.tap(find.text('시작하기'));
  await tester.pumpAndSettle();
}

void main() {
  test('성장은 도착 후에만 시작하고 물방울은 밑동에 도착한다', () {
    const home = Offset(300, 480), root = Offset(180, 400);
    expect(waterJump(0, home, root), home);
    expect((waterJump(.48, home, root) - root).distance, lessThan(.000001));
    expect(waterJump(.3, home, root).dy, lessThan(root.dy));
    expect(rewardAbsorption(.48), 0);
    expect(rewardAbsorption(.7), inExclusiveRange(0, 1));
    expect(rewardAbsorption(1), 1);
  });

  testWidgets('실제 저장은 즉시, 도착 후 성장·100% 상한·중복 입력·화면 종료', (tester) async {
    await enterFarm(tester);
    await tester.tap(find.text('물 주기 +50%'));
    await tester.pump();
    await tester.pump();
    expect(find.byType(RewardEffect), findsOneWidget);
    final effect = tester.widget<RewardEffect>(find.byType(RewardEffect));
    expect(effect.kind, 'water');
    expect(effect.gain, 30);
    expect(find.text('70 / 100%'), findsOneWidget);
    expect(decodeRecords(memoryStorage[storageKey]).single['progress'], 100);
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
    await tester.tap(find.text('물 주기 +50%'));
    await tester.pump(const Duration(milliseconds: 1000));
    expect(find.text('70 / 100%'), findsOneWidget);
    await tester.pumpAndSettle();
    expect(find.byType(RewardEffect), findsNothing);
    expect(find.text('100 / 100%'), findsOneWidget);
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNotNull,
    );
    await tester.pumpWidget(const SizedBox());
    expect(tester.takeException(), isNull);
  });

  testWidgets('동작 줄이기는 효과 없이 확정된 성장도를 바로 표시', (tester) async {
    await enterFarm(tester, reduceMotion: true);
    await tester.tap(find.text('물 주기 +50%'));
    await tester.pumpAndSettle();
    expect(find.byType(RewardEffect), findsNothing);
    expect(find.text('100 / 100%'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    expect(tester.takeException(), isNull);
  });

  testWidgets('효과 재생 중 화면 종료는 보상 기록을 취소하지 않음', (tester) async {
    await enterFarm(tester);
    await tester.tap(find.text('물 주기 +50%'));
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(RewardEffect), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    expect(decodeRecords(memoryStorage[storageKey]).single['progress'], 100);
    expect(tester.takeException(), isNull);
  });
}
