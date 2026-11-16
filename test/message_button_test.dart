import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:growgame/message_button.dart';

void main() {
  testWidgets('안 읽은 메시지 숫자와 강조 테두리는 읽으면 사라진다', (tester) async {
    var unread = 2;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, update) => MessageButton(
              unreadCount: unread,
              onPressed: () => update(() => unread--),
            ),
          ),
        ),
      ),
    );
    expect(find.text('2'), findsOneWidget);
    expect(find.bySemanticsLabel('메시지, 안 읽은 메시지 2개'), findsOneWidget);
    final highlighted = tester
        .widget<TextButton>(find.byType(TextButton))
        .style!
        .side!
        .resolve({});
    expect(highlighted!.color, const Color(0xffbd7c13));
    await tester.tap(find.text('메시지'));
    await tester.pump();
    expect(find.text('1'), findsOneWidget);
    await tester.tap(find.text('메시지'));
    await tester.pump();
    expect(find.byKey(const ValueKey('unread-message-count')), findsNothing);
    final normal = tester
        .widget<TextButton>(find.byType(TextButton))
        .style!
        .side!
        .resolve({});
    expect(normal!.color, Colors.transparent);
  });
}
