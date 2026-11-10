import 'package:flutter/material.dart';
import 'content.dart';

// 퀴즈의 배치·색상·정답 확인 흐름은 이 파일에서 수정합니다.
class QuizMissionPopup extends StatefulWidget {
  const QuizMissionPopup({
    super.key,
    required this.questions,
    required this.canComplete,
    this.checkAnswer,
  });
  final List<QuizQuestion> questions;
  final bool canComplete;
  final Future<QuizFeedback> Function(QuizQuestion question, int answer)?
  checkAnswer;
  @override
  State<QuizMissionPopup> createState() => _QuizMissionPopupState();
}

class _QuizMissionPopupState extends State<QuizMissionPopup> {
  int current = 0;
  int? selected;
  bool correct = false;
  String? feedback;
  bool checking = false;
  @override
  Widget build(BuildContext context) {
    if (widget.questions.isEmpty)
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Text('이번 주 퀴즈를 준비하고 있어요.', textAlign: TextAlign.center),
      );
    if (!widget.questions.every((q) => q.isValid))
      return const Text('퀴즈 내용을 확인하고 있어요. 잠시 후 다시 열어 주세요.');
    final question = widget.questions[current];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
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
              onPressed: correct || checking
                  ? null
                  : () => setState(() {
                      selected = i;
                      feedback = null;
                    }),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                backgroundColor: selected == i
                    ? Theme.of(context).colorScheme.primaryContainer
                    : null,
              ),
              child: Text(question.choices[i], textAlign: TextAlign.center),
            ),
          ),
        if (feedback != null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Text(feedback!, textAlign: TextAlign.center),
          ),
        FilledButton(
          onPressed:
              checking ||
                  selected == null ||
                  correct &&
                      current == widget.questions.length - 1 &&
                      !widget.canComplete
              ? null
              : () async {
                  if (correct) {
                    if (current == widget.questions.length - 1) {
                      Navigator.pop(context, true);
                      return;
                    }
                    setState(() {
                      current++;
                      selected = null;
                      correct = false;
                      feedback = null;
                    });
                  } else {
                    setState(() => checking = true);
                    try {
                      final result = widget.checkAnswer == null
                          ? QuizFeedback(
                              selected == question.correctIndex,
                              question.explanation,
                            )
                          : await widget.checkAnswer!(question, selected!);
                      if (!mounted) return;
                      setState(() {
                        correct = result.correct;
                        feedback = correct
                            ? '정답이에요!${result.explanation.isEmpty ? '' : '\n${result.explanation}'}'
                            : '다시 생각해 보세요.';
                      });
                    } catch (error) {
                      if (mounted) setState(() => feedback = error.toString());
                    } finally {
                      if (mounted) setState(() => checking = false);
                    }
                  }
                },
          child: Text(
            checking
                ? '확인 중…'
                : !correct
                ? '정답 확인'
                : current == widget.questions.length - 1
                ? '미션 완료'
                : '다음 문제',
          ),
        ),
        if (!widget.canComplete)
          const Padding(
            padding: EdgeInsets.only(top: 10),
            child: Text(
              '지금은 성장 보상을 받을 수 없어요.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12),
            ),
          ),
      ],
    );
  }
}
