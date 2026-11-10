import 'dart:convert';

const storageKey = 'growgame.figma-game.v1';
const crops = <String, String>{
  'rice': '벼',
  'sweet-potato': '고구마',
  'soybean': '콩',
  'radish': '무',
  'napa-cabbage': '배추',
  'apple': '사과',
  'persimmon': '감',
  'peach': '복숭아',
  'watermelon': '수박',
  'chili-pepper': '고추',
  'mango': '망고',
};

String seoulDay([DateTime? time]) => (time ?? DateTime.now())
    .toUtc()
    .add(const Duration(hours: 9))
    .toIso8601String()
    .substring(0, 10);

Map<String, dynamic> freshRecord(Map<String, dynamic> profile) => {
  'profile': profile,
  'cropId': 'rice',
  'progress': 0,
  'harvests': <dynamic>[],
  'dailyMode': false,
  'waterDay': '',
  'missionDay': '',
};

bool validProfile(dynamic p) =>
    p is Map &&
    p['grade'] is int &&
    p['grade'] >= 1 &&
    p['grade'] <= 3 &&
    ['classNo', 'number'].every((k) => p[k] is int && p[k] >= 1 && p[k] <= 99);

List<Map<String, dynamic>> decodeRecords(String? raw) {
  if (raw == null) return [];
  final data = jsonDecode(raw);
  if (data is! Map || data['version'] != 1 || data['records'] is! List) {
    throw const FormatException('저장 형식 오류');
  }
  final result = <Map<String, dynamic>>[];
  final profiles = <String>{};
  for (final r in data['records']) {
    if (r is! Map ||
        !validProfile(r['profile']) ||
        !(r['cropId'] == null || crops.containsKey(r['cropId'])) ||
        r['progress'] is! num ||
        !r['progress'].isFinite ||
        r['progress'] < 0 ||
        r['progress'] > 100 ||
        (r['cropId'] == null && r['progress'] != 0) ||
        r['dailyMode'] is! bool ||
        r['waterDay'] is! String ||
        r['missionDay'] is! String ||
        r['harvests'] is! List) {
      throw const FormatException('저장 기록 오류');
    }
    final ids = <String>{};
    for (final h in r['harvests']) {
      if (h is! Map ||
          !crops.containsKey(h['cropId']) ||
          h['id'] is! String ||
          h['at'] is! String ||
          !ids.add(h['id'])) {
        throw const FormatException('수확 기록 오류');
      }
    }
    final p = r['profile'];
    if (!profiles.add('${p['grade']}-${p['classNo']}-${p['number']}')) {
      throw const FormatException('중복 참여 기록');
    }
    result.add(Map<String, dynamic>.from(r));
  }
  return result;
}

bool canGrow(Map<String, dynamic> record, String kind) =>
    ['water', 'mission'].contains(kind) &&
    record['cropId'] != null &&
    record['progress'] < 100 &&
    (!record['dailyMode'] || record['${kind}Day'] != seoulDay());

bool growRecord(Map<String, dynamic> record, String kind) {
  if (!canGrow(record, kind)) return false;
  record['progress'] =
      ((record['progress'] as num) + (kind == 'water' ? 50 : 30)).clamp(0, 100);
  record['${kind}Day'] = seoulDay();
  return true;
}
