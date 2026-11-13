import 'package:flutter/material.dart';
import 'content.dart';

class QuizSetPopup extends StatefulWidget {
  const QuizSetPopup({
    super.key,
    required this.questions,
    required this.submit,
    this.result,
    this.claimed = false,
  });

  final List<QuizQuestion> questions;
  final Future<Map<String, dynamic>> Function(int growth) submit;
  final Map<String, dynamic>? result;
  final bool claimed;

  @override
  State<QuizSetPopup> createState() => _QuizSetPopupState();
}

class _QuizSetPopupState extends State<QuizSetPopup> {
  int current = 0;
  late final answers = List<int?>.filled(widget.questions.length, null);
  Map<String, dynamic>? result;
  bool submitting = false;
  String? error;

  @override
  void initState() {
    super.initState();
    result = widget.result;
  }

  Future<void> finish() async {
    setState(() {
      submitting = true;
      error = null;
    });
    try {
      final review = List.generate(
        widget.questions.length,
        (i) => {
          'selected': answers[i],
          'correct': answers[i] == widget.questions[i].correctIndex,
        },
      );
      final growth =
          review.where((answer) => answer['correct'] == true).length * 10;
      final response = await widget.submit(growth);
      if (mounted) setState(() => result = {...response, 'answers': review});
    } catch (failure) {
      if (mounted) setState(() => error = failure.toString());
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.questions.length != 10 ||
        widget.questions.any((q) => !q.isValid || q.correctIndex == null)) {
      return const Text('퀴즈 내용을 확인하고 있어요. 잠시 후 다시 열어 주세요.');
    }
    if (result != null) {
      final review = result!['answers'] as List?;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '10문제 중 ${result!['correctCount']}문제 정답',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          Text(
            widget.claimed
                ? '오늘의 퀴즈를 완료했어요.'
                : '닫으면 영양분으로 +${result!['growth']}% 성장해요.',
            textAlign: TextAlign.center,
          ),
          if (!widget.claimed && (result!['growth'] as num) > 0)
            const Text('작물은 최대 100%까지 자라요.', textAlign: TextAlign.center),
          const SizedBox(height: 16),
          for (var i = 0; i < widget.questions.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${i + 1}. ${widget.questions[i].question}',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  if (review != null) ...[
                    Text(review[i]['correct'] == true ? '정답' : '오답'),
                    Text(
                      '내 답 · ${widget.questions[i].choices[review[i]['selected'] as int]}',
                    ),
                  ],
                  Text(
                    '정답 · ${widget.questions[i].choices[widget.questions[i].correctIndex!]}',
                  ),
                  if (widget.questions[i].explanation.isNotEmpty)
                    Text(widget.questions[i].explanation),
                ],
              ),
            ),
          FilledButton(
            onPressed: () => Navigator.pop(context),
            child: Text(widget.claimed ? '닫기' : '닫고 영양분 받기'),
          ),
        ],
      );
    }
    final question = widget.questions[current];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          '${current + 1} / ${widget.questions.length}',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 10),
        Text(
          question.question,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 18),
        for (var i = 0; i < question.choices.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: OutlinedButton(
              onPressed: submitting
                  ? null
                  : () => setState(() => answers[current] = i),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                backgroundColor: answers[current] == i
                    ? Theme.of(context).colorScheme.primaryContainer
                    : null,
              ),
              child: Text(question.choices[i], textAlign: TextAlign.center),
            ),
          ),
        if (error != null) Text(error!, textAlign: TextAlign.center),
        if (current > 0)
          TextButton(
            onPressed: submitting ? null : () => setState(() => current--),
            child: const Text('이전 문제'),
          ),
        FilledButton(
          onPressed: submitting || answers[current] == null
              ? null
              : () {
                  if (current == widget.questions.length - 1) {
                    finish();
                  } else {
                    setState(() => current++);
                  }
                },
          child: Text(
            submitting
                ? '채점 중…'
                : current == widget.questions.length - 1
                ? '채점하고 정답 보기'
                : '다음 문제',
          ),
        ),
        const SizedBox(height: 8),
        const Text('과목별 하루 10문제 · 정답 하나당 성장 +10%', textAlign: TextAlign.center),
      ],
    );
  }
}
