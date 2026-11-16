import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:growgame/word_text.dart';

void main() {
  test('한글 단어 사이에서 줄바꿈하고 명시적인 공백과 개행을 보존한다', () {
    const source = '독립을 위해 바친 마음을 기억해요.\n서로의 존엄을 소중히 여겨요.';
    const style = TextStyle(fontSize: 18);
    for (final width in [180.0, 238.0, 306.0, 600.0]) {
      final displayed = keepWordsTogether(
        source,
        style: style,
        maxWidth: width,
      );
      expect(displayed.replaceAll('\u2060', ''), source);
      final painter = TextPainter(
        text: TextSpan(text: displayed, style: style),
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: width);
      final words = RegExp(r'\S+').allMatches(displayed);
      for (final word in words) {
        final first = painter.getLineBoundary(TextPosition(offset: word.start));
        final last = painter.getLineBoundary(
          TextPosition(offset: word.end - 1),
        );
        expect(first, last, reason: '단어 중간에서 줄바꿈: ${word.group(0)} / $width');
      }
      painter.dispose();
    }
  });

  test('한 줄보다 긴 단어와 큰 글씨는 줄바꿈하여 화면 안에 들어온다', () {
    final longWord = List.filled(30, '고마워요').join();
    const style = TextStyle(fontSize: 18);
    final displayed = keepWordsTogether(
      longWord,
      style: style,
      maxWidth: 180,
      textScaler: TextScaler.linear(2),
    );
    expect(displayed, longWord);
    final painter = TextPainter(
      text: TextSpan(text: displayed, style: style),
      textDirection: TextDirection.ltr,
      textScaler: const TextScaler.linear(2),
    )..layout(maxWidth: 180);
    expect(painter.computeLineMetrics().length, greaterThan(1));
    expect(
      painter.computeLineMetrics().every((line) => line.width <= 180),
      isTrue,
    );
    painter.dispose();
  });

  testWidgets('작은 모바일·모바일·PC에서 원문과 접근성 이름을 유지한다', (tester) async {
    const source = '독립을 향한 희생, 우리가 이어 갈 기억';
    final semantics = tester.ensureSemantics();

    for (final width in [320.0, 390.0, 1920.0]) {
      tester.view.physicalSize = Size(width, 844);
      tester.view.devicePixelRatio = 1;
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Padding(
              padding: EdgeInsets.all(42),
              child: WordText(source, style: TextStyle(fontSize: 23)),
            ),
          ),
        ),
      );
      expect(find.text(source), findsOneWidget);
      expect(find.bySemanticsLabel(source), findsOneWidget);
      expect(tester.takeException(), isNull);
    }
    semantics.dispose();
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  });

  testWidgets('한 글자와 긴 단어도 원문 Text를 중복 생성하지 않는다', (tester) async {
    const longWord = '긴단어가한줄보다길어져도화면안에서나누어표시합니다';
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 80,
            child: Column(children: [WordText('가'), WordText(longWord)]),
          ),
        ),
      ),
    );
    expect(find.text('가'), findsOneWidget);
    expect(find.text(longWord), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
