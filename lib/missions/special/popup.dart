import 'package:flutter/material.dart';

// 특별 미션의 배치·색상·완료 조건은 이 파일에서 수정합니다.
class SpecialMissionPopup extends StatefulWidget {
  const SpecialMissionPopup({
    super.key,
    required this.mission,
    required this.canComplete,
  });
  final Map<String, String>? mission;
  final bool canComplete;
  @override
  State<SpecialMissionPopup> createState() => _SpecialMissionPopupState();
}

class _SpecialMissionPopupState extends State<SpecialMissionPopup> {
  bool checked = false;
  @override
  Widget build(BuildContext context) {
    final mission = widget.mission;
    if (mission == null)
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Text('특별 미션을 준비하고 있어요.', textAlign: TextAlign.center),
      );
    return Column(
      children: [
        Text(
          mission['title']!,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 16),
        Text(mission['description']!, textAlign: TextAlign.center),
        const SizedBox(height: 18),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('미션을 완료했어요'),
          value: checked,
          onChanged: widget.canComplete
              ? (value) => setState(() => checked = value ?? false)
              : null,
        ),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: checked && widget.canComplete
                ? () => Navigator.pop(context, true)
                : null,
            child: const Text('완료하기'),
          ),
        ),
        if (!widget.canComplete)
          const Padding(
            padding: EdgeInsets.only(top: 10),
            child: Text('지금은 성장 보상을 받을 수 없어요.', style: TextStyle(fontSize: 12)),
          ),
      ],
    );
  }
}
