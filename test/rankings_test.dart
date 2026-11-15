import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:growgame/game.dart';
import 'package:growgame/rankings/board.dart';

void main() {
  test('체험판도 개인과 반 수확 합계·공동 순위를 구분한다', () {
    final records = [
      freshRecord({'grade': 1, 'classNo': 1, 'number': 1}),
      freshRecord({'grade': 1, 'classNo': 1, 'number': 2}),
      freshRecord({'grade': 2, 'classNo': 1, 'number': 1}),
    ];
    records[0]['harvests'] = List.filled(2, {});
    records[1]['harvests'] = List.filled(1, {});
    records[2]['harvests'] = List.filled(3, {});
    final individual = localRankings(
      records,
      records[0]['profile'],
      'individual',
      0,
    );
    expect((individual['items'] as List).map((i) => i['harvestCount']), [
      3,
      2,
      1,
    ]);
    expect(individual['summary']['individual']['rank'], 2);
    expect(individual['summary']['class']['rank'], 1);
    final classes = localRankings(records, records[0]['profile'], 'class', 0);
    expect((classes['items'] as List).map((i) => i['rank']), [1, 1]);
    expect(classes['items'][0]['studentCount'], 2);
  });

  testWidgets('목록을 스크롤해도 내 개인·우리 반 순위는 두 탭 위에 고정된다', (tester) async {
    tester.view.physicalSize = const Size(390, 694);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    var scope = 'individual';
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) => Padding(
              padding: const EdgeInsets.all(16),
              child: RankingsBoard(
                scope: scope,
                loading: false,
                error: null,
                data: {
                  'page': 0,
                  'pages': 2,
                  'summary': {
                    'individual': {'rank': 11, 'harvestCount': 2},
                    'class': {'rank': 2, 'harvestCount': 80},
                  },
                  'items': List.generate(
                    10,
                    (i) => {
                      'rank': i + 1,
                      'grade': 1,
                      'classNo': i + 1,
                      'number': 1,
                      'harvestCount': 50 - i,
                      'isSelf': false,
                    },
                  ),
                },
                onScopeChanged: (value) => setState(() => scope = value),
                onPageChanged: (_) {},
                onRefresh: () {},
              ),
            ),
          ),
        ),
      ),
    );
    final personalPosition = tester.getTopLeft(find.text('내 개인 순위'));
    final classPosition = tester.getTopLeft(find.text('우리 반 순위'));
    await tester.drag(find.byType(ListView), const Offset(0, -450));
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(find.text('내 개인 순위')), personalPosition);
    expect(tester.getTopLeft(find.text('우리 반 순위')), classPosition);
    expect(find.text('11위'), findsOneWidget);
    await tester.tap(find.text('반 랭킹'));
    await tester.pumpAndSettle();
    expect(scope, 'class');
    expect(tester.getTopLeft(find.text('내 개인 순위')), personalPosition);
    expect(tester.getTopLeft(find.text('우리 반 순위')), classPosition);
    expect(tester.takeException(), isNull);
  });
}
