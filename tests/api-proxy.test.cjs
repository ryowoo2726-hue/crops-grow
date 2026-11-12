const {test} = require('node:test');
const assert = require('node:assert/strict');

test('Pages proxy preserves authentication, actions, status and disables caching', async t => {
  const {onRequest} = await import('../functions/api/[[path]].js');
  const authorization = `Bearer ${require('node:crypto').randomUUID()}`;
  t.mock.method(globalThis, 'fetch', async (request, options) => {
    assert.equal(request.url, 'https://cropgrow-api.sangsangbar.com/api/actions?page=2');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.get('authorization'), authorization);
    assert.equal(request.headers.get('origin'), 'https://cropgrow.sangsangbar.com');
    assert.deepEqual(await request.json(), {kind:'water',requestId:'test-only'});
    assert.equal(options.redirect, 'manual');
    assert.equal(options.cache, 'no-store');
    return Response.json({error:'conflict'}, {status:409});
  });
  const response = await onRequest({request:new Request('https://cropgrow.sangsangbar.com/api/actions?page=2', {
    method:'POST', headers:{authorization,origin:'https://cropgrow.sangsangbar.com','Content-Type':'application/json'},
    body:JSON.stringify({kind:'water',requestId:'test-only'}),
  })});
  assert.equal(response.status,409);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),{error:'conflict'});
});

test('Pages proxy returns a non-cacheable failure without exposing upstream details', async t => {
  const {onRequest} = await import('../functions/api/[[path]].js');
  t.mock.method(globalThis,'fetch',async()=>{throw Error('private upstream details');});
  const response = await onRequest({request:new Request('https://cropgrow.sangsangbar.com/api/health')});
  assert.equal(response.status,502);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.ok(!(await response.text()).includes('private'));
});
