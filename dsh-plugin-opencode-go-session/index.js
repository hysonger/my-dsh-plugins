import { addSessionHeader } from './src/headers.js';
import { repairProtocol } from './src/repair.js';

export const name = 'opencode-go-session';
export const inject = ['llm'];

export function apply(ctx, config = {}) {
  if (config.repairProtocolOnLoad !== undefined && typeof config.repairProtocolOnLoad !== 'boolean') {
    throw new Error('repairProtocolOnLoad must be a boolean');
  }
  ctx.on('llm-pi-ai/request-headers', (request, headers, next) => {
    addSessionHeader(request, headers);
    return next();
  });
  if (config.repairProtocolOnLoad === true) {
    ctx.inject(['settings', 'configEditor'], child => {
      // Timers created during installation inherit HMR's AsyncLocalStorage and
      // are still nested transactions. Wait for a *new* Host tool outcome instead;
      // its dispatch is outside the install transaction. Do not inspect its data.
      const detach = child.on('tools/result', () => {
        detach();
        // Loader may attach entry metadata after synchronous apply returns.
        void repairProtocol(child, ctx.fiber.entry).catch(error => {
          // Only fixed diagnostic categories may enter logs, never user data.
          const reason = error?.code === 'SETTINGS_CONFLICT' ? 'settings-conflict'
            : error?.message === 'HMR transactions cannot be nested' ? 'hmr-context'
              : 'validation-or-write';
          child.logger.warn(`OpenCode Go one-time protocol repair did not complete (${reason}); inspect the api field and repairProtocolOnLoad flag. No credentials were changed.`);
        });
      });
    });
  }
}
