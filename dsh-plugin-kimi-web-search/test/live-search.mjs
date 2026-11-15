import {
  DEFAULT_KIMI_FETCH_ENDPOINT,
  DEFAULT_KIMI_SEARCH_ENDPOINT,
  KimiWebClient,
} from '../src/client.js';

const apiKey = process.env.KIMI_CODING_API_KEY;
if (typeof apiKey !== 'string' || apiKey.trim() === '') {
  console.error('KIMI_CODING_API_KEY is required; the value is never printed.');
  process.exitCode = 2;
} else {
  const endpoint = process.env.KIMI_SEARCH_TEST_ENDPOINT ?? DEFAULT_KIMI_SEARCH_ENDPOINT;
  const query = process.env.KIMI_SEARCH_TEST_QUERY ?? 'DeepSeek Harness official GitHub';
  const client = new KimiWebClient(
    () => ({
      apiKeyEnv: 'KIMI_CODING_API_KEY',
      searchEndpoint: endpoint,
      fetchEndpoint: DEFAULT_KIMI_FETCH_ENDPOINT,
      searchTimeoutMs: 30000,
      fetchTimeoutMs: 60000,
    }),
    { resolveCredential: async () => apiKey },
  );
  try {
    const result = await client.search({ query, toolCallId: 'live-search-smoke' });
    console.log(
      JSON.stringify(
        {
          ok: true,
          provider: 'kimi-code-search',
          endpoint,
          query,
          sourceCount: result.sources.length,
          sources: result.sources,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          provider: 'kimi-code-search',
          endpoint,
          query,
          code: error?.code,
          message: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}
