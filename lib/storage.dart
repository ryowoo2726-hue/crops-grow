import 'dart:js_interop';

@JS('localStorage.getItem')
external JSString? _getItem(JSString key);
@JS('localStorage.setItem')
external void _setItem(JSString key, JSString value);

String? readStorage(String key) => _getItem(key.toJS)?.toDart;
void writeStorage(String key, String value) => _setItem(key.toJS, value.toJS);
