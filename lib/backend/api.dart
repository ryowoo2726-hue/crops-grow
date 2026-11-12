import 'dart:convert';
import 'transport_stub.dart'
    if (dart.library.js_interop) 'transport_web.dart'
    as transport;

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://cropgrow.sangsangbar.com',
);

class ApiException implements Exception {
  const ApiException(this.message, this.status);
  final String message;
  final int status;
  @override
  String toString() => message;
}

class BackendClient {
  String token = '';
  Future<Map<String, dynamic>> call(
    String method,
    String route, [
    Map<String, dynamic>? body,
  ]) async {
    if (apiBaseUrl.isEmpty) throw const ApiException('서버 연결을 기다리고 있어요.', 0);
    try {
      final result = await transport
          .request(
            '${apiBaseUrl.replaceFirst(RegExp(r'/+$'), '')}$route',
            method,
            {
              if (body != null) 'Content-Type': 'application/json',
              if (token.isNotEmpty) 'Authorization': 'Bearer $token',
            },
            body == null ? null : jsonEncode(body),
          )
          .timeout(const Duration(seconds: 12));
      final data = jsonDecode(result.body);
      if (result.status < 200 || result.status >= 300)
        throw ApiException(
          data is Map && data['error'] is String
              ? data['error']
              : '서버 요청을 처리하지 못했어요.',
          result.status,
        );
      if (data is! Map<String, dynamic>)
        throw const FormatException('응답 형식 오류');
      return data;
    } on ApiException {
      rethrow;
    } catch (_) {
      throw const ApiException('서버 연결을 기다리고 있어요.', 0);
    }
  }
}
