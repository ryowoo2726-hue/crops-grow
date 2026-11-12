// Keep game requests on the frontend connection; SQLite remains authoritative.
export async function onRequest({request}) {
  const upstream = new URL(request.url);
  upstream.hostname = 'cropgrow-api.sangsangbar.com';
  upstream.protocol = 'https:';
  upstream.port = '';
  try {
    const response = await fetch(new Request(upstream, request), {
      redirect: 'manual',
      cache: 'no-store',
    });
    const result = new Response(response.body, response);
    result.headers.set('Cache-Control', 'no-store');
    return result;
  } catch {
    return Response.json({error: '서버 연결을 기다리고 있어요.'}, {
      status: 502,
      headers: {'Cache-Control': 'no-store'},
    });
  }
}
