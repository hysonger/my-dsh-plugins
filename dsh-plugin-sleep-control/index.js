import z from '@deepseek-ai/schemastery';

import { isSupportedPlatform } from './src/host/platform.js';
import { registerRoutes } from './src/host/routes.js';
import { SessionSleepGuard } from './src/host/session-guard.js';
import { SleepControlService } from './src/host/service.js';

export const inject = ['webServer', 'agents'];

/** Live, user-editable session-scoped sleep prevention for every supported OS. */
export const Config = z.object({
  // Historical key name: it stays stable so profile configs written on macOS
  // remain valid after the same session guard started supporting Windows.
  caffeinateDuringSessions: z.boolean().default(false).volatile(),
});

export function isCaffeinateEnabled(config) {
  const field = config?.caffeinateDuringSessions;
  return typeof field?.get === 'function' ? field.get() === true : field === true;
}

export function hasRunningSession(agents) {
  return agents.list().some((agent) => agent.status === 'running');
}

/**
 * Host composition: private sleep routes plus one session-driven OS sleep
 * assertion. Unsupported platforms mount nothing at all; the bundle manifest
 * and patch row already keep them from being selected.
 */
export function apply(ctx, config, internals = {}) {
  const platform = internals.platform ?? process.platform;
  if (!isSupportedPlatform(platform)) {
    ctx.logger?.info?.(
      `[sleep-control] skipped on unsupported platform "${platform}" (supported: darwin, win32)`,
    );
    return;
  }

  const service = internals.sleepService ?? new SleepControlService({ platform });
  const sessionGuard = internals.sessionGuard ?? new SessionSleepGuard({ platform, logger: ctx.logger });
  const reconcile = () => {
    sessionGuard.reconcile(isCaffeinateEnabled(config) && hasRunningSession(ctx.agents));
  };

  // Re-read the registry on every edge instead of maintaining a second count
  // that could drift during Agent creation, replacement, or disposal.
  ctx.on('agent/status', reconcile);
  ctx.on('agent/created', reconcile);
  ctx.on('agent/disposed', reconcile);
  ctx.on('loader/volatile-update', reconcile);

  ctx.effect(() => {
    const dispose = registerRoutes(ctx.webServer, service);
    reconcile();
    ctx.logger?.info?.(`[sleep-control] local sleep routes and session sleep guard ready on ${platform}`);
    return () => {
      dispose();
      service.dispose();
      sessionGuard.dispose();
      ctx.logger?.info?.('[sleep-control] routes released and managed processes aborted');
    };
  }, 'sleep-control: host services');

  // The Client supplies a purpose-built page rather than an auto-generated
  // plugin configuration form. Settings remains an optional Host capability.
  ctx.inject(['settings'], (child) => {
    child.effect(
      () => child.settings.configure({ auto: false }, ctx.fiber),
      'sleep-control: custom settings presentation',
    );
  });
}

export { SessionSleepGuard } from './src/host/session-guard.js';
export { SleepControlService } from './src/host/service.js';
export { registerRoutes } from './src/host/routes.js';
