import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:growgame/missions/special/gratitude.dart';

void main() {
  testWidgets('펼친 메시지만 읽음 처리하고 실패하면 재시도할 수 있다', (tester) async {
    final requests = <List<String>>[];
    var fail = true;
    final data = <String, dynamic>{
      'page': 0,
      'pages': 1,
      'items': [
        for (var i = 1; i <= 2; i++)
          {
            'id': 'message-$i',
            'sender': {'role': 'teacher', 'name': '발신자$i'},
            'body': '메시지 $i: 언제나 친절하게 도와주어서 정말 고마워요.',
            'readAt': '',
          },
      ],
    };
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: MessagesPopup(
              initialData: data,
              load: (_) async => data,
              markRead: (ids) async {
                requests.add(ids);
                if (fail) throw Exception('temporary');
              },
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(requests, isEmpty);
    expect(find.text('새 메시지 · 눌러서 읽기'), findsNWidgets(2));
    await tester.tap(find.text('발신자1 선생님'));
    await tester.pumpAndSettle();
    expect(requests, [
      ['message-1'],
    ]);
    expect(find.text('읽음 상태 다시 저장'), findsOneWidget);
    expect(find.text('메시지 1: 언제나 친절하게 도와주어서 정말 고마워요.'), findsOneWidget);
    expect(find.text('메시지 2: 언제나 친절하게 도와주어서 정말 고마워요.'), findsNothing);
    fail = false;
    await tester.tap(find.text('읽음 상태 다시 저장'));
    await tester.pumpAndSettle();
    expect(requests, [
      ['message-1'],
      ['message-1'],
    ]);
    expect(find.text('읽은 메시지'), findsOneWidget);
    expect(find.text('새 메시지 · 눌러서 읽기'), findsOneWidget);
    await tester.tap(find.text('발신자1 선생님'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('발신자1 선생님'));
    await tester.pumpAndSettle();
    expect(requests.length, 2);
    expect(tester.takeException(), isNull);
  });
}
