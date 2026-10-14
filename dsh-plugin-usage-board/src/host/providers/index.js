/**
 * Provider registry for the usage board.
 *
 * The host's `SnapshotService` imports {@link PROVIDERS} and calls each
 * adapter's `read()` with the shared context. The order here is the order the
 * dashboard renders, and matches `PROVIDER_IDS` in the frozen protocol:
 * deepseek, glm, kimi.
 *
 * Each adapter is `{ id, label, credentialRefs, read(context) }` and is total —
 * `read()` always resolves a `ProviderSnapshot` and never rejects, so one
 * broken provider can never take the whole board down.
 *
 * @module dsh-plugin-usage-board/host/providers
 */

import { deepseekAdapter } from './deepseek.js';
import { glmAdapter } from './glm.js';
import { kimiAdapter } from './kimi.js';

/**
 * Every adapter the dashboard knows, in display order.
 *
 * @type {import('./common.js').ProviderAdapter[]}
 */
export const PROVIDERS = [deepseekAdapter, glmAdapter, kimiAdapter];

export { deepseekAdapter, glmAdapter, kimiAdapter };

/**
 * Look up one adapter by provider id.
 *
 * @param {string} id A `PROVIDER_IDS` member.
 * @returns {import('./common.js').ProviderAdapter|undefined}
 */
export function providerById(id) {
  return PROVIDERS.find((adapter) => adapter.id === id);
}

export default PROVIDERS;
