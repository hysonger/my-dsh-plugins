import z from '@deepseek-ai/schemastery';

import { CaffeinateService } from './src/host/caffeinate.js';
import { registerRoutes } from './src/host/routes.js';
import { SleepControlService } from './src/host/service.js';

export const inject = ['webServer', 'agents'];

/** Live, user-editable session-scoped sleep prevention. */
export const Config = z.object({
  caffeinateDuringSessions: z.boolean().default(false).volatile(),
});

export function isCaffeinateEnabled(config) {
  const field = config?.caffeinateDuringSessions;
  return typeof field?.get === 'function' ? field.get() === true : field === true;
}

export function hasRunningSession(agents) {
  return agents.list().some((agent) => agent.status === 'running');
}

/** Host composition: private pmset routes plus one session-driven caffeinate. */
export function apply(ctx, config, internals = {}) {
  const service = internals.sleepService ?? new SleepControlService();
  const caffeinate = internals.caffeinate ?? new CaffeinateService({ logger: ctx.logger });
  const reconcile = () => {
    caffeinate.reconcile(isCaffeinateEnabled(config) && hasRunningSession(ctx.agents));
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
    ctx.logger?.info?.('[sleep-control] local pmset routes and session sleep guard ready');
    return () => {
      dispose();
      service.dispose();
      caffeinate.dispose();
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

export { CaffeinateService } from './src/host/caffeinate.js';
export { SleepControlService } from './src/host/service.js';
export { registerRoutes } from './src/host/routes.js';
