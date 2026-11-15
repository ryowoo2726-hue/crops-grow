import 'package:flutter/material.dart';

class QuizStatusStamp extends StatelessWidget {
  const QuizStatusStamp({super.key, this.size = 68});
  final double size;

  @override
  Widget build(BuildContext context) => Semantics(
    label: '10문제 풀이 완료',
    excludeSemantics: true,
    child: Transform.rotate(
      angle: -.12,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: const Color(0xffedf6e8),
          border: Border.all(color: const Color(0xff26734a), width: 3),
        ),
        padding: const EdgeInsets.all(3),
        child: DecoratedBox(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: const Color(0xff26734a)),
          ),
          child: const Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.check_rounded, color: Color(0xff26734a), size: 17),
              Text(
                '완료',
                style: TextStyle(
                  color: Color(0xff26734a),
                  fontSize: 14,
                  fontWeight: FontWeight.w900,
                  height: 1.2,
                ),
              ),
              Text(
                '10 / 10',
                style: TextStyle(
                  color: Color(0xff26734a),
                  fontSize: 9,
                  height: 1.2,
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
