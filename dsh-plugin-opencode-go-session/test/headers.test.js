import test from 'node:test';
import assert from 'node:assert/strict';
import { addSessionHeader, SESSION_HEADER } from '../src/headers.js';
import { apply, inject } from '../index.js';

const request = overrides => ({ provider: 'opencode-go', baseURL: 'https://opencode.ai/inference/go/openai/v1', sessionId: 'session-123', ...overrides });

test('fills the missing header and preserves unrelated headers', () => {
  const headers = new Headers({ 'x-other': 'keep' });
  assert.equal(addSessionHeader(request(), headers), headers);
  assert.equal(headers.get(SESSION_HEADER), 'session-123');
  assert.equal(headers.get('x-other'), 'keep');
});

test('uses stable, separate session identities without shared cached state', () => {
  for (const id of ['session-a', 'session-b', 'session-a']) {
    const headers = new Headers();
    addSessionHeader(request({ sessionId: id }), headers);
    assert.equal(headers.get(SESSION_HEADER), id);
  }
});

test('does not overwrite an existing header, regardless of case', () => {
  const headers = new Headers({ 'X-OpenCode-Session': 'explicit-session' });
  addSessionHeader(request(), headers);
  assert.equal(headers.get(SESSION_HEADER), 'explicit-session');
});

for (const [label, overrides] of [
  ['another provider', { provider: 'deepseek-account' }],
  ['a custom alias', { provider: 'my-opencode' }],
  ['another host', { baseURL: 'https://example.com/v1' }],
  ['a deceptive host', { baseURL: 'https://opencode.ai.example.com/v1' }],
  ['a subdomain', { baseURL: 'https://api.opencode.ai/v1' }],
  ['plain HTTP', { baseURL: 'http://opencode.ai/v1' }],
  ['a nonstandard port', { baseURL: 'https://opencode.ai:8443/v1' }],
  ['URL credentials', { baseURL: 'https://name:password@opencode.ai/v1' }],
  ['an invalid URL', { baseURL: 'invalid' }],
  ['no session', { sessionId: undefined }],
  ['an empty session', { sessionId: '' }],
  ['CRLF injection', { sessionId: 'a\r\nx-injected: 1' }],
  ['Unicode session', { sessionId: '会话' }],
  ['whitespace session', { sessionId: 'session with spaces' }],
  ['an overlong session', { sessionId: 'a'.repeat(513) }],
]) {
  test(`leaves ${label} unchanged`, () => {
    const headers = new Headers({ 'x-other': 'keep' });
    assert.doesNotThrow(() => addSessionHeader(request(overrides), headers));
    assert.equal(headers.has(SESSION_HEADER), false);
    assert.equal(headers.get('x-other'), 'keep');
  });
}

test('supports the old official Go endpoint without rewriting it', () => {
  const headers = new Headers();
  const req = request({ baseURL: 'https://opencode.ai/zen/go/v1' });
  addSessionHeader(req, headers);
  assert.equal(headers.get(SESSION_HEADER), 'session-123');
  assert.equal(req.baseURL, 'https://opencode.ai/zen/go/v1');
});

test('waterfall calls next once, returns its result and retains no headers', () => {
  let event, handler;
  apply({ on(e, h) { event = e; handler = h; } }, { repairProtocolOnLoad: false });
  assert.deepEqual(inject, ['llm']);
  assert.equal(event, 'llm-pi-ai/request-headers');
  const headers = new Headers();
  const result = {};
  let called = 0;
  assert.equal(handler(request(), headers, () => { called++; return result; }), result);
  assert.equal(called, 1);
  assert.equal(headers.get(SESSION_HEADER), 'session-123');
});

test('rejects a malformed migration flag before registering effects', () => {
  assert.throws(() => apply({ on() { assert.fail('unexpected registration'); } }, { repairProtocolOnLoad: 'true' }), /must be a boolean/);
});
