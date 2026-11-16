import 'package:flutter/material.dart';

/// Keeps whitespace-separated words together, except words wider than the line.
String keepWordsTogether(
  String text, {
  required TextStyle style,
  required double maxWidth,
  TextScaler textScaler = TextScaler.noScaling,
  TextDirection textDirection = TextDirection.ltr,
}) {
  if (!maxWidth.isFinite || maxWidth <= 0) return text;
  final painter = TextPainter(
    textDirection: textDirection,
    textScaler: textScaler,
    maxLines: 1,
  );
  try {
    return text.replaceAllMapped(RegExp(r'\S+'), (match) {
      final word = match.group(0)!;
      painter.text = TextSpan(text: word, style: style);
      painter.layout();
      // Long unspaced messages and enlarged text must still fit small screens.
      return painter.width <= maxWidth ? word.characters.join('\u2060') : word;
    });
  } finally {
    painter.dispose();
  }
}

class WordText extends Text {
  const WordText(
    super.data, {
    super.key,
    super.style,
    super.textAlign,
    super.maxLines,
    super.overflow,
    super.softWrap,
    super.semanticsLabel,
  });

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final defaults = DefaultTextStyle.of(context);
      var effectiveStyle = style == null || style!.inherit
          ? defaults.style.merge(style)
          : style!;
      if (MediaQuery.boldTextOf(context)) {
        effectiveStyle = effectiveStyle.merge(
          const TextStyle(fontWeight: FontWeight.bold),
        );
      }
      final scaler = MediaQuery.textScalerOf(context);
      return RichText(
        text: TextSpan(
          text: keepWordsTogether(
            data!,
            style: effectiveStyle,
            maxWidth: constraints.maxWidth,
            textScaler: scaler,
            textDirection: Directionality.of(context),
          ),
          style: effectiveStyle,
          semanticsLabel: semanticsLabel ?? data,
        ),
        textAlign: textAlign ?? defaults.textAlign ?? TextAlign.start,
        textScaler: scaler,
        maxLines: maxLines ?? defaults.maxLines,
        overflow: overflow ?? effectiveStyle.overflow ?? defaults.overflow,
        softWrap: softWrap ?? defaults.softWrap,
        textWidthBasis: defaults.textWidthBasis,
        textHeightBehavior:
            defaults.textHeightBehavior ??
            DefaultTextHeightBehavior.maybeOf(context),
      );
    },
  );
}
