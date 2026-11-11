import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../image_assets.dart';

const cropGrowthDuration = Duration(milliseconds: 700);
const cropRootAnchor = Alignment(0, .64); // 원본 PNG의 (50%, 82%).

({int from, int to, double blend, double incomingScale}) growthPose(
  double progress,
) {
  if (!progress.isFinite) throw ArgumentError.value(progress, 'progress');
  final position = progress.clamp(0, 100) / 100 * 3;
  final from = math.min(2, position.floor());
  final fraction = position - from;
  final blend = fraction * fraction * (3 - 2 * fraction);
  return (
    from: from,
    to: from + 1,
    blend: blend,
    incomingScale: .94 + .06 * blend,
  );
}

/// 수정된 원본의 크기·밑동을 유지하며 이웃 단계 두 장만 합성합니다.
class CropGrowth extends StatefulWidget {
  const CropGrowth({
    super.key,
    required this.cropId,
    required this.name,
    required this.progress,
    this.onReady,
  });
  final String cropId;
  final String name;
  final double progress;
  final VoidCallback? onReady;
  @override
  State<CropGrowth> createState() => _CropGrowthState();
}

class _CropGrowthState extends State<CropGrowth> {
  String? preparedCrop;
  int generation = 0;
  bool ready = false, failed = false;
  String stagePath(int index) =>
      imageAssets['crops/${widget.cropId}-stage-0${index + 1}']!;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (preparedCrop != widget.cropId) prepare();
  }

  @override
  void didUpdateWidget(CropGrowth oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.cropId != widget.cropId) prepare();
  }

  Future<void> prepare() async {
    final request = ++generation;
    preparedCrop = widget.cropId;
    setState(() {
      ready = false;
      failed = false;
    });
    Object? failure;
    await Future.wait([
      precacheImage(
        gameImage('crops/${widget.cropId}-harvest', width: 512),
        context,
        onError: (_, _) {},
      ),
      for (var i = 0; i < 4; i++)
        precacheImage(
          AssetImage(stagePath(i)),
          context,
          onError: (error, _) {
            failure ??= error;
          },
        ),
    ]);
    if (!mounted || request != generation) return;
    setState(() {
      ready = failure == null;
      failed = failure != null;
    });
    if (ready) widget.onReady?.call();
  }

  @override
  Widget build(BuildContext context) {
    if (failed)
      return Center(
        child: IconButton(
          onPressed: prepare,
          tooltip: '작물 이미지 다시 불러오기',
          icon: const Icon(Icons.refresh),
        ),
      );
    if (!ready)
      return const Center(
        child: Text('작물 준비 중…', style: TextStyle(fontSize: 12)),
      );
    return TweenAnimationBuilder<double>(
      tween: Tween(end: widget.progress),
      duration: MediaQuery.disableAnimationsOf(context)
          ? Duration.zero
          : cropGrowthDuration,
      builder: (_, progress, _) {
        final pose = growthPose(progress);
        return Semantics(
          image: true,
          label: '${widget.name} 성장 ${progress.round()}%',
          child: Stack(
            fit: StackFit.expand,
            children: [
              Opacity(
                opacity: 1 - pose.blend,
                child: Image.asset(
                  stagePath(pose.from),
                  fit: BoxFit.contain,
                  excludeFromSemantics: true,
                ),
              ),
              Opacity(
                opacity: pose.blend,
                child: Transform.scale(
                  scale: pose.incomingScale,
                  alignment: cropRootAnchor,
                  child: Image.asset(
                    stagePath(pose.to),
                    fit: BoxFit.contain,
                    excludeFromSemantics: true,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
