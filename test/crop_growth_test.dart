import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:growgame/crops/crop_growth.dart';
import 'package:growgame/game.dart';

void main() {
  test('새 11종 에셋의 4단계와 수확 이미지가 동일 캔버스 규격', () {
    for (final crop in crops.keys) {
      for (final suffix in [
        'stage-01',
        'stage-02',
        'stage-03',
        'stage-04',
        'harvest',
      ]) {
        final bytes = File('assets/crops/$crop-$suffix.png').readAsBytesSync();
        expect(bytes.take(8), [
          137,
          80,
          78,
          71,
          13,
          10,
          26,
          10,
        ], reason: '$crop-$suffix PNG');
        final header = ByteData.sublistView(bytes);
        expect(header.getUint32(16), 1024, reason: '$crop-$suffix width');
        expect(header.getUint32(20), 1024, reason: '$crop-$suffix height');
      }
    }
  });

  test('성장 경계에서 크기와 투명도가 끊기지 않고 밑동이 고정됨', () {
    expect(growthPose(0).from, 0);
    expect(growthPose(0).blend, 0);
    expect(growthPose(100).to, 3);
    expect(growthPose(100).blend, 1);
    expect(growthPose(100).incomingScale, 1);
    expect(cropRootAnchor, const Alignment(0, .64));
    for (final boundary in [100 / 3, 200 / 3]) {
      final before = growthPose(boundary - .00001);
      final after = growthPose(boundary + .00001);
      expect(before.to, after.from);
      expect(before.blend, closeTo(1, .00001));
      expect(after.blend, closeTo(0, .00001));
      expect(before.incomingScale, closeTo(1, .00001));
    }
    expect(growthPose(-1).blend, 0);
    expect(growthPose(110).blend, 1);
    expect(() => growthPose(double.nan), throwsArgumentError);
  });

  testWidgets('현재 작물만 준비하고 저장된 성장률부터 자연스럽게 전환', (tester) async {
    var ready = false;
    Widget plant(double progress) => MaterialApp(
      home: SizedBox(
        width: 390,
        height: 390,
        child: CropGrowth(
          cropId: 'apple',
          name: '사과',
          progress: progress,
          onReady: () => ready = true,
        ),
      ),
    );
    await tester.pumpWidget(plant(50));
    for (var i = 0; i < 100 && !ready; i++) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 10)),
      );
      await tester.pump();
    }
    expect(ready, isTrue);
    await tester.pump();
    expect(find.bySemanticsLabel('사과 성장 50%'), findsOneWidget);
    expect(find.byType(Image), findsNWidgets(2));
    await tester.pumpWidget(plant(100));
    await tester.pump(const Duration(milliseconds: 900));
    expect(find.bySemanticsLabel('사과 성장 50%'), findsNothing);
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('사과 성장 100%'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
