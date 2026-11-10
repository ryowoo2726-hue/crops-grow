// 위젯 테스트는 브라우저 저장소 없이 실행합니다.
final memoryStorage = <String, String>{};
String? readStorage(String key) => memoryStorage[key];
void writeStorage(String key, String value) {
  memoryStorage[key] = value;
}
