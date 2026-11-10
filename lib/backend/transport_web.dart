import 'dart:js_interop';

@JS('fetch')
external JSPromise<_Response> _fetch(JSString url, JSObject options);
extension type _Response(JSObject _) implements JSObject {
  external int get status;
  external JSPromise<JSString> text();
}

Future<({int status, String body})> request(
  String url,
  String method,
  Map<String, String> headers,
  String? body,
) async {
  final response = await _fetch(
    url.toJS,
    {
          'method': method,
          'headers': headers,
          if (body != null) 'body': body,
          'cache': 'no-store',
        }.jsify()
        as JSObject,
  ).toDart;
  return (status: response.status, body: (await response.text().toDart).toDart);
}
