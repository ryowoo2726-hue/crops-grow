import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../image_assets.dart';

const rewardEffectDuration = Duration(milliseconds: 2800);

double rewardPhase(double t, double start, double end) =>
    ((t - start) / (end - start)).clamp(0.0, 1.0);

double rewardAbsorption(double t) =>
    Curves.easeInOut.transform(rewardPhase(t, .5, .88));

Offset waterJump(double t, Offset home, Offset root) {
  final p = Curves.easeInOut.transform(rewardPhase(t, .12, .48));
  return Offset.lerp(home, root, p)! -
      Offset(0, math.sin(p * math.pi) * math.min(140, (root - home).distance));
}

/// Coordinates are measured inside the farm, so the gauge and crop stay aligned
/// with the effects under the game's FittedBox and on short screens.
class RewardEffect extends StatelessWidget {
  const RewardEffect({
    super.key,
    required this.kind,
    required this.time,
    required this.home,
    required this.root,
    required this.gauge,
    required this.gain,
  });

  final String kind;
  final double time;
  final Offset home, root;
  final Rect gauge;
  final int gain;

  @override
  Widget build(BuildContext context) {
    final jump = waterJump(time, home, root);
    final crouch = math.sin(rewardPhase(time, 0, .12) * math.pi / 2);
    final flight = rewardPhase(time, .12, .48);
    return IgnorePointer(
      child: ExcludeSemantics(
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned.fill(
              child: CustomPaint(
                painter: _RewardPainter(kind, time, home, root, gauge, gain),
              ),
            ),
            if (kind == 'water' && time < .48)
              Positioned(
                left: jump.dx - 45,
                top: jump.dy - 50,
                child: Transform.rotate(
                  angle: -.35 * math.sin(flight * math.pi),
                  child: Transform.scale(
                    scaleX: time < .12 ? 1 + .18 * crouch : .9,
                    scaleY: time < .12 ? 1 - .22 * crouch : 1.12,
                    child: Image(
                      image: gameImage('characters/drop-default', width: 256),
                      width: 90,
                      height: 100,
                      fit: BoxFit.contain,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _RewardPainter extends CustomPainter {
  _RewardPainter(
    this.kind,
    this.t,
    this.home,
    this.root,
    this.gauge,
    this.gain,
  );
  final String kind;
  final double t;
  final Offset home, root;
  final Rect gauge;
  final int gain;

  void dot(Canvas canvas, Offset p, double r, Color color) =>
      canvas.drawCircle(p, r, Paint()..color = color);

  void glow(Canvas canvas, Offset p, double r, Color color) {
    canvas.drawCircle(
      p,
      r,
      Paint()
        ..shader = RadialGradient(
          colors: [color, color.withValues(alpha: 0)],
        ).createShader(Rect.fromCircle(center: p, radius: r)),
    );
  }

  void sparkle(Canvas canvas, Offset p, double r, double opacity) {
    final path = Path()
      ..moveTo(p.dx, p.dy - r)
      ..quadraticBezierTo(p.dx + 1, p.dy - 1, p.dx + r, p.dy)
      ..quadraticBezierTo(p.dx + 1, p.dy + 1, p.dx, p.dy + r)
      ..quadraticBezierTo(p.dx - 1, p.dy + 1, p.dx - r, p.dy)
      ..quadraticBezierTo(p.dx - 1, p.dy - 1, p.dx, p.dy - r);
    canvas.drawPath(
      path,
      Paint()..color = Color(0xfffff5b3).withValues(alpha: opacity),
    );
  }

  @override
  void paint(Canvas canvas, Size size) {
    if (kind == 'water') {
      if (t > .12 && t < .48) {
        for (var i = 1; i <= 5; i++) {
          dot(
            canvas,
            waterJump(math.max(.12, t - i * .01), home, root),
            4 - i * .5,
            const Color(0xff87d8f1).withValues(alpha: .3 - i * .04),
          );
        }
      }
      final splash = rewardPhase(t, .48, .83);
      if (splash > 0 && splash < 1) {
        glow(
          canvas,
          root,
          65,
          const Color(0xff88e4ff).withValues(alpha: .5 * (1 - splash)),
        );
        for (var i = 0; i < 3; i++) {
          final p = rewardPhase(t, .48 + i * .035, .83);
          if (p <= 0 || p >= 1) continue;
          canvas.drawOval(
            Rect.fromCenter(
              center: root,
              width: 16 + p * 155,
              height: 6 + p * 33,
            ),
            Paint()
              ..style = PaintingStyle.stroke
              ..strokeWidth = 2 * (1 - p) + .5
              ..color = const Color(0xff6cc4e3).withValues(alpha: .7 * (1 - p)),
          );
        }
        for (var i = 0; i < 22; i++) {
          final a = 2 * math.pi * i / 22;
          final spread = splash * (48 + i % 4 * 15);
          final p =
              root +
              Offset(
                math.cos(a) * spread,
                math.sin(a) * spread * .35 -
                    math.sin(splash * math.pi) * (25 + i % 5 * 10),
              );
          canvas.save();
          canvas.translate(p.dx, p.dy);
          canvas.rotate(a + splash);
          canvas.drawOval(
            Rect.fromCenter(center: Offset.zero, width: 4, height: 8),
            Paint()
              ..color =
                  (i % 3 == 0
                          ? const Color(0xffc5f3ff)
                          : const Color(0xff64bddc))
                      .withValues(alpha: 1 - splash),
          );
          canvas.restore();
        }
      }
    } else {
      final burst = math.sin(rewardPhase(t, 0, .32) * math.pi);
      if (burst > 0) {
        canvas.drawRRect(
          RRect.fromRectAndRadius(gauge, const Radius.circular(8)),
          Paint()
            ..color = const Color(0xffe5db79).withValues(alpha: burst * .65),
        );
      }
      for (var i = 0; i < 18; i++) {
        final birth = .1 + i * .009;
        final p = rewardPhase(t, birth, birth + .4);
        if (p <= 0 || p >= 1) continue;
        final q = Curves.easeInOut.transform(p);
        final source = Offset(
          gauge.left + gauge.width * (i + 1) / 19,
          gauge.center.dy,
        );
        final control = Offset(
          source.dx + (i.isEven ? -55 : 55),
          (source.dy + root.dy) / 2,
        );
        final pos =
            source * ((1 - q) * (1 - q)) +
            control * (2 * (1 - q) * q) +
            root * (q * q);
        final alpha = math.min(1.0, math.min(p * 12, (1 - p) * 9));
        final color =
            (i % 3 == 0 ? const Color(0xffb8d77a) : const Color(0xffebdf78))
                .withValues(alpha: alpha);
        glow(canvas, pos, 13, color.withValues(alpha: alpha * .4));
        dot(canvas, pos, 3.5 + i % 3, color);
        dot(
          canvas,
          pos - const Offset(1, 1.5),
          1.3,
          Colors.white.withValues(alpha: alpha),
        );
      }
    }
    final a = rewardAbsorption(t), light = math.sin(a * math.pi);
    if (light > 0) {
      glow(
        canvas,
        root - const Offset(0, 15),
        65,
        const Color(0xffe7f4a1).withValues(alpha: .45 * light),
      );
      for (var i = 0; i < 7; i++) {
        sparkle(
          canvas,
          root + Offset(math.sin(i * 2.4) * 65, -30 - i * 17 - a * 15),
          4 + i % 3,
          light,
        );
      }
      final label = TextPainter(
        text: TextSpan(
          text: '+$gain%',
          style: TextStyle(
            fontFamily: 'NotoSansKR',
            fontSize: 20,
            fontWeight: FontWeight.w900,
            color:
                (kind == 'water'
                        ? const Color(0xff3185a4)
                        : const Color(0xff708d35))
                    .withValues(alpha: light),
            shadows: const [Shadow(color: Color(0xfffff9e9), blurRadius: 5)],
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      label.paint(canvas, root - Offset(label.width / 2, 130 + a * 22));
    }
  }

  @override
  bool shouldRepaint(_RewardPainter oldDelegate) => true;
}
