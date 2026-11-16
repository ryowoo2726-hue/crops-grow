import 'package:flutter/material.dart';
import 'content.dart';
import 'status_stamp.dart';

class QuizSetPopup extends StatefulWidget {
  const QuizSetPopup({
    super.key,
    required this.questions,
    this.submit,
    this.submitAnswers,
    this.result,
    this.claimed = false,
  }) : assert((submit == null) != (submitAnswers == null));

  final List<QuizQuestion> questions;
  final Future<Map<String, dynamic>> Function(int growth)? submit;
  final Future<Map<String, dynamic>> Function(List<int> answers)? submitAnswers;
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
      final response = widget.submitAnswers != null
          ? await widget.submitAnswers!(answers.cast<int>())
          : await widget.submit!(growth);
      if (mounted) {
        setState(
          () => result = widget.submitAnswers != null
              ? response
              : {...response, 'answers': review},
        );
      }
    } catch (failure) {
      if (mounted) setState(() => error = failure.toString());
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.questions.length != 10 ||
        widget.questions.any(
          (q) =>
              !q.isValid ||
              (widget.submitAnswers == null && q.correctIndex == null),
        )) {
      return const Text('퀴즈 내용을 확인하고 있어요. 잠시 후 다시 열어 주세요.');
    }
    if (result != null) {
      final review = result!['answers'] as List?;
      final questions = result!['questions'] == null
          ? widget.questions
          : parseQuizQuestions(result!['questions']);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Center(child: QuizStatusStamp(size: 80)),
          const SizedBox(height: 12),
          Text(
            '10문제 중 ${result!['correctCount']}문제 정답',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          Text(
            widget.submitAnswers != null
                ? '성장 보상 +${result!['growth']}%를 저장했어요.\n남은 영양분은 다음 작물을 심을 때 이어 받아요.'
                : widget.claimed
                ? '오늘의 퀴즈를 완료했어요.'
                : '닫으면 영양분으로 +${result!['growth']}% 성장해요.',
            textAlign: TextAlign.center,
          ),
          if (widget.submitAnswers == null &&
              !widget.claimed &&
              (result!['growth'] as num) > 0)
            const Text('작물은 최대 100%까지 자라요.', textAlign: TextAlign.center),
          const SizedBox(height: 16),
          for (var i = 0; i < questions.length; i++)
            _AnswerCard(
              question: questions[i],
              number: i + 1,
              answer: review?[i] as Map?,
            ),
          FilledButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              widget.claimed || widget.submitAnswers != null
                  ? '닫기'
                  : '닫고 영양분 받기',
            ),
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
        Text(
          widget.submitAnswers != null
              ? '이번 특별 미션 1회 · 정답 하나당 성장 +10%\n제출 후에는 답을 바꿀 수 없어요.'
              : '과목별 하루 10문제 · 정답 하나당 성장 +10%',
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

class _AnswerCard extends StatelessWidget {
  const _AnswerCard({
    required this.question,
    required this.number,
    required this.answer,
  });
  final QuizQuestion question;
  final int number;
  final Map? answer;

  @override
  Widget build(BuildContext context) {
    final correct = answer?['correct'] as bool?;
    final color = correct == null
        ? const Color(0xff526254)
        : correct
        ? const Color(0xff237245)
        : const Color(0xffb3261e);
    return Container(
      key: ValueKey('quiz-answer-$number'),
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .07),
        border: Border.all(color: color.withValues(alpha: .65), width: 1.5),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                correct == null
                    ? Icons.menu_book_outlined
                    : correct
                    ? Icons.check_circle
                    : Icons.cancel,
                color: color,
                size: 22,
              ),
              const SizedBox(width: 6),
              Text(
                correct == null
                    ? '정답 해설'
                    : correct
                    ? '정답'
                    : '오답',
                style: TextStyle(color: color, fontWeight: FontWeight.w800),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            '$number. ${question.question}',
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          if (answer != null)
            Text(
              '내 답 · ${question.choices[answer!['selected'] as int]}',
              style: TextStyle(color: color, fontWeight: FontWeight.w700),
            ),
          Text(
            '정답 · ${question.choices[question.correctIndex!]}',
            style: const TextStyle(
              color: Color(0xff237245),
              fontWeight: FontWeight.w700,
            ),
          ),
          if (question.explanation.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(question.explanation),
          ],
        ],
      ),
    );
  }
}
