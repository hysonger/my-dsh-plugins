const PROVIDER = 'opencode-go';
const API = 'openai-completions';
const BASE_URL = 'https://opencode.ai/inference/go/openai/v1';

/**
 * An explicit, one-time installation migration. DSH owns validation, revision
 * checks, locks, atomic writes, reconciliation, and rollback. No file IO here.
 * The only provider edit is providers.opencode-go.api; never restate the catalog.
 */
export async function repairProtocol(ctx, ownEntry) {
  if (ownEntry === undefined) throw new Error('One-time repair needs a profile-owned plugin entry');
  const route = ctx.llm.listConfigurableProviders().find(item => item.provider === PROVIDER);
  if (route === undefined) throw new Error('OpenCode Go is not configured; no provider was created');
  const view = ctx.settings.describe({ redactSecrets: true }).find(item => item.ns === route.settingsNs);
  const profile = view?.value?.providers?.[PROVIDER];
  if (profile === undefined || profile.baseURL !== BASE_URL || !Array.isArray(profile.models) || profile.models.length === 0) {
    throw new Error('One-time repair only supports an existing OpenCode Go Chat Completions profile');
  }
  if (profile.api != null && profile.api !== API) throw new Error('Refusing to replace an explicit non-Chat-Completions protocol');
  if (profile.api == null) {
    await ctx.settings.mutate(route.settingsNs, [{
      op: 'set', path: ['providers', PROVIDER, 'api'], value: API,
    }], view.revision);
  }
  // Persist only our own consumed flag. Future starts must not keep reapplying
  // a protocol override after the user removes it following an upstream fix.
  await ctx.configEditor.edit(ownEntry, current => ({ ...current, repairProtocolOnLoad: false }));
}
