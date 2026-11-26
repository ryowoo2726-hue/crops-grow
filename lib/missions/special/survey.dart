import 'package:flutter/material.dart';
import '../../word_text.dart';

typedef SurveyQuestion = ({String question, List<String> choices});

class SurveyMissionPopup extends StatefulWidget {
  const SurveyMissionPopup({
    super.key,
    required this.description,
    required this.questions,
    required this.completed,
    required this.submit,
  });

  final String description;
  final List<SurveyQuestion> questions;
  final bool completed;
  final Future<void> Function(List<int>) submit;

  @override
  State<SurveyMissionPopup> createState() => _SurveyMissionPopupState();
}

class _SurveyMissionPopupState extends State<SurveyMissionPopup> {
  late final answers = List<int?>.filled(widget.questions.length, null);
  late bool completed = widget.completed;
  int? index;
  bool saving = false;
  String? error;

  void goTo(int? questionIndex) {
    setState(() {
      index = questionIndex;
      error = null;
    });
    Scrollable.maybeOf(context)?.position.jumpTo(0);
  }

  Future<void> save() async {
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await widget.submit(answers.cast<int>().toList());
      if (mounted) setState(() => completed = true);
    } catch (failure) {
      if (mounted) setState(() => error = failure.toString());
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final current = index;
    if (completed || current == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Icon(
            completed ? Icons.check_circle_outline : Icons.assignment_outlined,
            size: 54,
            color: colors.primary,
          ),
          const SizedBox(height: 12),
          WordText(
            completed ? '설문 참여 완료!' : '작물 키우기 설문',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          WordText(
            completed
                ? '응답을 저장하고 성장 +100% 보상을 받았어요. 남은 영양분은 다음 작물을 심을 때 받아요.'
                : widget.description,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: completed ? () => Navigator.pop(context) : () => goTo(0),
            child: WordText(completed ? '내 밭으로' : '설문 시작'),
          ),
        ],
      );
    }

    final question = widget.questions[current];
    final count = answers.whereType<int>().length;
    final total = widget.questions.length;
    final last = current == total - 1;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        WordText('문항 ${current + 1} / $total · $count개 응답'),
        const SizedBox(height: 8),
        LinearProgressIndicator(
          value: count / total,
          minHeight: 6,
          semanticsLabel: '설문 응답 진행률',
        ),
        const SizedBox(height: 14),
        WordText(
          question.question,
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        RadioGroup<int>(
          groupValue: answers[current],
          onChanged: (value) {
            if (!saving) setState(() => answers[current] = value);
          },
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = 0; i < question.choices.length; i++)
                RadioListTile<int>(
                  value: i,
                  enabled: !saving,
                  title: WordText(question.choices[i]),
                  tileColor: answers[current] == i
                      ? colors.primaryContainer
                      : null,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                ),
            ],
          ),
        ),
        if (error != null)
          Semantics(
            liveRegion: true,
            child: WordText(error!, style: TextStyle(color: colors.error)),
          ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: saving
                    ? null
                    : () => goTo(current == 0 ? null : current - 1),
                child: const WordText('이전'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 2,
              child: FilledButton(
                onPressed: saving || answers[current] == null
                    ? null
                    : last
                    ? save
                    : () => goTo(current + 1),
                child: WordText(
                  saving
                      ? '저장 중…'
                      : last
                      ? '설문 제출'
                      : '다음',
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
