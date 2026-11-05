/**
 * Host half of the usage board.
 *
 * Composed into a DSH web profile, this plugin registers HTTP routes under
 * `/usage-board` and nothing else model-facing: the browser half it ships is
 * discovered automatically through the package's `dsh.client` declaration.
 *
 * Lifecycle: `apply` runs once `webServer` exists, builds the secret reader and
 * the snapshot cache, then registers routes through one disposer. Cordis calls
 * that disposer on unload, so stopping the plugin leaves no route behind.
 *
 * Two deliberate dependency choices:
 *
 * - **No schema library.** The config surface is five scalars, so it is
 *   normalized here instead of importing a validator. That keeps the host half
 *   on Node builtins only, which means a broken dependency can never stop the
 *   dashboard from loading.
 * - **No hard credentials dependency.** `ctx.credentials` is read lazily for
 *   every resolution, so a composition without the credential seam still loads
 *   and reports each provider as `not-configured` rather than failing.
 *
 * The single runtime dependency is optional, too: `chinese-days` is imported
 * lazily by the DeepSeek adapter to make the peak/off-peak reminder holiday-
 * aware. A missing install degrades that reminder to the plain weekday rule
 * (and says so in `meta.pricing`) instead of preventing the plugin from loading.
 *
 * @module dsh-plugin-usage-board
 */

import { createSecretReader } from '../src/host/credentials.js';
import { registerRoutes } from '../src/host/routes.js';
import { PROVIDERS } from '../src/host/providers/index.js';
import {
  DEFAULT_TTL_MS,
  clampTtl,
} from '../src/host/snapshot.js';
import { SnapshotService } from '../src/host/snapshot.js';

/** Plugin version reported by `/usage-board/api/health`. */
export const PLUGIN_VERSION = '0.6.0';

/**
 * Normalize the plugin's configuration.
 *
 * Exported as `Config` with a `resolve`-like call so a DSH loader that
 * understands schemastery-shaped configs can still project the defaults.
 *
 * @param {object} [input] Raw config from the loader.
 * @returns {{ ttlMs: number, servePage: boolean, allowRemote: boolean, verbose: boolean }}
 */
export function normalizeConfig(input) {
  const raw = input !== null && typeof input === 'object' ? input : {};
  return {
    ttlMs: clampTtl(typeof raw.ttlMs === 'number' ? raw.ttlMs : DEFAULT_TTL_MS),
    servePage: raw.servePage !== false,
    allowRemote: raw.allowRemote === true,
    verbose: raw.verbose === true,
  };
}

/**
 * Configuration surface.
 *
 * Cordis validates a plugin's config through the Standard Schema interface
 * (`Config['~standard'].validate`). Declaring it by hand — rather than importing
 * `schemastery` — keeps the host half on Node builtins only, so the dashboard
 * cannot be taken down by a dependency that fails to resolve in the profile.
 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-plugin-usage-board',
    /**
     * @param {unknown} value Raw config from the loader.
     * @returns {{ value: ReturnType<typeof normalizeConfig>, issues?: undefined }
     *   | { issues: Array<{ message: string, path?: string[] }> }}
     */
    validate(value) {
      const raw = value === null || value === undefined ? {} : value;
      if (typeof raw !== 'object' || Array.isArray(raw)) {
        return { issues: [{ message: 'usage-board config must be an object', path: [] }] };
      }
      const fields = /** @type {Record<string, unknown>} */ (raw);
      /** @type {Array<{ message: string, path?: string[] }>} */
      const issues = [];
      for (const key of ['ttlMs', 'servePage', 'allowRemote', 'verbose']) {
        const expected = typeof ConfigDefaults[key];
        if (fields[key] !== undefined && typeof fields[key] !== expected) {
          issues.push({ message: `usage-board config.${key} must be a ${expected}`, path: [key] });
        }
      }
      if (issues.length > 0) return { issues };
      return { value: normalizeConfig(fields) };
    },
  },
};

/** Field types the hand-written schema above enforces. */
const ConfigDefaults = {
  ttlMs: DEFAULT_TTL_MS,
  servePage: true,
  allowRemote: false,
  verbose: false,
};

/** Cordis service dependency: the HTTP carrier this plugin answers on. */
export const inject = ['webServer'];

/**
 * Mount the usage board.
 * @param {import('@deepseek-ai/cordis').Context} ctx Plugin context.
 * @param {object} [config] Resolved configuration.
 */
export function apply(ctx, config) {
  const resolved = normalizeConfig(config);

  const log = (message) => {
    try {
      ctx.logger?.info?.(`[usage-board] ${message}`);
    } catch {
      /* a logging failure must never break the dashboard */
    }
  };
  const debug = resolved.verbose ? log : () => undefined;

  // Read through `ctx.get` per call: the credential seam may compose after
  // this plugin, and a service that appears later must still be used.
  const getSecret = createSecretReader({
    credentials: {
      resolve: (ref) => ctx.get('credentials')?.resolve(ref),
      readRecord: (key) => ctx.get('credentials')?.readRecord(key),
      listRecords: () => ctx.get('credentials')?.listRecords() ?? [],
    },
    log: debug,
  });

  const snapshots = new SnapshotService({
    getSecret,
    ttlMs: resolved.ttlMs,
    log: debug,
  });

  ctx.effect(() => {
    const dispose = registerRoutes(ctx.webServer, {
      snapshots,
      log,
      version: PLUGIN_VERSION,
      credentialsHint: {
        providers: PROVIDERS.map((adapter) => ({
          id: adapter.id,
          label: adapter.label,
          refs: adapter.credentialRefs ?? [],
        })),
      },
      allowRemote: resolved.allowRemote,
      servePage: resolved.servePage,
    });
    log(
      `ready — ${PROVIDERS.length} providers, ${Math.round(resolved.ttlMs / 1000)}s cache, routes under /usage-board`,
    );
    return () => {
      dispose();
      // Release any in-flight upstream read so unloading never leaves a
      // provider socket open behind the disposed route table.
      snapshots.dispose();
      log('routes released');
    };
  }, 'usage-board: http routes');
}

export { SnapshotService } from '../src/host/snapshot.js';
export { PROVIDERS } from '../src/host/providers/index.js';
export { createSecretReader } from '../src/host/credentials.js';
