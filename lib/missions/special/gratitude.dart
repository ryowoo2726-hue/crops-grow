import 'package:flutter/material.dart';
import '../../game.dart';

class GratitudeMissionPopup extends StatefulWidget {
  const GratitudeMissionPopup({
    super.key,
    required this.data,
    required this.profile,
    required this.submit,
  });
  final Map<String, dynamic> data;
  final Map profile;
  final Future<Map<String, dynamic>> Function(Map<String, dynamic>) submit;

  @override
  State<GratitudeMissionPopup> createState() => _GratitudeMissionPopupState();
}

class _GratitudeMissionPopupState extends State<GratitudeMissionPopup> {
  final message = TextEditingController();
  late int? grade = widget.profile['grade'] as int?;
  int? classNo, number;
  bool sending = false;
  String? error;

  @override
  void dispose() {
    message.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final classes = widget.data['classes'] as List;
    final submitted = widget.data['submitted'] as List;
    final remaining = widget.data['remaining'] as int;
    final groups = classes.where((group) => group['grade'] == grade);
    final numbers =
        groups
                .where((group) => group['classNo'] == classNo)
                .firstOrNull?['numbers']
            as List? ??
        [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          '감사의 말 전하기',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 10),
        const Text(
          '고마운 학생에게 10글자 이상 작성해요.\n한 명당 성장도 +25% · 서로 다른 4명까지',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 10),
        Text(
          '${submitted.length} / 4명 작성 완료',
          textAlign: TextAlign.center,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        if (submitted.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              submitted
                  .map(
                    (student) =>
                        '${student['grade']}학년 ${student['classNo']}반 ${student['number']}번',
                  )
                  .join(' · '),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12),
            ),
          ),
        if (remaining > 0) ...[
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<int>(
                  initialValue: grade,
                  decoration: const InputDecoration(labelText: '학년'),
                  items: classes
                      .map((group) => group['grade'] as int)
                      .toSet()
                      .map(
                        (value) => DropdownMenuItem(
                          value: value,
                          child: Text('$value학년'),
                        ),
                      )
                      .toList(),
                  onChanged: sending
                      ? null
                      : (value) => setState(() {
                          grade = value;
                          classNo = null;
                          number = null;
                        }),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: DropdownButtonFormField<int>(
                  key: ValueKey('class-$grade'),
                  initialValue: classNo,
                  decoration: const InputDecoration(labelText: '반'),
                  items: groups
                      .map(
                        (group) => DropdownMenuItem<int>(
                          value: group['classNo'] as int,
                          child: Text('${group['classNo']}반'),
                        ),
                      )
                      .toList(),
                  onChanged: sending || grade == null
                      ? null
                      : (value) => setState(() {
                          classNo = value;
                          number = null;
                        }),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: DropdownButtonFormField<int>(
                  key: ValueKey('number-$grade-$classNo'),
                  initialValue: number,
                  decoration: const InputDecoration(labelText: '번호'),
                  items: numbers.map((value) {
                    final isSelf =
                        widget.profile['role'] != 'teacher' &&
                        widget.profile['grade'] == grade &&
                        widget.profile['classNo'] == classNo &&
                        widget.profile['number'] == value;
                    final alreadySubmitted = submitted.any(
                      (student) =>
                          student['grade'] == grade &&
                          student['classNo'] == classNo &&
                          student['number'] == value,
                    );
                    return DropdownMenuItem<int>(
                      value: value as int,
                      enabled: !isSelf && !alreadySubmitted,
                      child: Text('$value번'),
                    );
                  }).toList(),
                  onChanged: sending || classNo == null
                      ? null
                      : (value) => setState(() => number = value),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            controller: message,
            enabled: !sending,
            minLines: 3,
            maxLines: 5,
            maxLength: 500,
            onChanged: (_) => setState(() => error = null),
            decoration: const InputDecoration(
              labelText: '감사의 말',
              hintText: '어떤 일이 고마웠는지 적어 주세요.',
              border: OutlineInputBorder(),
            ),
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(
                error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          FilledButton(
            onPressed:
                sending ||
                    number == null ||
                    message.text.trim().characters.length < 10
                ? null
                : () async {
                    setState(() {
                      sending = true;
                      error = null;
                    });
                    try {
                      final result = await widget.submit({
                        'missionId': widget.data['mission']['id'],
                        'recipient': {
                          'grade': grade,
                          'classNo': classNo,
                          'number': number,
                        },
                        'message': message.text.trim(),
                      });
                      if (context.mounted) Navigator.pop(context, result);
                    } catch (failure) {
                      if (mounted) setState(() => error = failure.toString());
                    } finally {
                      if (mounted) setState(() => sending = false);
                    }
                  },
            child: Text(sending ? '저장 중…' : '검토받기 +25%'),
          ),
          const SizedBox(height: 10),
          const Text(
            '선생님이 내용을 확인하고 전달해요.\n성장도가 가득 차면 남은 영양분은 다음 작물에 적용돼요.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12),
          ),
        ] else ...[
          const SizedBox(height: 18),
          const Text('이번 미션에서 4명에게 감사의 말을 작성했어요.', textAlign: TextAlign.center),
        ],
      ],
    );
  }
}

class MessagesPopup extends StatefulWidget {
  const MessagesPopup({
    super.key,
    required this.initialData,
    required this.load,
  });
  final Map<String, dynamic> initialData;
  final Future<Map<String, dynamic>> Function(int) load;
  @override
  State<MessagesPopup> createState() => _MessagesPopupState();
}

class _MessagesPopupState extends State<MessagesPopup> {
  late Map<String, dynamic> data = widget.initialData;
  bool loading = false;
  String? error;

  Future<void> page(int target) async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final result = await widget.load(target);
      if (mounted) setState(() => data = result);
    } catch (failure) {
      if (mounted) setState(() => error = failure.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      if ((data['items'] as List).isEmpty)
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 24),
          child: Text('아직 도착한 메시지가 없어요.', textAlign: TextAlign.center),
        ),
      for (final item in data['items'] as List)
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  profileDisplayLabel(item['sender']),
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                Text(item['body'] as String),
              ],
            ),
          ),
        ),
      if (error != null)
        Text(
          error!,
          style: TextStyle(color: Theme.of(context).colorScheme.error),
        ),
      if (data['pages'] > 1)
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            IconButton(
              tooltip: '이전 메시지',
              onPressed: loading || data['page'] == 0
                  ? null
                  : () => page(data['page'] - 1),
              icon: const Icon(Icons.chevron_left),
            ),
            Text('${data['page'] + 1} / ${data['pages']}'),
            IconButton(
              tooltip: '다음 메시지',
              onPressed: loading || data['page'] + 1 == data['pages']
                  ? null
                  : () => page(data['page'] + 1),
              icon: const Icon(Icons.chevron_right),
            ),
          ],
        ),
    ],
  );
}
