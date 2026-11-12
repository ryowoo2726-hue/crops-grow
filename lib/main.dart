import 'dart:convert';
import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'backend/api.dart';
import 'crops/crop_growth.dart';
import 'crops/reward_effect.dart';
import 'game.dart';
import 'font_assets.dart';
import 'image_assets.dart';
import 'local_test_data.dart';
import 'missions.dart';
import 'missions/quiz/content.dart';
import 'missions/quiz/popup.dart';
import 'missions/special/popup.dart';
import 'storage_stub.dart' if (dart.library.js_interop) 'storage.dart';

const ink = Color(0xff284b39);
const cream = Color(0xfffff9e9);
const green = Color(0xff5f9e59);

ThemeData gameTheme() => ThemeData(
  useMaterial3: true,
  fontFamily: 'NotoSansKR',
  fontFamilyFallback: const ['NotoSansKRExtended'],
  colorScheme: ColorScheme.fromSeed(seedColor: green, surface: cream),
  scaffoldBackgroundColor: Colors.transparent,
  textTheme: ThemeData.light().textTheme.apply(
    fontFamily: 'NotoSansKR',
    fontFamilyFallback: const ['NotoSansKRExtended'],
    bodyColor: ink,
    displayColor: ink,
  ),
  filledButtonTheme: FilledButtonThemeData(
    style: FilledButton.styleFrom(
      backgroundColor: green,
      foregroundColor: Colors.white,
      minimumSize: const Size(48, 54),
      textStyle: const TextStyle(
        fontFamily: 'NotoSansKR',
        fontWeight: FontWeight.w800,
        fontSize: 17,
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
    ),
  ),
  dialogTheme: DialogThemeData(
    backgroundColor: cream,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(26)),
  ),
);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  PaintingBinding.instance.imageCache.maximumSizeBytes = 64 * 1024 * 1024;
  runApp(const GrowGame(demo: localTestMode));
}

// 동일한 세로 화면을 가로·세로 중 먼저 닿는 경계까지 확대합니다.
Size stageSize(Size viewport) {
  if (viewport.shortestSide > 600) return const Size(390, 844);
  final scale = math.min(viewport.width / 390, viewport.height / 694);
  return Size(390, math.max(694, viewport.height / scale));
}

class GrowGame extends StatelessWidget {
  const GrowGame({super.key, this.demo = false});
  final bool demo;
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: gameTheme(),
    home: Scaffold(
      backgroundColor: const Color(0xff263c30),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, box) {
            final size = stageSize(box.biggest);
            return SizedBox.expand(
              child: FittedBox(
                fit: BoxFit.contain,
                child: SizedBox(
                  width: size.width,
                  height: size.height,
                  // Navigator도 논리 화면 안에 두어 팝업과 터치 좌표가 함께 확대됩니다.
                  child: MaterialApp(
                    debugShowCheckedModeBanner: false,
                    theme: gameTheme(),
                    builder: (context, child) => MediaQuery(
                      data: MediaQuery.of(context).copyWith(
                        size: size,
                        padding: EdgeInsets.zero,
                        viewPadding: EdgeInsets.zero,
                        viewInsets: EdgeInsets.zero,
                      ),
                      child: child!,
                    ),
                    home: FarmGame(demo: demo),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    ),
  );
}

class FarmGame extends StatefulWidget {
  const FarmGame({super.key, this.demo = false});
  final bool demo;
  @override
  State<FarmGame> createState() => _FarmGameState();
}

class _FarmGameState extends State<FarmGame>
    with WidgetsBindingObserver, SingleTickerProviderStateMixin {
  List<Map<String, dynamic>> records = [];
  Map<String, dynamic>? record;
  int grade = 0, classNo = 0, number = 0, tab = 0, page = 0;
  bool busy = false, storageBroken = false;
  bool watering = false;
  late final rewardController = AnimationController(
    vsync: this,
    duration: rewardEffectDuration,
  );
  final farmKey = GlobalKey(), plotKey = GlobalKey();
  final gaugeKey = GlobalKey(), mascotKey = GlobalKey();
  String? rewardKind;
  double rewardFrom = 0;
  ({Offset home, Offset root, Rect gauge})? rewardGeometry;
  double get displayedProgress {
    final progress = (r['progress'] as num).toDouble();
    return rewardKind == null
        ? progress
        : rewardFrom +
              (progress - rewardFrom) *
                  rewardAbsorption(rewardController.value);
  }

  String? warning;
  Map<String, Map<String, String>> missions = {};
  bool missionStorageBroken = false;
  Timer? missionTimer;
  final backend = BackendClient();
  final pin = TextEditingController();
  final pendingRequests = <String, String>{};
  bool disconnected = false, refreshing = false;
  String? loadedCrop;
  bool galleryWarmed = false;
  Future<void>? galleryPreparation;
  final missionData = <String, Map<String, dynamic>>{};
  DateTime? missionsLoadedAt;
  String? loginStatus;
  bool startupWarmed = false;
  bool get cropReady =>
      !remote || r['cropId'] == null || loadedCrop == r['cropId'];
  String? loginError;
  Map<String, dynamic> gardenData = {
    'items': <dynamic>[],
    'total': 0,
    'pages': 1,
  };
  bool get remote => !widget.demo;
  int get harvestCount => remote ? (r['harvestCount'] as int) : harvests.length;
  int cropCount(String crop) => remote
      ? ((r['collectionCounts'] as Map)[crop] as int? ?? 0)
      : harvests.where((h) => h['cropId'] == crop).length;
  Map<String, String>? get todaysMission =>
      missions[seoulDay()] ?? (localTestMode ? localTestSpecial : null);
  Map<String, dynamic> get r => record!;
  List<dynamic> get harvests => r['harvests'];
  String get profileLabel =>
      '${r['profile']['grade']}학년 ${r['profile']['classNo']}반 ${r['profile']['number']}번';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    disconnected = remote;
    if (remote) {
      checkConnection();
      missionTimer = Timer.periodic(const Duration(seconds: 60), (_) {
        if (record == null) {
          checkConnection();
        } else if (!busy &&
            WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed)
          refreshRemote();
      });
      return;
    }
    try {
      records = decodeRecords(
        readStorage(localTestMode ? localTestStorageKey : storageKey),
      );
    } catch (_) {
      storageBroken = true;
      warning = '저장 기록을 읽지 못했어요. 기존 기록을 보호하며 임시 체험으로 시작합니다.';
    }
    if (localTestMode) {
      grade = 1;
      classNo = 1;
      number = 1;
      final existing = records.where(
        (r) =>
            r['profile']['grade'] == 1 &&
            r['profile']['classNo'] == 1 &&
            r['profile']['number'] == 1,
      );
      record = existing.isEmpty
          ? freshRecord({...localTestProfile})
          : existing.first;
      if (existing.isEmpty) records.add(r);
      save();
    }
    refreshMissions();
    missionTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => refreshMissions(),
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!startupWarmed) {
      startupWarmed = true;
      galleryPreparation = warmGallery();
    }
  }

  @override
  void dispose() {
    rewardController.dispose();
    missionTimer?.cancel();
    pin.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) {
      if (remote && record != null) {
        refreshRemote();
      } else if (!remote) {
        refreshMissions();
      }
    }
  }

  void remoteError(Object error) {
    if (!mounted) return;
    final apiError = error is ApiException
        ? error
        : const ApiException('서버 응답을 확인하지 못했어요.', 0);
    setState(() {
      if (apiError.status == 401 || apiError.status == 409) {
        missionData.clear();
        missionsLoadedAt = null;
      }
      disconnected = apiError.status == 0 || apiError.status >= 500;
      loginError = apiError.message;
      if (apiError.status == 401 && record != null) {
        record = null;
        backend.token = '';
      }
    });
    if (!disconnected && record != null)
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(apiError.message)));
  }

  Future<void> checkConnection() async {
    try {
      await backend.call('GET', '/api/health');
      if (mounted) setState(() => disconnected = false);
    } catch (_) {
      if (mounted) setState(() => disconnected = true);
    }
  }

  void applyRemoteState(dynamic raw) {
    final state = Map<String, dynamic>.from(raw as Map);
    decodeRecords(
      jsonEncode({
        'version': 1,
        'records': [state],
      }),
    );
    if (record != null && state['revision'] < (r['revision'] ?? 0)) return;
    setState(() {
      record = state;
      disconnected = false;
      loginError = null;
    });
    if (state['cropId'] == null) unawaited(warmGallery());
  }

  Future<void> refreshRemote() async {
    if (refreshing || busy || record == null) return;
    refreshing = true;
    final session = backend.token;
    try {
      final data = await backend.call('GET', '/api/me');
      if (mounted && record != null && backend.token == session)
        applyRemoteState(data['state']);
    } catch (error) {
      if (backend.token == session) remoteError(error);
    } finally {
      refreshing = false;
    }
  }

  Future<Map<String, dynamic>?> remoteAction(
    String kind, {
    String? crop,
    int? missionRevision,
  }) async {
    final session = backend.token;
    final key = '$kind-$crop-$missionRevision';
    final requestId = pendingRequests.putIfAbsent(
      key,
      () =>
          '${DateTime.now().microsecondsSinceEpoch}_${math.Random.secure().nextInt(0x100000000)}',
    );
    try {
      final data = await backend.call('POST', '/api/actions', {
        'kind': kind,
        'requestId': requestId,
        if (crop != null) 'cropId': crop,
        if (missionRevision != null) 'missionRevision': missionRevision,
      });
      pendingRequests.remove(key);
      if (!mounted || record == null || backend.token != session) return null;
      applyRemoteState(data['state']);
      return data;
    } catch (error) {
      if (error is ApiException && error.status >= 400 && error.status < 500)
        pendingRequests.remove(key);
      remoteError(error);
      return null;
    }
  }

  Future<void> loadGarden(int target) async {
    final session = backend.token;
    try {
      final data = await backend.call('GET', '/api/garden?page=$target');
      if (mounted && record != null && backend.token == session)
        setState(() {
          gardenData = data;
          page = data['page'];
          disconnected = false;
        });
    } catch (error) {
      remoteError(error);
    }
  }

  void showTab(int value) {
    if (busy) return;
    setState(() => tab = value);
    if (remote) {
      if (value == 1) {
        loadGarden(page);
      } else {
        refreshRemote();
      }
    }
  }

  void refreshMissions() {
    if (remote) return;
    try {
      final loaded = loadMissions();
      if (mounted)
        setState(() {
          missions = loaded;
          missionStorageBroken = false;
        });
    } catch (_) {
      if (mounted)
        setState(() {
          missionStorageBroken = true;
          missions = {};
        });
    }
  }

  void save() {
    if (remote || storageBroken) return;
    try {
      writeStorage(
        localTestMode ? localTestStorageKey : storageKey,
        jsonEncode({'version': 1, 'records': records}),
      );
    } catch (_) {
      setState(() => warning = '저장할 수 없어요. 현재 화면에서만 기록됩니다.');
    }
  }

  Future<void> warmGallery() async {
    if (galleryWarmed) return;
    galleryWarmed = true;
    // The login background and mascot take priority over collection thumbnails.
    await precacheImage(
      gameImage('environment/bg-school-farm'),
      context,
      onError: (_, _) {},
    );
    if (!mounted) return;
    for (final name in [
      'characters/drop-default',
      'characters/drop-happy',
      'characters/drop-celebrate',
      'environment/field-base',
      'environment/field-dry-base',
    ]) {
      if (!mounted) return;
      await precacheImage(
        gameImage(name, width: name.startsWith('characters/') ? 256 : 1024),
        context,
        onError: (_, _) {},
      );
    }
    // Three small requests at a time keep visible crop requests responsive.
    final thumbnails = [
      for (final crop in crops.keys) ...[
        'crops/$crop-thumb',
        'crops/$crop-garden',
      ],
    ];
    for (var i = 0; i < thumbnails.length; i += 3) {
      if (!mounted) return;
      await Future.wait([
        for (final name in thumbnails.skip(i).take(3))
          precacheImage(
            gameImage(name, width: 256),
            context,
            onError: (_, _) {},
          ),
      ]);
    }
    // Preserve the original Hanja/CJK coverage without blocking Korean UI startup.
    if (!mounted) return;
    try {
      await (FontLoader(
        'NotoSansKRExtended',
      )..addFont(rootBundle.load(extendedFontAsset))).load();
    } catch (_) {
      // Flutter's normal font fallback remains available if this optional load fails.
    }
  }

  Future<void> preparePlay(String? crop) async {
    await galleryPreparation;
    if (!mounted || crop == null) return;
    Object? failure;
    for (final provider in <ImageProvider<Object>>[
      for (var stage = 1; stage <= 4; stage++)
        gameImage('crops/$crop-stage-${stage.toString().padLeft(2, '0')}'),
      gameImage('crops/$crop-harvest', width: 512),
    ]) {
      if (!mounted) return;
      await precacheImage(
        provider,
        context,
        onError: (error, _) {
          failure ??= error;
        },
      );
    }
    if (failure != null) {
      throw const ApiException('작물 이미지를 준비하지 못했어요. 다시 시작해 주세요.', 0);
    }
  }

  Widget image(
    String name, {
    double? width,
    double? height,
    int? decodeWidth,
  }) => Image(
    image: gameImage(
      name,
      width: name.endsWith('-thumb') || name.endsWith('-garden')
          ? 256
          : name.endsWith('-harvest')
          ? 512
          : name.startsWith('characters/')
          ? 256
          : decodeWidth ??
                (((width ?? height ?? 1024) *
                        MediaQuery.devicePixelRatioOf(context))
                    .ceil()
                    .clamp(128, 1024)),
    ),
    width: width,
    height: height,
    fit: BoxFit.contain,
    errorBuilder: (_, _, _) =>
        const Center(child: Icon(Icons.broken_image_outlined, color: ink)),
  );
  Widget heading(String text, {double size = 22}) => Text(
    text,
    textAlign: TextAlign.center,
    style: TextStyle(fontSize: size, fontWeight: FontWeight.w900),
  );
  Widget panel(Widget child, {EdgeInsets padding = const EdgeInsets.all(20)}) =>
      Container(
        padding: padding,
        decoration: BoxDecoration(
          color: cream.withValues(alpha: .97),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: const Color(0xffd5dfb0), width: 2),
          boxShadow: const [
            BoxShadow(
              color: Color(0x20284b39),
              offset: Offset(0, 5),
              blurRadius: 8,
            ),
          ],
        ),
        child: child,
      );
  Widget action(
    String text,
    VoidCallback? onPressed, {
    IconData icon = Icons.eco,
    bool soft = false,
  }) => SizedBox(
    width: double.infinity,
    child: FilledButton.icon(
      style: soft
          ? FilledButton.styleFrom(
              backgroundColor: const Color(0xffe4ebce),
              foregroundColor: ink,
            )
          : null,
      onPressed: onPressed,
      icon: Icon(icon, size: 22),
      label: Text(text),
    ),
  );

  Future<T?> popup<T>(
    String title,
    Widget Function(BuildContext, StateSetter) content,
  ) => showDialog<T>(
    context: context,
    useRootNavigator: false,
    builder: (dialogContext) => StatefulBuilder(
      builder: (context, update) => Dialog(
        insetPadding: const EdgeInsets.all(22),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height - 60,
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 22),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Expanded(child: heading(title)),
                    IconButton(
                      tooltip: '닫기',
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Flexible(
                  child: SingleChildScrollView(
                    child: content(dialogContext, update),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );

  Future<void> select(String kind) async {
    final count = kind == '학년'
        ? 3
        : kind == '반'
        ? 10
        : 30;
    final value = await popup<int>(
      '$kind 선택',
      (context, _) => Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (var i = 1; i <= count; i++)
            SizedBox(
              width: kind == '학년' ? 250 : 76,
              child: FilledButton.tonal(
                style: FilledButton.styleFrom(
                  minimumSize: const Size(48, 48),
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  textStyle: const TextStyle(
                    fontFamily: 'NotoSansKR',
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                onPressed: () => Navigator.pop(context, i),
                child: Text(
                  '$i${kind == '번호' ? '번' : kind}',
                  maxLines: 1,
                  softWrap: false,
                ),
              ),
            ),
        ],
      ),
    );
    if (value == null || !mounted) return;
    setState(() {
      if (kind == '학년') {
        if (grade != value) {
          classNo = 0;
          number = 0;
        }
        grade = value;
      } else if (kind == '반') {
        if (classNo != value) number = 0;
        classNo = value;
      } else {
        number = value;
      }
    });
  }

  Future<void> enter() async {
    if (grade < 1 || classNo < 1 || number < 1) return;
    if (remote) {
      if (busy || !RegExp(r'^\d{4}$').hasMatch(pin.text)) return;
      setState(() {
        busy = true;
        loginError = null;
        loginStatus = '로그인 확인 중…';
        missionData.clear();
        missionsLoadedAt = null;
      });
      try {
        final result = await backend.call('POST', '/api/session', {
          'profile': {'grade': grade, 'classNo': classNo, 'number': number},
          'pin': pin.text,
        });
        if (!mounted) return;
        backend.token = result['token'];
        pendingRequests.clear();
        setState(() => loginStatus = '플레이 자료 준비 중…');
        await preparePlay(result['state']['cropId'] as String?);
        if (!mounted) return;
        if (result['quiz'] is Map<String, dynamic>)
          missionData['quiz'] = result['quiz'];
        if (result.containsKey('mission'))
          missionData['special'] = {'mission': result['mission']};
        missionsLoadedAt = DateTime.now();
        applyRemoteState(result['state']);
        setState(() {
          tab = 0;
          page = 0;
          gardenData =
              result['garden'] as Map<String, dynamic>? ??
              {'items': <dynamic>[], 'total': 0, 'pages': 1};
        });
        pin.clear();
      } catch (error) {
        backend.token = '';
        remoteError(error);
      } finally {
        if (mounted)
          setState(() {
            busy = false;
            loginStatus = null;
          });
      }
      return;
    }
    final found = records.where(
      (e) =>
          e['profile']['grade'] == grade &&
          e['profile']['classNo'] == classNo &&
          e['profile']['number'] == number,
    );
    setState(() {
      record = found.isNotEmpty
          ? found.first
          : freshRecord({'grade': grade, 'classNo': classNo, 'number': number});
      if (found.isEmpty) records.add(r);
      tab = 0;
      page = 0;
    });
    save();
  }

  Future<bool> prepareReward(String kind, double before) async {
    rewardController.value = 0;
    setState(() {
      rewardKind = kind;
      rewardFrom = before;
    });
    await WidgetsBinding.instance.endOfFrame;
    if (!mounted || record == null) return false;
    final farm = farmKey.currentContext?.findRenderObject() as RenderBox?;
    Rect? bounds(GlobalKey key) {
      final box = key.currentContext?.findRenderObject() as RenderBox?;
      if (farm == null || box == null || !box.hasSize) return null;
      return box.localToGlobal(Offset.zero, ancestor: farm) & box.size;
    }

    final plot = bounds(plotKey),
        mascot = bounds(mascotKey),
        gauge = bounds(gaugeKey);
    if (plot == null || mascot == null || gauge == null) return false;
    setState(
      () => rewardGeometry = (
        home: mascot.center,
        root: Offset(plot.center.dx, plot.top + plot.height * .82),
        gauge: gauge,
      ),
    );
    return true;
  }

  Future<void> grow(
    String kind, {
    String? missionType,
    int? missionRevision,
  }) async {
    if (busy || !cropReady || !canGrow(r, kind)) return;
    final before = (r['progress'] as num).toDouble();
    final animate = !MediaQuery.disableAnimationsOf(context);
    setState(() {
      busy = true;
      watering = kind == 'water';
    });
    final request = remote
        ? remoteAction(
            kind == 'mission' ? missionType! : kind,
            missionRevision: missionRevision,
          )
        : null;
    if (!remote) {
      setState(() => growRecord(r, kind));
      save();
    }
    try {
      if (watering && animate && await prepareReward(kind, before)) {
        // Start the splash now; absorption waits for the server's decision.
        rewardController.animateTo(.5, duration: rewardEffectDuration * .5);
      }
      if (remote && await request == null) return;
      if (!mounted || record == null) return;
      if ((r['progress'] as num) > before && animate) {
        if (!watering) await prepareReward(kind, before);
        if (!mounted) return;
        if (rewardGeometry != null) await rewardController.forward().orCancel;
      }
    } on TickerCanceled {
      // Disposing the screen cancels only the presentation, never the saved reward.
    } finally {
      if (mounted) {
        rewardController.stop(canceled: false);
        setState(() {
          rewardKind = null;
          rewardGeometry = null;
          busy = false;
          watering = false;
        });
      }
    }
  }

  Future<void> mission() async {
    if (busy) return;
    final type = await popup<String>(
      '미션',
      (context, _) => Row(
        children: [
          for (final item in [
            ('quiz', '퀴즈 미션', Icons.lightbulb_outline),
            ('special', '특별 미션', Icons.auto_awesome_outlined),
          ])
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(context, item.$1),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                      vertical: 20,
                      horizontal: 6,
                    ),
                  ),
                  child: Column(
                    children: [
                      Icon(item.$3, size: 26),
                      const SizedBox(height: 10),
                      Text(
                        item.$2,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
    if (type == null || !mounted) return;
    if (remote) {
      await remoteMission(type);
      return;
    }
    final date = seoulDay();
    const questions = localTestMode ? localTestQuiz : <QuizQuestion>[];
    final task = todaysMission;
    final before = type == 'quiz' ? null : jsonEncode(task);
    final eligible = !busy && canGrow(r, 'mission');
    final complete = await popup<bool>(
      type == 'quiz' ? '퀴즈 미션' : '특별 미션',
      (_, _) => type == 'quiz'
          ? QuizMissionPopup(questions: questions, canComplete: eligible)
          : SpecialMissionPopup(mission: task, canComplete: eligible),
    );
    if (complete != true || !mounted) return;
    refreshMissions();
    final currentTask = todaysMission;
    if (seoulDay() != date ||
        type == 'special' && jsonEncode(currentTask) != before) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('미션이 변경되었어요. 다시 확인해 주세요.')));
      return;
    }
    await grow('mission');
  }

  Future<void> remoteMission(String type) async {
    if (busy || record == null) return;
    setState(() => busy = true);
    Map<String, dynamic> data;
    try {
      final fresh =
          missionsLoadedAt != null &&
          DateTime.now().difference(missionsLoadedAt!) <
              const Duration(seconds: 60);
      data = fresh && missionData.containsKey(type)
          ? missionData[type]!
          : await backend.call(
              'GET',
              type == 'quiz' ? '/api/quizzes/current' : '/api/missions/current',
            );
      if (!mounted || record == null) return;
      setState(() => disconnected = false);
    } catch (error) {
      remoteError(error);
      return;
    } finally {
      if (mounted) setState(() => busy = false);
    }
    final eligible = cropReady && canGrow(r, 'mission');
    final mission = data['mission'] is Map
        ? Map<String, String>.from(
            (data['mission'] as Map).map(
              (k, v) => MapEntry(k.toString(), v.toString()),
            ),
          )
        : null;
    final revision = type == 'quiz'
        ? data['revision'] as int
        : (data['mission'] as Map?)?['revision'] as int?;
    late final List<QuizQuestion> questions;
    try {
      questions = type == 'quiz'
          ? parseQuizQuestions(data['questions'])
          : const <QuizQuestion>[];
    } catch (error) {
      remoteError(error);
      return;
    }
    final complete = await popup<bool>(
      type == 'quiz' ? '퀴즈 미션' : '특별 미션',
      (_, _) => type == 'quiz'
          ? QuizMissionPopup(
              questions: questions,
              canComplete: eligible,
              checkAnswer: (question, answer) async {
                try {
                  final result = await backend
                      .call('POST', '/api/quizzes/check', {
                        'week': data['week'],
                        'revision': revision,
                        'questionId': question.id,
                        'answerIndex': answer,
                      });
                  if (mounted) setState(() => disconnected = false);
                  return QuizFeedback(
                    result['correct'] == true,
                    result['explanation'] as String? ?? '',
                  );
                } catch (error) {
                  remoteError(error);
                  rethrow;
                }
              },
            )
          : SpecialMissionPopup(mission: mission, canComplete: eligible),
    );
    if (complete == true && mounted && record != null)
      await grow('mission', missionType: type, missionRevision: revision);
  }

  Future<void> manageMissions() async {
    var date = seoulDay();
    final title = TextEditingController(text: missions[date]?['title'] ?? '');
    final description = TextEditingController(
      text: missions[date]?['description'] ?? '',
    );
    String? feedback;
    final form = GlobalKey<FormState>();
    await popup<void>(
      '미션 관리',
      (dialogContext, update) => Form(
        key: form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              '현재는 이 브라우저에만 저장됩니다. 날짜별로 미리 등록할 수 있어요.',
              style: TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              icon: const Icon(Icons.calendar_month),
              label: Text(date),
              onPressed: () async {
                final selected = await showDatePicker(
                  context: dialogContext,
                  useRootNavigator: false,
                  initialDate: DateTime.parse(date),
                  firstDate: DateTime(2020),
                  lastDate: DateTime(2100, 12, 31),
                );
                if (selected == null || !dialogContext.mounted) return;
                update(() {
                  date = selected.toIso8601String().substring(0, 10);
                  title.text = missions[date]?['title'] ?? '';
                  description.text = missions[date]?['description'] ?? '';
                  feedback = null;
                });
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: title,
              maxLength: 60,
              decoration: const InputDecoration(
                labelText: '미션 제목',
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  v == null || v.trim().isEmpty ? '제목을 입력해 주세요.' : null,
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: description,
              maxLength: 600,
              minLines: 3,
              maxLines: 6,
              decoration: const InputDecoration(
                labelText: '미션 내용',
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  v == null || v.trim().isEmpty ? '내용을 입력해 주세요.' : null,
            ),
            const SizedBox(height: 12),
            if (feedback != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(feedback!, style: const TextStyle(fontSize: 13)),
              ),
            action(
              '미션 저장',
              missionStorageBroken
                  ? null
                  : () {
                      if (!form.currentState!.validate()) return;
                      final updated = {
                        ...missions,
                        date: {
                          'title': title.text.trim(),
                          'description': description.text.trim(),
                        },
                      };
                      try {
                        saveMissions(updated);
                        setState(() => missions = updated);
                        update(() => feedback = '$date 미션을 저장했어요.');
                      } catch (_) {
                        update(
                          () => feedback = '저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.',
                        );
                      }
                    },
              icon: Icons.save_outlined,
            ),
            TextButton(
              onPressed: missionStorageBroken || !missions.containsKey(date)
                  ? null
                  : () async {
                      final confirmed = await popup<bool>(
                        '이 날짜의 미션을 삭제할까요?',
                        (context, _) => action(
                          '삭제하기',
                          () => Navigator.pop(context, true),
                          icon: Icons.delete_outline,
                        ),
                      );
                      if (confirmed != true || !dialogContext.mounted) return;
                      final updated = {...missions}..remove(date);
                      try {
                        saveMissions(updated);
                        setState(() => missions = updated);
                        update(() {
                          title.clear();
                          description.clear();
                          feedback = '미션을 삭제했어요.';
                        });
                      } catch (_) {
                        update(() => feedback = '미션을 삭제하지 못했어요. 다시 시도해 주세요.');
                      }
                    },
              child: const Text('선택한 날짜의 미션 삭제'),
            ),
            if (missionStorageBroken)
              const Text('저장된 미션을 읽지 못했어요. 원본 보호를 위해 편집을 중지했습니다.'),
          ],
        ),
      ),
    );
    await Future<void>.delayed(const Duration(milliseconds: 300));
    title.dispose();
    description.dispose();
  }

  Future<void> harvest() async {
    if (busy || r['cropId'] == null || r['progress'] < 100) return;
    final crop = r['cropId'] as String;
    final at = DateTime.now().toUtc();
    if (remote) {
      setState(() => busy = true);
      final result = await remoteAction('harvest');
      if (mounted) setState(() => busy = false);
      if (result == null || !mounted) return;
    } else {
      setState(() {
        harvests.add({
          'id':
              '${at.microsecondsSinceEpoch}-${math.Random.secure().nextInt(0x100000000)}',
          'cropId': crop,
          'at': at.toIso8601String(),
        });
        r['cropId'] = null;
        r['progress'] = 0;
        page = (classHarvests().length - 1) ~/ 9;
      });
    }
    save();
    final next = await popup<bool>(
      '수확 성공!',
      (context, _) => Column(
        children: [
          image('crops/$crop-harvest', height: 170),
          heading('+1', size: 28),
          Text(
            '우리 반 정원에 ${crops[crop]} 수확이 더해졌어요.',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 22),
          action('다음 작물 심기', () => Navigator.pop(context, true)),
          const SizedBox(height: 10),
          action(
            '정원 보기',
            () => Navigator.pop(context, false),
            soft: true,
            icon: Icons.local_florist,
          ),
        ],
      ),
    );
    if (!mounted) return;
    if (next == true) {
      await chooseCrop();
    } else if (next == false) {
      showTab(1);
    }
  }

  Future<void> chooseCrop() async {
    if (busy || r['cropId'] != null) return;
    final crop = await popup<String>(
      '다음 작물',
      (context, _) => Wrap(
        spacing: 8,
        runSpacing: 10,
        children: [
          for (final c in crops.entries)
            SizedBox(
              width: 126,
              child: OutlinedButton(
                onPressed: () => Navigator.pop(context, c.key),
                child: Column(
                  children: [
                    image('crops/${c.key}-harvest', height: 86),
                    Text(c.value),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
    if (crop == null || !mounted) return;
    if (remote) {
      setState(() => busy = true);
      final result = await remoteAction('plant', crop: crop);
      if (mounted) setState(() => busy = false);
      if (result != null && mounted) showTab(0);
      return;
    }
    setState(() {
      r['cropId'] = crop;
      r['progress'] = 0;
      tab = 0;
    });
    save();
  }

  List<dynamic> classHarvests() {
    final p = r['profile'];
    return records
        .where(
          (e) =>
              e['profile']['grade'] == p['grade'] &&
              e['profile']['classNo'] == p['classNo'],
        )
        .expand((e) => e['harvests'] as List)
        .toList()
      ..sort((a, b) => (a['at'] as String).compareTo(b['at']));
  }

  Future<void> settings() async {
    final choice = await popup<String>(
      '설정',
      (context, update) => Column(
        children: [
          heading(profileLabel, size: 18),
          const SizedBox(height: 12),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('하루 1회 규칙 체험'),
            value: r['dailyMode'],
            onChanged: remote
                ? null
                : (v) {
                    setState(() => r['dailyMode'] = v);
                    update(() {});
                    save();
                  },
          ),
          Text(
            remote
                ? '기록은 서버에 저장됩니다.\n하루 참여 규칙은 서버에서 정합니다.'
                : '이 브라우저에 기록하는 체험판입니다.\n반 정원에는 여기서 참여한 같은 반의 수확만 모여요.',
            style: TextStyle(fontSize: 13),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          if (!localTestMode)
            action(
              '참여 정보 바꾸기',
              () => Navigator.pop(context, 'logout'),
              soft: true,
              icon: Icons.person,
            ),
          const SizedBox(height: 10),
          if (!remote)
            action(
              '관리자 미션 관리',
              () => Navigator.pop(context, 'missions'),
              soft: true,
              icon: Icons.edit_calendar,
            ),
          if (!remote)
            TextButton(
              onPressed: () => Navigator.pop(context, 'reset'),
              child: const Text('내 체험 기록 초기화'),
            ),
        ],
      ),
    );
    if (!mounted) return;
    if (choice == 'missions') await manageMissions();
    if (choice == 'logout') {
      if (remote) {
        try {
          await backend.call('POST', '/api/logout', {});
        } catch (_) {
          /* 서버 세션은 만료 시 정리됩니다. */
        }
        backend.token = '';
        pendingRequests.clear();
        missionData.clear();
        missionsLoadedAt = null;
      }
      if (!mounted) return;
      setState(() => record = null);
    }
    if (choice == 'reset') {
      final confirm = await popup<bool>(
        '내 기록을 초기화할까요?',
        (context, _) => Column(
          children: [
            const Text(
              '내 작물과 수확 기록을 초기화합니다.\n같은 반 다른 번호의 기록은 유지됩니다.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            action(
              '초기화',
              () => Navigator.pop(context, true),
              icon: Icons.restart_alt,
            ),
          ],
        ),
      );
      if (confirm == true && mounted) {
        setState(() {
          final profile = r['profile'];
          r.clear();
          r.addAll(freshRecord(profile));
          tab = 0;
          page = 0;
        });
        save();
      }
    }
  }

  Widget login() => LayoutBuilder(
    builder: (context, box) => Stack(
      children: [
        Positioned(
          top: box.maxHeight * .12,
          left: 20,
          right: 20,
          child: Column(
            children: [
              heading('마석중학교', size: 29),
              heading('농작물 키우기', size: 35),
            ],
          ),
        ),
        Positioned(
          left: 22,
          right: 22,
          bottom: 50,
          child: Column(
            children: [
              panel(
                Column(
                  children: [
                    heading('누구의 밭인가요?', size: 22),
                    const SizedBox(height: 22),
                    Row(
                      children: [
                        for (final field in [
                          ('학년', grade),
                          ('반', classNo),
                          ('번호', number),
                        ])
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 3,
                              ),
                              child: Column(
                                children: [
                                  Text(
                                    field.$1,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  const SizedBox(height: 7),
                                  OutlinedButton(
                                    style: OutlinedButton.styleFrom(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 3,
                                      ),
                                      minimumSize: const Size(
                                        double.infinity,
                                        52,
                                      ),
                                    ),
                                    onPressed:
                                        field.$1 == '반' && grade == 0 ||
                                            field.$1 == '번호' && classNo == 0
                                        ? null
                                        : () => select(field.$1),
                                    child: Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            field.$2 == 0
                                                ? '선택'
                                                : '${field.$2}${field.$1 == '번호' ? '번' : field.$1}',
                                            maxLines: 1,
                                            softWrap: false,
                                            textAlign: TextAlign.center,
                                            style: const TextStyle(
                                              fontSize: 14,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                        ),
                                        const Icon(Icons.expand_more, size: 16),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 22),
                    if (remote) ...[
                      TextField(
                        controller: pin,
                        obscureText: true,
                        maxLength: 4,
                        enabled: !busy,
                        keyboardType: TextInputType.number,
                        autocorrect: false,
                        enableSuggestions: false,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                        ],
                        onChanged: (_) => setState(() => loginError = null),
                        decoration: const InputDecoration(
                          labelText: '비밀번호 4자리',
                          counterText: '',
                          border: OutlineInputBorder(),
                          helperText: '처음 참여하면 이 비밀번호로 등록됩니다.',
                        ),
                      ),
                      const SizedBox(height: 14),
                      if (loginError != null && !disconnected)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Text(
                            loginError!,
                            style: const TextStyle(
                              fontSize: 12,
                              color: Colors.red,
                            ),
                          ),
                        ),
                    ],
                    action(
                      busy ? (loginStatus ?? '확인 중…') : '시작하기',
                      busy ||
                              grade * classNo * number == 0 ||
                              remote && !RegExp(r'^\d{4}$').hasMatch(pin.text)
                          ? null
                          : enter,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                '학년 · 반 · 번호로 입장',
                style: TextStyle(
                  fontSize: 13,
                  color: cream,
                  shadows: [Shadow(blurRadius: 4, color: ink)],
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );

  Widget quietButton(String label, IconData icon, VoidCallback onPressed) =>
      TextButton.icon(
        onPressed: busy ? null : onPressed,
        icon: Icon(icon, size: 17),
        label: Text(label),
        style: TextButton.styleFrom(
          minimumSize: const Size(88, 44),
          padding: const EdgeInsets.symmetric(horizontal: 13),
          backgroundColor: cream.withValues(alpha: .78),
          foregroundColor: ink.withValues(alpha: .8),
          textStyle: const TextStyle(
            fontFamily: 'NotoSansKR',
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
          side: BorderSide(color: ink.withValues(alpha: .12)),
          shape: const StadiumBorder(),
        ),
      );

  Widget farm() => AnimatedBuilder(
    animation: rewardController,
    builder: (_, _) => farmFrame(),
  );

  Widget farmFrame() {
    final crop = r['cropId'] as String?;
    final progress = displayedProgress;
    final effect = rewardGeometry;
    return Stack(
      key: farmKey,
      clipBehavior: Clip.none,
      children: [
        Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: TextButton.icon(
                    onPressed: busy ? null : settings,
                    icon: const Icon(Icons.eco, size: 18),
                    label: Text(
                      profileLabel,
                      style: const TextStyle(fontSize: 13),
                    ),
                  ),
                ),
                TextButton.icon(
                  onPressed: () => showTab(2),
                  icon: const Icon(Icons.emoji_events_outlined, size: 20),
                  label: Text('$harvestCount'),
                ),
              ],
            ),
            panel(
              Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        crops[crop] ?? '다음 작물',
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      Text(
                        '${progress.round()} / 100%',
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                  const SizedBox(height: 9),
                  TweenAnimationBuilder<double>(
                    tween: Tween(end: progress / 100),
                    duration:
                        rewardKind != null ||
                            MediaQuery.disableAnimationsOf(context)
                        ? Duration.zero
                        : cropGrowthDuration,
                    builder: (_, value, _) => ClipRRect(
                      key: gaugeKey,
                      borderRadius: BorderRadius.circular(10),
                      child: LinearProgressIndicator(
                        value: value,
                        minHeight: 16,
                        backgroundColor: const Color(0xffdce4c3),
                        color: green,
                        semanticsLabel: '작물 성장도',
                      ),
                    ),
                  ),
                ],
              ),
              padding: const EdgeInsets.all(16),
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                quietButton('미션', Icons.task_alt, mission),
                quietButton(
                  '메시지',
                  Icons.chat_bubble_outline,
                  () => popup<void>(
                    '메시지',
                    (_, _) => const Padding(
                      padding: EdgeInsets.symmetric(vertical: 24),
                      child: Text(
                        '아직 도착한 메시지가 없어요.',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            Expanded(
              child: LayoutBuilder(
                builder: (context, box) {
                  final side = math.min(370.0, box.maxHeight);
                  return Stack(
                    alignment: Alignment.center,
                    clipBehavior: Clip.none,
                    children: [
                      if (crop != null)
                        SizedBox(
                          key: plotKey,
                          width: side,
                          height: side,
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              image(
                                'environment/${crop == 'rice' ? 'field-base' : 'field-dry-base'}',
                              ),
                              Transform.rotate(
                                alignment: cropRootAnchor,
                                angle: rewardKind == null
                                    ? 0
                                    : math.sin(rewardController.value * 60) *
                                          math.sin(
                                            rewardAbsorption(
                                                  rewardController.value,
                                                ) *
                                                math.pi,
                                          ) *
                                          .018,
                                child: CropGrowth(
                                  key: ValueKey(crop),
                                  cropId: crop,
                                  name: crops[crop]!,
                                  progress: progress,
                                  animate: rewardKind == null,
                                  onReady: () {
                                    if (mounted)
                                      setState(() => loadedCrop = crop);
                                    unawaited(warmGallery());
                                  },
                                ),
                              ),
                            ],
                          ),
                        )
                      else
                        panel(heading('다음 작물을 심어보세요', size: 19)),
                      Positioned(
                        right: 0,
                        bottom: 0,
                        child: Opacity(
                          key: mascotKey,
                          opacity: rewardKind == 'water' && effect != null
                              ? rewardPhase(rewardController.value, .8, 1)
                              : 1,
                          child: image(
                            'characters/${r['progress'] >= 100
                                ? 'drop-celebrate'
                                : busy
                                ? 'drop-happy'
                                : 'drop-default'}',
                            width: 90,
                            height: 100,
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
            Text(
              rewardKind != null
                  ? rewardKind == 'water'
                        ? rewardController.value < .48
                              ? '물방울이 작물에게 가요!'
                              : r['progress'] <= rewardFrom
                              ? '물을 주고 있어요!'
                              : '촉촉하게, 쑥쑥 자라요!'
                        : '영양분이 뿌리로 쏙!'
                  : busy
                  ? watering
                        ? '물을 주고 있어요!'
                        : '잠시만요, 확인 중이에요…'
                  : r['progress'] >= 100
                  ? '수확할 준비 완료!'
                  : crop == null
                  ? '새로운 작물을 만나볼까요?'
                  : '오늘도 조금씩 자라고 있어요',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 14),
            action(
              crop == null
                  ? '다음 작물 심기'
                  : progress >= 100
                  ? '수확하기'
                  : '물 주기 +50%',
              busy
                  ? null
                  : crop == null
                  ? chooseCrop
                  : r['progress'] >= 100
                  ? harvest
                  : cropReady && canGrow(r, 'water')
                  ? () => grow('water')
                  : null,
              icon: crop == null
                  ? Icons.eco
                  : r['progress'] >= 100
                  ? Icons.emoji_events
                  : Icons.water_drop,
            ),
            if (r['dailyMode'] &&
                crop != null &&
                r['progress'] < 100 &&
                !canGrow(r, 'water'))
              const Padding(
                padding: EdgeInsets.only(top: 6),
                child: Text(
                  '오늘 물 주기를 마쳤어요. 내일 다시 만나요!',
                  style: TextStyle(fontSize: 12),
                ),
              ),
          ],
        ),
        if (rewardKind != null && effect != null)
          Positioned.fill(
            child: RepaintBoundary(
              child: RewardEffect(
                kind: rewardKind!,
                time: rewardController.value,
                home: effect.home,
                root: effect.root,
                gauge: effect.gauge,
                gain: ((r['progress'] as num) - rewardFrom).round(),
              ),
            ),
          ),
      ],
    );
  }

  Widget garden() {
    final items = remote ? gardenData['items'] as List : classHarvests();
    final total = remote ? gardenData['total'] as int : items.length;
    final pages = remote
        ? gardenData['pages'] as int
        : math.max(1, (items.length / 9).ceil());
    page = page.clamp(0, pages - 1);
    return Column(
      children: [
        heading('${r['profile']['grade']}학년 ${r['profile']['classNo']}반 정원'),
        const SizedBox(height: 12),
        panel(
          Column(
            children: [
              Text('수확 $total개 · 꽃이 피기까지 ${5 - total % 5}개'),
              const SizedBox(height: 10),
              LinearProgressIndicator(
                value: total % 5 / 5,
                minHeight: 10,
                color: green,
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Expanded(
          child: Center(
            child: AspectRatio(
              aspectRatio: 1,
              child: panel(
                GridView.count(
                  crossAxisCount: 3,
                  physics: const NeverScrollableScrollPhysics(),
                  padding: EdgeInsets.zero,
                  children: [
                    for (var slot = 0; slot < 9; slot++)
                      Builder(
                        builder: (context) {
                          final index = remote ? slot : page * 9 + slot;
                          final crop = index < items.length
                              ? items[index]['cropId'] as String
                              : null;
                          return Semantics(
                            label: crop == null ? '수확을 기다리는 빈 칸' : crops[crop],
                            child: Stack(
                              fit: StackFit.expand,
                              children: [
                                image(
                                  'environment/${crop == 'rice' ? 'field-base' : 'field-dry-base'}',
                                ),
                                if (crop != null)
                                  image('crops/$crop-garden', decodeWidth: 256)
                                else
                                  const Center(
                                    child: Icon(Icons.add, color: green),
                                  ),
                              ],
                            ),
                          );
                        },
                      ),
                  ],
                ),
                padding: const EdgeInsets.all(8),
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            IconButton(
              tooltip: '이전 정원 구역',
              onPressed: page > 0
                  ? () {
                      if (remote) {
                        loadGarden(page - 1);
                      } else {
                        setState(() => page--);
                      }
                    }
                  : null,
              icon: const Icon(Icons.chevron_left),
            ),
            Text('${page + 1} / $pages'),
            IconButton(
              tooltip: '다음 정원 구역',
              onPressed: page < pages - 1
                  ? () {
                      if (remote) {
                        loadGarden(page + 1);
                      } else {
                        setState(() => page++);
                      }
                    }
                  : null,
              icon: const Icon(Icons.chevron_right),
            ),
          ],
        ),
      ],
    );
  }

  Widget book() => Column(
    children: [
      heading(
        '작물 도감  ${crops.keys.where((c) => cropCount(c) > 0).length}/${crops.length}',
      ),
      const SizedBox(height: 20),
      Expanded(
        child: panel(
          GridView.count(
            crossAxisCount: 3,
            childAspectRatio: .66,
            mainAxisSpacing: 10,
            crossAxisSpacing: 8,
            children: [
              for (final c in crops.entries)
                Builder(
                  builder: (_) {
                    final count = cropCount(c.key);
                    return Container(
                      decoration: BoxDecoration(
                        color: const Color(0xffedf0d7),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        children: [
                          Expanded(
                            child: Opacity(
                              opacity: count > 0 ? 1 : .3,
                              child: image(
                                'crops/${c.key}-thumb',
                                decodeWidth: 256,
                              ),
                            ),
                          ),
                          Text(
                            c.value,
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                          Text(
                            '× $count',
                            style: const TextStyle(fontSize: 12),
                          ),
                          const SizedBox(height: 8),
                        ],
                      ),
                    );
                  },
                ),
            ],
          ),
          padding: const EdgeInsets.all(12),
        ),
      ),
    ],
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Stack(
      fit: StackFit.expand,
      children: [
        Image(
          image: gameImage('environment/bg-school-farm'),
          fit: BoxFit.cover,
        ),
        if (record == null)
          login()
        else
          Column(
            children: [
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
                  child: [farm, garden, book][tab](),
                ),
              ),
              DecoratedBox(
                decoration: const BoxDecoration(
                  color: cream,
                  border: Border(
                    top: BorderSide(color: Color(0xffd5dfb0), width: 2),
                  ),
                ),
                child: NavigationBar(
                  backgroundColor: Colors.transparent,
                  height: 76,
                  selectedIndex: tab,
                  onDestinationSelected: showTab,
                  destinations: const [
                    NavigationDestination(
                      icon: Icon(Icons.eco_outlined),
                      selectedIcon: Icon(Icons.eco),
                      label: '내 밭',
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.local_florist_outlined),
                      selectedIcon: Icon(Icons.local_florist),
                      label: '반 정원',
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.menu_book_outlined),
                      selectedIcon: Icon(Icons.menu_book),
                      label: '도감',
                    ),
                  ],
                ),
              ),
            ],
          ),
        if (localTestMode)
          Positioned(
            right: 12,
            top: 4,
            child: Material(
              color: cream.withValues(alpha: .9),
              borderRadius: BorderRadius.circular(10),
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                child: Text('로컬 테스트', style: TextStyle(fontSize: 10)),
              ),
            ),
          ),
        if (remote && disconnected)
          Positioned(
            right: 12,
            top: 4,
            child: Material(
              color: cream.withValues(alpha: .9),
              borderRadius: BorderRadius.circular(10),
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.cloud_off_outlined, size: 12),
                    SizedBox(width: 4),
                    Text('서버 연결 안 됨', style: TextStyle(fontSize: 10)),
                  ],
                ),
              ),
            ),
          ),
        if (warning != null)
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Material(
              color: const Color(0xffffe5b2),
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Text(
                  warning!,
                  style: const TextStyle(fontSize: 11),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
          ),
      ],
    ),
  );
}
