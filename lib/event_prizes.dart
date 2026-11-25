import 'package:flutter/material.dart';

import 'image_assets.dart';

const _cream = Color(0xfffff9e9);
const _ink = Color(0xff284b39);
const _muted = Color(0xff4e6650);
const _green = Color(0xff326749);
const _hero = Color(0xffe1edc4);
const _tile = Color(0xffedf0d7);
const _gold = Color(0xfffff0cc);
const _goldBorder = Color(0xffe9d7a6);
const _white = Color(0xfffffef7);

const _prizes = [
  (count: 5, name: '뻥튀기', art: 'puffed-rice', color: Color(0xfffff0c8)),
  (count: 10, name: '젤리', art: 'jelly', color: Color(0xfff0e7f7)),
  (count: 15, name: '빼빼로', art: 'pepero', color: Color(0xfff9e4d9)),
];

class EventPrizeButton extends StatelessWidget {
  const EventPrizeButton({super.key, required this.enabled});

  final bool enabled;

  @override
  Widget build(BuildContext context) => TextButton.icon(
    style: TextButton.styleFrom(
      minimumSize: const Size(104, 48),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      shape: const StadiumBorder(),
      side: const BorderSide(color: Color(0xffd3b36d)),
      backgroundColor: _gold,
      disabledBackgroundColor: _gold.withValues(alpha: .55),
      foregroundColor: _ink,
      textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
    ),
    onPressed: enabled
        ? () => showDialog<void>(
            context: context,
            useRootNavigator: false,
            barrierColor: const Color(0x8b17281b),
            builder: (_) => const _EventPrizeDialog(),
          )
        : null,
    icon: const _PrizeArt('prize-button', 19, 19),
    label: const Text('상품'),
  );
}

class _EventPrizeDialog extends StatelessWidget {
  const _EventPrizeDialog();

  @override
  Widget build(BuildContext context) => Dialog(
    backgroundColor: _cream,
    surfaceTintColor: Colors.transparent,
    shadowColor: const Color(0x58152618),
    elevation: 12,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
    clipBehavior: Clip.antiAlias,
    insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
    child: Padding(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 25),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Flexible(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(
                    height: 43,
                    child: Row(
                      children: [
                        _ArtTile(
                          size: 31,
                          radius: 10,
                          color: _tile,
                          child: _PrizeArt('sprout', 12.5, 12.5),
                        ),
                        SizedBox(width: 9),
                        Text(
                          '작물키우기',
                          style: TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  const _PrizeIntro(),
                  const SizedBox(height: 14),
                  const _PickupDetails(),
                  const SizedBox(height: 14),
                  Semantics(
                    header: true,
                    child: const Text(
                      '수확 개수별 상품',
                      style: TextStyle(
                        fontSize: 19,
                        height: 1.3,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -.45,
                      ),
                    ),
                  ),
                  const SizedBox(height: 11),
                  for (final (index, prize) in _prizes.indexed) ...[
                    if (index > 0) const SizedBox(height: 9),
                    _PrizeRow(
                      count: prize.count,
                      name: prize.name,
                      art: prize.art,
                      color: prize.color,
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: () => Navigator.pop(context),
            style: FilledButton.styleFrom(
              minimumSize: const Size(48, 47),
              backgroundColor: _green,
              foregroundColor: _white,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              textStyle: const TextStyle(
                fontSize: 14.5,
                fontWeight: FontWeight.w700,
              ),
            ),
            icon: const _ArtTile(
              size: 27,
              radius: 14,
              color: _hero,
              child: _PrizeArt('back', 21.5, 21.5),
            ),
            label: const Text('내 밭으로'),
          ),
        ],
      ),
    ),
  );
}

class _PrizeIntro extends StatelessWidget {
  const _PrizeIntro();

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(25),
    child: ColoredBox(
      color: _hero,
      child: Stack(
        children: [
          const Positioned(
            top: 12,
            right: 13.5,
            child: _PrizeArt('hero-halo', 118.5, 118.5),
          ),
          const Positioned(
            top: 125,
            right: -34,
            child: _PrizeArt('hero-ground', 194.75, 57.5),
          ),
          const Positioned(
            top: 6.3,
            right: 4.5,
            child: _PrizeArt('sparkles', 128.3, 135.5),
          ),
          Positioned(
            top: 19.75,
            right: 7.25,
            child: Image(
              image: gameImage('characters/drop-celebrate', width: 244),
              width: 122,
              height: 122,
              excludeFromSemantics: true,
            ),
          ),
          const Positioned(
            top: 88.85,
            right: 93.3,
            child: _PrizeArt('gift', 51.15, 55.65),
          ),
          ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 154),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 26, 146, 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Semantics(
                    header: true,
                    child: const Text(
                      '상품',
                      style: TextStyle(
                        fontSize: 32,
                        height: 1.3,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -1.25,
                      ),
                    ),
                  ),
                  const SizedBox(height: 13),
                  const Text(
                    '수확한 작물 수에 따라\n상품을 받을 수 있어요.',
                    style: TextStyle(
                      color: _muted,
                      fontSize: 13.5,
                      height: 1.6,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class _PickupDetails extends StatelessWidget {
  const _PickupDetails();

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(vertical: 12),
    decoration: BoxDecoration(
      color: _gold,
      border: Border.all(color: _goldBorder),
      borderRadius: BorderRadius.circular(18),
    ),
    child: const IntrinsicHeight(
      child: Row(
        children: [
          Expanded(child: _PickupDetail('calendar', '받는 날', '11월 30일 점심시간')),
          VerticalDivider(width: 1, thickness: 1, color: _goldBorder),
          Expanded(child: _PickupDetail('place', '받는 곳', '중앙현관')),
        ],
      ),
    ),
  );
}

class _PickupDetail extends StatelessWidget {
  const _PickupDetail(this.icon, this.label, this.value);

  final String icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(left: 14, right: 8),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            SizedBox(
              width: 18,
              height: 18,
              child: Center(
                child: _PrizeArt(icon, icon == 'calendar' ? 14 : 12.5, 14.5),
              ),
            ),
            const SizedBox(width: 4),
            Flexible(
              child: Text(
                label,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: Color(0xff695122),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          value,
          style: const TextStyle(
            fontSize: 14.25,
            fontWeight: FontWeight.w700,
            letterSpacing: -.25,
          ),
        ),
      ],
    ),
  );
}

class _PrizeRow extends StatelessWidget {
  const _PrizeRow({
    required this.count,
    required this.name,
    required this.art,
    required this.color,
  });

  final int count;
  final String name;
  final String art;
  final Color color;

  @override
  Widget build(BuildContext context) => MergeSemantics(
    child: Container(
      constraints: const BoxConstraints(minHeight: 93),
      padding: const EdgeInsets.fromLTRB(11, 11, 10, 11),
      decoration: BoxDecoration(
        color: _white,
        border: Border.all(color: const Color(0xffd6dfbd)),
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0f355737),
            blurRadius: 4.5,
            offset: Offset(0, 3.5),
          ),
        ],
      ),
      child: Row(
        children: [
          _ArtTile(
            size: 57,
            radius: 16,
            color: _tile,
            child: OverflowBox(
              maxWidth: 64.6,
              maxHeight: 64.6,
              child: Image(
                image: gameImage('crops/rice-harvest', width: 129),
                width: 64.6,
                height: 64.6,
                excludeFromSemantics: true,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(
                    '×$count',
                    style: const TextStyle(
                      fontSize: 25,
                      height: 1.35,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -.55,
                    ),
                  ),
                ),
                const Text(
                  '작물',
                  style: TextStyle(
                    color: _muted,
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          const _ArtTile(
            size: 29,
            radius: 15,
            color: _tile,
            child: _PrizeArt('forward', 11, 8.8),
          ),
          const SizedBox(width: 4.5),
          _ArtTile(
            size: 68,
            radius: 18,
            color: color,
            child: _PrizeArt(art, 64.6, 64.6),
          ),
          const SizedBox(width: 10),
          SizedBox(
            width: 53,
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                name,
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -.5,
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class _ArtTile extends StatelessWidget {
  const _ArtTile({
    required this.size,
    required this.radius,
    required this.color,
    required this.child,
  });

  final double size;
  final double radius;
  final Color color;
  final Widget child;

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(radius),
    child: ColoredBox(
      color: color,
      child: SizedBox.square(
        dimension: size,
        child: Center(child: child),
      ),
    ),
  );
}

class _PrizeArt extends StatelessWidget {
  const _PrizeArt(this.name, this.width, this.height);

  final String name;
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) => Image.asset(
    'assets/event-prizes/$name.png',
    width: width,
    height: height,
    fit: BoxFit.contain,
    excludeFromSemantics: true,
  );
}
