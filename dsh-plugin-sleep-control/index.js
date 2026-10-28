import { registerRoutes } from './src/host/routes.js';
import { SleepControlService } from './src/host/service.js';

export const inject = ['webServer'];

/** Host composition: one service, two loopback-only routes, no Agent tools. */
export function apply(ctx) {
  const service = new SleepControlService();
  ctx.effect(() => {
    const dispose = registerRoutes(ctx.webServer, service);
    ctx.logger?.info?.('[sleep-control] local pmset routes ready');
    return () => {
      dispose();
      service.dispose();
      ctx.logger?.info?.('[sleep-control] routes released and managed processes aborted');
    };
  }, 'sleep-control: http routes');
}

export { SleepControlService } from './src/host/service.js';
export { registerRoutes } from './src/host/routes.js';
