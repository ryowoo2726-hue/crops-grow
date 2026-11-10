import 'dart:convert';
import 'local_test_data.dart';
import 'storage_stub.dart' if (dart.library.js_interop) 'storage.dart';

const missionStorageKey = localTestMode
    ? 'growgame.local-test.missions.v1'
    : 'growgame.missions.v1';

String missionWeek(String date) {
  final day = DateTime.parse(date);
  return day
      .subtract(Duration(days: day.weekday - 1))
      .toIso8601String()
      .substring(0, 10);
}

// 백엔드 연결 시 이 두 함수의 저장소만 교체합니다.
Map<String, Map<String, String>> loadMissions() =>
    decodeMissions(readStorage(missionStorageKey) ?? '{"missions":{}}');
void saveMissions(Map<String, Map<String, String>> missions) =>
    writeStorage(missionStorageKey, jsonEncode({'missions': missions}));

Map<String, Map<String, String>> decodeMissions(String raw) {
  final data = jsonDecode(raw);
  if (data is! Map || data['missions'] is! Map)
    throw const FormatException('미션 형식 오류');
  final result = <String, Map<String, String>>{};
  for (final entry in (data['missions'] as Map).entries) {
    final date = entry.key;
    final mission = entry.value;
    final parsed = date is String ? DateTime.tryParse(date) : null;
    if (parsed == null ||
        parsed.toIso8601String().substring(0, 10) != date ||
        mission is! Map ||
        mission['title'] is! String ||
        mission['description'] is! String ||
        (mission['title'] as String).trim().isEmpty ||
        (mission['title'] as String).length > 60 ||
        (mission['description'] as String).trim().isEmpty ||
        (mission['description'] as String).length > 600) {
      throw const FormatException('미션 내용 오류');
    }
    result[date] = {
      'title': mission['title'],
      'description': mission['description'],
    };
  }
  return result;
}
