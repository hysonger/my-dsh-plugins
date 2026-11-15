import { KIMI_CODE_SEARCH_PROVIDER_ID, KimiWebClient } from './client.js';

/** Backward-compatible ctx.web adapter; independent tools use the client directly. */
export class KimiCodeSearchProvider {
  constructor(readSettings, hooks) {
    this.id = KIMI_CODE_SEARCH_PROVIDER_ID;
    this.client = new KimiWebClient(readSettings, hooks);
  }

  available() {
    return this.client.searchAvailable();
  }

  search(request, signal) {
    return this.client.search({ query: request.query, signal });
  }

  resolveCredential(...args) {
    return this.client.resolveCredential(...args);
  }
}

export {
  DEFAULT_KIMI_FETCH_ENDPOINT,
  DEFAULT_KIMI_SEARCH_ENDPOINT,
  DEFAULT_KIMI_SEARCH_TIMEOUT_MS,
  GLOBAL_KIMI_FETCH_ENDPOINT,
  GLOBAL_KIMI_SEARCH_ENDPOINT,
  KIMI_CODE_SEARCH_PROVIDER_ID,
  KimiWebClient,
  mapKimiSearchResponse,
  normalizeApiEndpoint,
  normalizePublicTargetUrl,
} from './client.js';
