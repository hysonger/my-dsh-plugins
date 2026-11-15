import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';

test('negative control: deferring a callback with a timer does not escape HMR-style async context', { timeout: 2000 }, async () => {
  const transaction = new AsyncLocalStorage();
  const inherited = await new Promise(resolve => {
    transaction.run(true, () => setTimeout(() => resolve(transaction.getStore()), 0));
  });
  assert.equal(inherited, true);
  assert.equal(transaction.getStore(), undefined);
});
