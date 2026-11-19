import 'package:flutter/material.dart';
import '../../word_text.dart';

class CommemorativePoster extends StatelessWidget {
  const CommemorativePoster({super.key, required this.mission});
  final Map<String, dynamic> mission;

  @override
  Widget build(BuildContext context) {
    final poster = mission['poster'] as Map;
    final kind = mission['kind'];
    final farmers = kind == 'farmers';
    final ink = farmers ? const Color(0xff315637) : const Color(0xff253b58);
    final accent = farmers ? const Color(0xffc38b2b) : const Color(0xffb34c45);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (kind == 'patriots')
          Image.asset(
            'assets/posters/patriots.png',
            fit: BoxFit.contain,
            semanticLabel: '11월 17일 순국선열의 날, 잊지 않겠습니다.',
          )
        else if (kind == 'student-independence')
          Image.asset(
            'assets/posters/student-independence.png',
            fit: BoxFit.contain,
            semanticLabel: '11월 3일 학생독립운동기념일 함께 기억해요.',
          )
        else
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xfffff5db),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: ink.withValues(alpha: .18)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                WordText(
                  poster['date'] as String,
                  style: TextStyle(
                    color: accent,
                    fontSize: 30,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                WordText(
                  mission['title'] as String,
                  style: TextStyle(
                    color: ink,
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 20),
                Center(
                  child: Image.asset(
                    'assets/posters/farmers.webp',
                    width: 210,
                    height: 210,
                    fit: BoxFit.contain,
                    semanticLabel: '벼 이삭을 안고 웃는 농업인',
                  ),
                ),
                const SizedBox(height: 18),
                WordText(
                  poster['eyebrow'] as String,
                  style: TextStyle(
                    color: accent,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 8),
                WordText(
                  poster['headline'] as String,
                  style: TextStyle(
                    color: ink,
                    fontSize: 23,
                    height: 1.4,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: 22),
        for (final section in poster['sections'] as List) ...[
          WordText(
            section['title'] as String,
            style: TextStyle(
              color: ink,
              fontSize: 17,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          WordText(
            section['body'] as String,
            style: const TextStyle(height: 1.7),
          ),
          const SizedBox(height: 18),
        ],
        const WordText(
          '위 내용에서 10문제가 나와요.\n정답 1개당 성장 +10% · 이번 미션에서 한 번 참여해요.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, height: 1.7),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: () => Navigator.pop(context, true),
          icon: const Icon(Icons.quiz_outlined),
          label: const WordText('문제 풀기'),
        ),
      ],
    );
  }
}
