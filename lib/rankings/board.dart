import 'package:flutter/material.dart';

class RankingsBoard extends StatelessWidget {
  const RankingsBoard({
    super.key,
    required this.scope,
    required this.data,
    required this.loading,
    required this.error,
    required this.onScopeChanged,
    required this.onPageChanged,
    required this.onRefresh,
  });

  final String scope;
  final Map<String, dynamic>? data;
  final bool loading;
  final String? error;
  final ValueChanged<String> onScopeChanged;
  final ValueChanged<int> onPageChanged;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final summary = data?['summary'] as Map?;
    final items = data?['items'] as List? ?? [];
    final page = data?['page'] as int? ?? 0;
    final pages = data?['pages'] as int? ?? 1;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text(
                '수확 랭킹',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
              ),
            ),
            IconButton(
              tooltip: '랭킹 새로고침',
              onPressed: loading ? null : onRefresh,
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        const SizedBox(height: 8),
        // Only the list below scrolls; both personal summaries stay visible.
        Row(
          children: [
            for (final item in [
              ('individual', '내 개인 순위'),
              ('class', '우리 반 순위'),
            ])
              Expanded(
                child: Padding(
                  padding: EdgeInsets.only(
                    right: item.$1 == 'individual' ? 8 : 0,
                  ),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      vertical: 12,
                      horizontal: 10,
                    ),
                    decoration: BoxDecoration(
                      color: colors.surface,
                      border: Border.all(
                        color: colors.primary.withValues(alpha: .35),
                      ),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Column(
                      children: [
                        Text(
                          item.$2,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        Text(
                          summary?[item.$1] == null
                              ? '—'
                              : '${summary![item.$1]['rank']}위',
                          style: TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.w900,
                            color: colors.primary,
                          ),
                        ),
                        Text(
                          summary?[item.$1] == null
                              ? '조회 중'
                              : '수확 ${summary![item.$1]['harvestCount']}개',
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 16),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(
              value: 'individual',
              icon: Icon(Icons.person_outline),
              label: Text('개인 랭킹'),
            ),
            ButtonSegment(
              value: 'class',
              icon: Icon(Icons.groups_outlined),
              label: Text('반 랭킹'),
            ),
          ],
          selected: {scope},
          onSelectionChanged: (value) => onScopeChanged(value.single),
        ),
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 10),
          child: Text(
            '누적 수확 개수 기준 · 동점은 공동 순위',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12),
          ),
        ),
        SizedBox(
          height: 3,
          child: loading ? const LinearProgressIndicator() : null,
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(
              error!,
              textAlign: TextAlign.center,
              style: TextStyle(color: colors.error),
            ),
          ),
        Expanded(
          child: Container(
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(18),
            ),
            clipBehavior: Clip.antiAlias,
            child: items.isEmpty
                ? Center(
                    child: Text(loading ? '랭킹을 불러오고 있어요.' : '아직 참여한 기록이 없어요.'),
                  )
                : ListView.separated(
                    key: ValueKey('$scope-$page'),
                    padding: const EdgeInsets.all(8),
                    itemCount: items.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 6),
                    itemBuilder: (context, index) {
                      final row = items[index] as Map;
                      final isSelf = row['isSelf'] == true;
                      final label = scope == 'individual'
                          ? '${row['grade']}학년 ${row['classNo']}반 ${row['number']}번'
                          : '${row['grade']}학년 ${row['classNo']}반';
                      return Container(
                        padding: const EdgeInsets.symmetric(
                          vertical: 14,
                          horizontal: 10,
                        ),
                        decoration: BoxDecoration(
                          color: isSelf
                              ? colors.primaryContainer
                              : colors.surfaceContainerLow,
                          borderRadius: BorderRadius.circular(12),
                          border: isSelf
                              ? Border.all(color: colors.primary)
                              : null,
                        ),
                        child: Row(
                          children: [
                            SizedBox(
                              width: 42,
                              child: Text(
                                '${row['rank']}위',
                                style: TextStyle(
                                  fontWeight: FontWeight.w900,
                                  color: colors.primary,
                                ),
                              ),
                            ),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    label,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  if (isSelf)
                                    Text(
                                      scope == 'individual' ? '내 기록' : '우리 반',
                                      style: const TextStyle(fontSize: 12),
                                    ),
                                ],
                              ),
                            ),
                            Text(
                              '${row['harvestCount']}개',
                              style: const TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
          ),
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            IconButton(
              tooltip: '이전 랭킹 페이지',
              onPressed: !loading && page > 0
                  ? () => onPageChanged(page - 1)
                  : null,
              icon: const Icon(Icons.chevron_left),
            ),
            Text('${page + 1} / $pages'),
            IconButton(
              tooltip: '다음 랭킹 페이지',
              onPressed: !loading && page < pages - 1
                  ? () => onPageChanged(page + 1)
                  : null,
              icon: const Icon(Icons.chevron_right),
            ),
          ],
        ),
      ],
    );
  }
}
