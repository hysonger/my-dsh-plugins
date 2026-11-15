import { WebError } from '@deepseek-ai/dsh-web';
import {
  DEFAULT_KIMI_FETCH_ENDPOINT,
  DEFAULT_KIMI_FETCH_TIMEOUT_MS,
  DEFAULT_KIMI_SEARCH_ENDPOINT,
  DEFAULT_KIMI_SEARCH_TIMEOUT_MS,
  KimiWebClient,
} from './src/client.js';
import { KimiCodeSearchProvider } from './src/provider.js';
import { registerKimiTools } from './src/tools.js';

export const name = 'kimi-web-search';
export const inject = ['web', 'tools', 'systemPrompt', 'credentials'];

export const CONFIG_DEFAULTS = Object.freeze({
  apiKeyEnv: 'KIMI_CODING_API_KEY',
  searchEndpoint: DEFAULT_KIMI_SEARCH_ENDPOINT,
  fetchEndpoint: DEFAULT_KIMI_FETCH_ENDPOINT,
  searchTimeoutMs: DEFAULT_KIMI_SEARCH_TIMEOUT_MS,
  fetchTimeoutMs: DEFAULT_KIMI_FETCH_TIMEOUT_MS,
  searchMaxQueries: 4,
  searchMaxResults: 8,
  fetchMaxOutputChars: 200000,
  registerLegacyProvider: false,
});

const STRING_FIELDS = ['apiKeyEnv', 'searchEndpoint', 'fetchEndpoint'];
const INTEGER_RULES = {
  searchTimeoutMs: [1000, 180000],
  fetchTimeoutMs: [1000, 180000],
  searchMaxQueries: [1, 8],
  searchMaxResults: [1, 50],
  fetchMaxOutputChars: [1000, 1000000],
};

export function normalizeConfig(input) {
  const raw = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return Object.fromEntries(
    Object.entries(CONFIG_DEFAULTS).map(([key, fallback]) => [
      key,
      typeof raw[key] === typeof fallback ? raw[key] : fallback,
    ]),
  );
}

export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-plugin-kimi-web-search',
    validate(value) {
      const raw = value === null || value === undefined ? {} : value;
      if (typeof raw !== 'object' || Array.isArray(raw)) {
        return { issues: [{ message: 'kimi-web-search config must be an object', path: [] }] };
      }
      const issues = [];
      for (const key of STRING_FIELDS) {
        if (raw[key] !== undefined && (typeof raw[key] !== 'string' || raw[key].trim() === '')) {
          issues.push({ message: `kimi-web-search.${key} must be a non-empty string`, path: [key] });
        }
      }
      if (
        raw.registerLegacyProvider !== undefined &&
        typeof raw.registerLegacyProvider !== 'boolean'
      ) {
        issues.push({
          message: 'kimi-web-search.registerLegacyProvider must be a boolean',
          path: ['registerLegacyProvider'],
        });
      }
      for (const [key, [minimum, maximum]] of Object.entries(INTEGER_RULES)) {
        const field = raw[key];
        if (
          field !== undefined &&
          (!Number.isInteger(field) || field < minimum || field > maximum)
        ) {
          issues.push({
            message: `kimi-web-search.${key} must be an integer from ${minimum} to ${maximum}`,
            path: [key],
          });
        }
      }
      return issues.length > 0 ? { issues } : { value: normalizeConfig(raw) };
    },
  },
};

/** Register the legacy Provider plus independent tools without changing default routing. */
export function apply(ctx, config) {
  const resolved = normalizeConfig(config);
  const hooks = {
    resolveCredential: async () => (await ctx.credentials.resolve(resolved.apiKeyEnv))?.value,
    createError: (message, code, options) => new WebError(message, code, options),
  };
  const client = new KimiWebClient(() => resolved, hooks);
  const provider = resolved.registerLegacyProvider ? new KimiCodeSearchProvider(() => resolved, hooks) : undefined;

  ctx.effect(() => {
    const disposeProvider = provider === undefined ? undefined : ctx.web.registerSearchProvider(provider);
    const disposeTools = registerKimiTools(ctx, client, resolved);
    return () => {
      disposeTools();
      disposeProvider?.();
    };
  }, 'kimi-web-search: independent tools and optional legacy provider');
}

export {
  DEFAULT_KIMI_FETCH_ENDPOINT,
  DEFAULT_KIMI_FETCH_TIMEOUT_MS,
  DEFAULT_KIMI_SEARCH_ENDPOINT,
  DEFAULT_KIMI_SEARCH_TIMEOUT_MS,
  GLOBAL_KIMI_FETCH_ENDPOINT,
  GLOBAL_KIMI_SEARCH_ENDPOINT,
  KIMI_CODE_SEARCH_PROVIDER_ID,
  KimiWebClient,
  mapKimiSearchResponse,
  normalizeApiEndpoint,
  normalizePublicTargetUrl,
} from './src/client.js';
export { KimiCodeSearchProvider } from './src/provider.js';
export { createKimiFetchTool, createKimiSearchTool } from './src/tools.js';
