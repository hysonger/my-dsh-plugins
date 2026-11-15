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
  const endpoint = process.env.KIMI_FETCH_TEST_ENDPOINT ?? DEFAULT_KIMI_FETCH_ENDPOINT;
  const url = process.env.KIMI_FETCH_TEST_URL ?? 'https://example.com/';
  const client = new KimiWebClient(
    () => ({
      apiKeyEnv: 'KIMI_CODING_API_KEY',
      searchEndpoint: DEFAULT_KIMI_SEARCH_ENDPOINT,
      fetchEndpoint: endpoint,
      searchTimeoutMs: 30000,
      fetchTimeoutMs: 60000,
    }),
    { resolveCredential: async () => apiKey },
  );
  try {
    const result = await client.fetch({ url, toolCallId: 'live-fetch-smoke' });
    console.log(
      JSON.stringify(
        {
          ok: true,
          endpoint,
          url: result.url,
          statusCode: result.statusCode,
          contentLength: result.body.content.length,
          preview: result.body.content.slice(0, 500),
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
          endpoint,
          url,
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
