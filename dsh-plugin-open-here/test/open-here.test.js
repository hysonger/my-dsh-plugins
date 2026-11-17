import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import test from 'node:test';

import {
  Config,
  DEFAULT_PENDING_TTL_MS,
  PendingIntents,
  IntentHub,
  isAllowedOrigin,
  isLoopbackAddress,
  loadOrCreateToken,
  normalizeConfig,
  validateOpenRequest,
  verifyBearer,
  writeRuntimeFile,
} from '../index.js';

test('normalizeConfig applies defaults and clamps the TTL', () => {
  assert.deepEqual(normalizeConfig(undefined), {
    allowRemote: false,
    pendingTtlMs: DEFAULT_PENDING_TTL_MS,
  });
  assert.deepEqual(normalizeConfig({ allowRemote: true, pendingTtlMs: 100 }), {
    allowRemote: true,
    pendingTtlMs: 1000,
  });
  assert.deepEqual(normalizeConfig({ pendingTtlMs: 10 * 60 * 1000 }), {
    allowRemote: false,
    pendingTtlMs: 10 * 60 * 1000,
  });
  assert.equal(normalizeConfig({ pendingTtlMs: Number.NaN }).pendingTtlMs, DEFAULT_PENDING_TTL_MS);
});

test('Config schema rejects wrong types and accepts partial input', () => {
  assert.ok(Config['~standard'].validate('nope').issues.length > 0);
  assert.ok(Config['~standard'].validate({ allowRemote: 'yes' }).issues.length > 0);
  assert.deepEqual(Config['~standard'].validate({}).value, normalizeConfig({}));
  assert.deepEqual(Config['~standard'].validate(null).value, normalizeConfig({}));
});

test('validateOpenRequest accepts absolute paths only', () => {
  assert.deepEqual(validateOpenRequest({ path: '/tmp/x' }), { ok: true, path: '/tmp/x' });
  assert.equal(validateOpenRequest({ path: 'relative/dir' }).ok, false);
  assert.equal(validateOpenRequest({ path: '' }).ok, false);
  assert.equal(validateOpenRequest({ path: 42 }).ok, false);
  assert.equal(validateOpenRequest(null).ok, false);
  assert.equal(validateOpenRequest([]).ok, false);
  assert.equal(validateOpenRequest({ path: '/tmp/bad\0x' }).ok, false);
});

test('verifyBearer matches exactly and in constant-time shape', () => {
  const token = 'a'.repeat(64);
  assert.equal(verifyBearer(`Bearer ${token}`, token), true);
  assert.equal(verifyBearer(`Bearer  ${token} `, token), true);
  assert.equal(verifyBearer(`Bearer ${token}x`, token), false);
  assert.equal(verifyBearer(`bearer ${token}`, token), false);
  assert.equal(verifyBearer(token, token), false);
  assert.equal(verifyBearer(undefined, token), false);
  assert.equal(verifyBearer('Bearer ', token), false);
});

test('isLoopbackAddress recognizes IPv4 and IPv6 loopback', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true);
  assert.equal(isLoopbackAddress('127.42.0.9'), true);
  assert.equal(isLoopbackAddress('::1'), true);
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackAddress('192.168.1.2'), false);
  assert.equal(isLoopbackAddress(undefined), false);
  assert.equal(isLoopbackAddress(''), false);
});

test('isAllowedOrigin allows CLI and same-origin GUI, blocks foreign sites', () => {
  const host = 'http://127.0.0.1:58003';
  assert.equal(isAllowedOrigin(undefined, host), true);
  assert.equal(isAllowedOrigin('', host), true);
  assert.equal(isAllowedOrigin('null', host), true);
  assert.equal(isAllowedOrigin(host, host), true);
  assert.equal(isAllowedOrigin('dsh-app://app', host), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:9999', host), true);
  assert.equal(isAllowedOrigin('http://[::1]:3000', host), true);
  assert.equal(isAllowedOrigin('https://evil.example.com', host), false);
  assert.equal(isAllowedOrigin('not a url', host), false);
});

test('PendingIntents is latest-wins, consuming, and TTL-bound', () => {
  const intents = new PendingIntents(1000);
  assert.equal(intents.take(), null);

  intents.store({ workspaceId: 'a', path: '/a', requestedAt: Date.now() });
  intents.store({ workspaceId: 'b', path: '/b', requestedAt: Date.now() });
  const taken = intents.take();
  assert.equal(taken.workspaceId, 'b');
  assert.equal(intents.take(), null, 'take consumes');

  intents.store({ workspaceId: 'old', path: '/old', requestedAt: Date.now() - 5000 });
  assert.equal(intents.take(), null, 'stale intent is dropped, not delivered');

  intents.store({ workspaceId: 'c', path: '/c', requestedAt: Date.now() - 5000 });
  intents.sweep();
  assert.equal(intents.pending, null, 'sweep clears expired intents');
});

test('IntentHub broadcasts to all clients and tolerates broken ones', () => {
  const hub = new IntentHub();
  const writes = [];
  const good = { write: (chunk) => writes.push(chunk), end: () => undefined };
  const broken = {
    write: () => {
      throw new Error('socket gone');
    },
    end: () => undefined,
  };
  const disposeGood = hub.add(good);
  hub.add(broken);
  const delivered = hub.broadcast({ workspaceId: 'w', path: '/p', requestedAt: 1 });
  assert.equal(delivered, 1, 'the throwing client does not count');
  assert.equal(writes.length, 1);
  assert.match(writes[0], /^data: \{.*"workspaceId":"w".*\}\n\n$/);
  disposeGood();
  assert.equal(hub.clients.size, 1);
  hub.closeAll();
  assert.equal(hub.clients.size, 0);
});

test('loadOrCreateToken generates once, persists 0600, then reuses', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'open-here-test-'));
  const stateDir = join(dir, 'state');

  const first = await loadOrCreateToken(stateDir);
  assert.equal(first.length, 64);
  if (process.platform !== 'win32') {
    const fileMode = (await stat(join(stateDir, 'token'))).mode & 0o777;
    assert.equal(fileMode, 0o600);
  }

  const second = await loadOrCreateToken(stateDir);
  assert.equal(second, first, 'token is stable across activations');
});

test('writeRuntimeFile emits flat one-key-per-line JSON with 0600', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'open-here-test-'));
  const filePath = await writeRuntimeFile(dir, 'desktop', {
    version: 1,
    profile: 'desktop',
    pid: 4242,
    origin: 'http://127.0.0.1:58003',
  });
  const text = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(text);
  assert.equal(parsed.profile, 'desktop');
  assert.equal(parsed.pid, 4242);
  // One key per line so the dependency-free shell reader can extract values.
  assert.match(text, /^ {2}"origin": "http:\/\/127\.0\.0\.1:58003"$/m);
  if (process.platform !== 'win32') {
    const fileMode = (await stat(filePath)).mode & 0o777;
    assert.equal(fileMode, 0o600);
  }
});
