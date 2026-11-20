import 'dart:async';
import 'package:flutter/material.dart';
import '../../word_text.dart';
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

class _GratitudeMissionPopupState extends State<GratitudeMissionPopup>
    with WidgetsBindingObserver {
  final message = TextEditingController();
  final messageFocus = FocusNode();
  final messageFieldKey = GlobalKey();
  final teacherName = TextEditingController();
  final teacherFocus = FocusNode();
  final teacherFieldKey = GlobalKey();
  Timer? revealTimer;
  String recipientRole = 'student';
  late int? grade = widget.profile['grade'] as int?;
  int? classNo, number;
  bool sending = false;
  String? error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    messageFocus.addListener(revealMessage);
    teacherFocus.addListener(revealMessage);
  }

  @override
  void didChangeMetrics() => revealMessage();

  void revealMessage() {
    final focus = teacherFocus.hasFocus ? teacherFocus : messageFocus;
    final fieldKey = teacherFocus.hasFocus ? teacherFieldKey : messageFieldKey;
    if (!focus.hasFocus) return;
    void reveal() {
      if (!mounted || !focus.hasFocus) return;
      final fieldContext = fieldKey.currentContext;
      if (fieldContext != null) {
        Scrollable.ensureVisible(
          fieldContext,
          alignment: .5,
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
        );
      }
    }

    WidgetsBinding.instance.addPostFrameCallback((_) => reveal());
    // Dialog의 키보드 여백 애니메이션이 끝난 뒤 입력칸 위치를 다시 맞춥니다.
    revealTimer?.cancel();
    revealTimer = Timer(const Duration(milliseconds: 220), reveal);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    revealTimer?.cancel();
    messageFocus.removeListener(revealMessage);
    messageFocus.dispose();
    message.dispose();
    teacherFocus.removeListener(revealMessage);
    teacherFocus.dispose();
    teacherName.dispose();
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
        const WordText(
          '감사의 말 전하기',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 10),
        const WordText(
          '고마운 학생이나 선생님에게 10글자 이상 작성해요.\n한 명당 성장도 +25% · 서로 다른 4명까지',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 10),
        WordText(
          '${submitted.length} / 4명 작성 완료',
          textAlign: TextAlign.center,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        if (submitted.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: WordText(
              submitted
                  .map(
                    (recipient) => recipient['role'] == 'teacher'
                        ? '${recipient['name']} 선생님'
                        : '${recipient['grade']}학년 ${recipient['classNo']}반 ${recipient['number']}번',
                  )
                  .join(' · '),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12),
            ),
          ),
        if (remaining > 0) ...[
          const SizedBox(height: 18),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'student', label: Text('학생')),
              ButtonSegment(value: 'teacher', label: Text('선생님')),
            ],
            selected: {recipientRole},
            onSelectionChanged: sending
                ? null
                : (selection) => setState(() {
                    recipientRole = selection.first;
                    error = null;
                  }),
          ),
          const SizedBox(height: 16),
          if (recipientRole == 'teacher') ...[
            TextField(
              key: teacherFieldKey,
              controller: teacherName,
              focusNode: teacherFocus,
              enabled: !sending,
              maxLength: 50,
              textInputAction: TextInputAction.next,
              onSubmitted: (_) => messageFocus.requestFocus(),
              onChanged: (_) => setState(() => error = null),
              decoration: const InputDecoration(
                labelText: '받는 선생님 성함',
                hintText: '성함만 입력해 주세요.',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            const WordText(
              '입력한 성함으로 전달해요. 아직 참여하지 않은 선생님에게 쓴 글은 관리자에서 보관해요.',
              style: TextStyle(fontSize: 12, height: 1.6),
            ),
          ] else
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
                            child: WordText('$value학년'),
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
                            child: WordText('${group['classNo']}반'),
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
                        child: WordText('$value번'),
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
            key: messageFieldKey,
            controller: message,
            focusNode: messageFocus,
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
              child: WordText(
                error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          FilledButton(
            onPressed:
                sending ||
                    (recipientRole == 'teacher'
                        ? teacherName.text.trim().isEmpty
                        : number == null) ||
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
                        'recipient': recipientRole == 'teacher'
                            ? {
                                'role': 'teacher',
                                'name': teacherName.text.trim(),
                              }
                            : {
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
            child: WordText(sending ? '저장 중…' : '검토받기 +25%'),
          ),
          const SizedBox(height: 10),
          const WordText(
            '선생님이 내용을 확인하고 전달해요.\n성장도가 가득 차면 남은 영양분은 다음 작물에 적용돼요.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12),
          ),
        ] else ...[
          const SizedBox(height: 18),
          const WordText(
            '이번 미션에서 4명에게 감사의 말을 작성했어요.',
            textAlign: TextAlign.center,
          ),
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
    this.markRead,
    this.deleteMessage,
  });
  final Map<String, dynamic> initialData;
  final Future<Map<String, dynamic>> Function(int) load;
  final Future<void> Function(List<String>)? markRead;
  final Future<Map<String, dynamic>> Function(String id, int page)?
  deleteMessage;
  @override
  State<MessagesPopup> createState() => _MessagesPopupState();
}

class _MessagesPopupState extends State<MessagesPopup> {
  late Map<String, dynamic> data = widget.initialData;
  bool loading = false;
  String? error;
  final expanded = <String>{};
  final read = <String>{};
  final markingRead = <String>{};
  final readErrors = <String>{};

  Future<void> markRead(String id) async {
    if (markingRead.contains(id) || read.contains(id)) return;
    setState(() {
      markingRead.add(id);
      readErrors.remove(id);
    });
    // Opening the inbox does not mark unopened cards as read.
    await WidgetsBinding.instance.endOfFrame;
    if (!mounted) return;
    try {
      await widget.markRead?.call([id]);
      if (mounted) setState(() => read.add(id));
    } catch (_) {
      if (mounted) setState(() => readErrors.add(id));
    } finally {
      if (mounted) setState(() => markingRead.remove(id));
    }
  }

  Future<void> updateInbox(Future<Map<String, dynamic>> Function() load) async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final result = await load();
      if (mounted) setState(() => data = result);
    } catch (failure) {
      if (mounted) setState(() => error = failure.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> confirmDelete(String id) async {
    final deleteMessage = widget.deleteMessage;
    if (deleteMessage == null || loading || markingRead.isNotEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      useRootNavigator: false,
      builder: (context) => AlertDialog(
        title: const WordText('메시지를 삭제할까요?'),
        content: const WordText('내 받은함에서 사라져요.'),
        actions: [
          TextButton(
            autofocus: true,
            onPressed: () => Navigator.pop(context, false),
            child: const Text('취소'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(
              foregroundColor: Theme.of(context).colorScheme.error,
            ),
            child: const Text('삭제하기'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted || loading || markingRead.isNotEmpty) {
      return;
    }
    await updateInbox(() => deleteMessage(id, data['page']));
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      if ((data['items'] as List).isEmpty)
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 24),
          child: WordText('아직 도착한 메시지가 없어요.', textAlign: TextAlign.center),
        ),
      for (final item in data['items'] as List) messageCard(item),
      if (error != null)
        WordText(
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
                  : () => updateInbox(() => widget.load(data['page'] - 1)),
              icon: const Icon(Icons.chevron_left),
            ),
            WordText('${data['page'] + 1} / ${data['pages']}'),
            IconButton(
              tooltip: '다음 메시지',
              onPressed: loading || data['page'] + 1 == data['pages']
                  ? null
                  : () => updateInbox(() => widget.load(data['page'] + 1)),
              icon: const Icon(Icons.chevron_right),
            ),
          ],
        ),
    ],
  );

  Widget messageCard(Map item) {
    final id = item['id'] as String;
    final unread =
        (item['readAt'] == null || item['readAt'] == '') && !read.contains(id);
    return Card(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: unread ? const Color(0xffbd7c13) : const Color(0xffd7ddcf),
          width: unread ? 2 : 1,
        ),
      ),
      child: ExpansionTile(
        key: ValueKey('message-$id'),
        enabled: !loading,
        initiallyExpanded: expanded.contains(id),
        title: WordText(
          profileDisplayLabel(item['sender']),
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        subtitle: WordText(
          unread ? '새 메시지 · 눌러서 읽기' : '읽은 메시지',
          style: TextStyle(
            color: unread ? const Color(0xff9b6207) : const Color(0xff617168),
          ),
        ),
        onExpansionChanged: (open) {
          setState(() => open ? expanded.add(id) : expanded.remove(id));
          if (open && unread) markRead(id);
        },
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          WordText(item['body'] as String, style: const TextStyle(height: 1.7)),
          if (markingRead.contains(id))
            const Padding(
              padding: EdgeInsets.only(top: 10),
              child: WordText('읽음 상태 저장 중…', style: TextStyle(fontSize: 12)),
            ),
          if (readErrors.contains(id))
            TextButton.icon(
              onPressed: () => markRead(id),
              icon: const Icon(Icons.refresh),
              label: const WordText('읽음 상태 다시 저장'),
            ),
          if (widget.deleteMessage != null)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: loading || markingRead.isNotEmpty
                    ? null
                    : () => confirmDelete(id),
                style: TextButton.styleFrom(
                  foregroundColor: Theme.of(context).colorScheme.error,
                ),
                icon: const Icon(Icons.delete_outline, size: 18),
                label: const Text('삭제'),
              ),
            ),
        ],
      ),
    );
  }
}
