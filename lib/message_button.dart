import 'package:flutter/material.dart';

class MessageButton extends StatelessWidget {
  const MessageButton({
    super.key,
    required this.unreadCount,
    required this.onPressed,
  });
  final int unreadCount;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => Semantics(
    label: unreadCount > 0 ? '메시지, 안 읽은 메시지 $unreadCount개' : '메시지',
    button: true,
    enabled: onPressed != null,
    onTap: onPressed,
    child: ExcludeSemantics(
      child: TextButton.icon(
        onPressed: onPressed,
        style: TextButton.styleFrom(
          foregroundColor: const Color(0xff284b39),
          backgroundColor: unreadCount > 0 ? const Color(0xffffedc2) : null,
          side: BorderSide(
            color: unreadCount > 0
                ? const Color(0xffbd7c13)
                : Colors.transparent,
            width: 2,
          ),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        ),
        icon: const Icon(Icons.chat_bubble_outline, size: 19),
        label: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('메시지'),
            if (unreadCount > 0) ...[
              const SizedBox(width: 7),
              Container(
                key: const ValueKey('unread-message-count'),
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: const BoxDecoration(
                  color: Color(0xffad6811),
                  borderRadius: BorderRadius.all(Radius.circular(12)),
                ),
                child: Text(
                  '$unreadCount',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    ),
  );
}
