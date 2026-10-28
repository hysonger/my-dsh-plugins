window.__ModuleLoader__.load({
  id: 'dsh-plugin-sleep-control',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'sleepControl';
    const STATUS_PATH = '/sleep-control/api/status';
    const SET_PATH = '/sleep-control/api/set';

    const zh = {
      label: '防睡眠',
      description: '阻止 macOS 系统睡眠；切换时需要管理员授权',
      loading: '正在读取系统睡眠设置…',
      waiting: '正在等待 macOS 管理员授权…',
      enabled: '已阻止系统睡眠',
      disabled: '允许系统睡眠',
      cancelled: '已取消授权，系统设置未更改。',
      retry: '重试',
      unsupported: '此功能仅支持 macOS。',
      statusUnavailable: '无法读取 SleepDisabled 状态，请重试。',
      busy: '另一次切换正在等待授权。',
      commandFailed: '管理员命令执行失败，请重试。',
      verificationFailed: '无法确认系统设置是否已更改，请重试。',
      networkFailed: '无法连接本机 DSH 服务。',
      requestFailed: '操作失败，请重试。',
    };

    const en = {
      label: 'Keep awake',
      description: 'Prevent macOS system sleep; administrator authorization is required',
      loading: 'Reading the macOS sleep setting…',
      waiting: 'Waiting for macOS administrator authorization…',
      enabled: 'System sleep is disabled',
      disabled: 'System sleep is allowed',
      cancelled: 'Authorization cancelled. The system setting was not changed.',
      retry: 'Retry',
      unsupported: 'This feature is available only on macOS.',
      statusUnavailable: 'Unable to read SleepDisabled. Try again.',
      busy: 'Another change is already waiting for authorization.',
      commandFailed: 'The privileged command failed. Try again.',
      verificationFailed: 'The resulting system setting could not be verified. Try again.',
      networkFailed: 'Unable to reach the local DSH service.',
      requestFailed: 'The operation failed. Try again.',
    };

    const CSS = `
.sc-control {
  appearance: none;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 4px 6px;
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
  white-space: nowrap;
}
.sc-control:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-2);
}
.sc-control:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
.sc-control:disabled { opacity: 0.58; cursor: not-allowed; }
.sc-control[data-busy="true"] { cursor: progress; }
.sc-icon { width: 16px; height: 16px; flex: 0 0 auto; }
.sc-track {
  position: relative;
  box-sizing: border-box;
  width: 28px;
  height: 16px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--dsw-alias-state-idle-primary);
  transition: background 120ms ease;
}
.sc-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-base);
  transition: transform 120ms ease;
}
.sc-control[aria-checked="true"] .sc-track {
  background: var(--dsw-alias-state-success-primary);
}
.sc-control[aria-checked="true"] .sc-thumb { transform: translateX(12px); }
.sc-status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 3px 2px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.sc-status[data-tone="error"] { color: var(--dsw-alias-state-error-primary); }
.sc-status[data-tone="cancelled"] { color: var(--dsw-alias-label-secondary); }
.sc-retry {
  appearance: none;
  border: 0;
  border-radius: 6px;
  padding: 1px 5px;
  background: transparent;
  color: var(--dsw-alias-brand-primary);
  font: inherit;
  cursor: pointer;
}
.sc-retry:hover { background: var(--dsw-alias-bg-layer-2); }
.sc-retry:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
@media (max-width: 680px) {
  .sc-label { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .sc-track, .sc-thumb { transition: none; }
}
`;

    function clientError(code, message) {
      const error = new Error(message || code);
      error.clientCode = code;
      return error;
    }

    /**
     * Shared page-local state. The system setting is global, so every mounted
     * composer sees the same operation instead of maintaining divergent copies.
     * Kept export-visible for dependency-free unit tests.
     */
    function createSleepController(request) {
      let state = {
        phase: 'loading',
        sleepDisabled: null,
        notice: null,
      };
      let operation = 0;
      let disposed = false;
      const listeners = new Set();

      function publish(patch) {
        if (disposed) return;
        state = { ...state, ...patch };
        for (const listener of listeners) listener(state);
      }

      async function refresh() {
        if (disposed) return;
        const id = ++operation;
        publish({ phase: 'loading', notice: null });
        try {
          const result = await request('status');
          if (disposed || id !== operation) return;
          publish({
            phase: 'ready',
            sleepDisabled: result.sleepDisabled,
            notice: null,
          });
        } catch (error) {
          if (disposed || id !== operation) return;
          const code = error.clientCode || 'network-error';
          publish({
            phase: code === 'unsupported' ? 'unsupported' : 'error',
            sleepDisabled: null,
            notice: code,
          });
        }
      }

      async function setSleepDisabled(sleepDisabled) {
        if (
          disposed ||
          state.phase === 'busy' ||
          state.phase === 'loading' ||
          state.phase === 'unsupported' ||
          state.sleepDisabled === null ||
          typeof sleepDisabled !== 'boolean'
        ) return;
        const previous = state.sleepDisabled;
        const id = ++operation;
        publish({ phase: 'busy', notice: null });
        let failure = null;
        try {
          const result = await request('set', { sleepDisabled });
          if (disposed || id !== operation) return;
          publish({
            phase: 'ready',
            sleepDisabled: result.sleepDisabled,
            notice: null,
          });
          return;
        } catch (error) {
          failure = error;
        }

        // A failed response is ambiguous: re-read once before deciding what the
        // switch should show. Cancellation is the one known no-change case.
        let verified = null;
        try {
          verified = await request('status');
        } catch {
          // The original operation error remains the useful message.
        }
        if (disposed || id !== operation) return;
        const code = failure.clientCode || 'network-error';
        const cancelled = code === 'cancelled';
        publish({
          phase: cancelled ? 'cancelled' : code === 'unsupported' ? 'unsupported' : 'error',
          sleepDisabled: verified
            ? verified.sleepDisabled
            : cancelled
              ? previous
              : null,
          notice: code,
        });
      }

      return {
        getState: () => state,
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        refresh,
        setSleepDisabled,
        dispose() {
          disposed = true;
          operation += 1;
          listeners.clear();
        },
      };
    }

    function useSleepState(controller) {
      const [state, setState] = React.useState(controller.getState());
      React.useEffect(() => {
        const unsubscribe = controller.subscribe((next) => setState(next));
        setState(controller.getState());
        return unsubscribe;
      }, [controller]);
      return state;
    }

    function messageKey(code) {
      const keys = {
        cancelled: 'cancelled',
        unsupported: 'unsupported',
        'status-unavailable': 'statusUnavailable',
        busy: 'busy',
        'command-failed': 'commandFailed',
        'verification-failed': 'verificationFailed',
        'network-error': 'networkFailed',
      };
      return keys[code] || 'requestFailed';
    }

    function MoonIcon() {
      return h(
        'svg',
        {
          className: 'sc-icon',
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': true,
        },
        h('path', {
          d: 'M15.2 3.3A8.8 8.8 0 1 0 20.7 17 9.4 9.4 0 0 1 15.2 3.3Z',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinejoin: 'round',
        }),
      );
    }

    /** Owns the in-memory mutation token and all request cancellation. */
    function createSleepRequest(fetchImpl = fetch) {
      const aborters = new Set();
      let disposed = false;
      let mutationToken = null;

      async function request(kind, payload) {
        if (disposed) throw clientError('network-error', 'The Client has been unloaded.');
        if (kind === 'set' && typeof mutationToken !== 'string') {
          throw clientError('request-failed', 'Read the current sleep state before changing it.');
        }
        const abort = new AbortController();
        aborters.add(abort);
        const timeout = kind === 'status'
          ? setTimeout(() => abort.abort(), 10000)
          : null;
        try {
          const response = await fetchImpl(kind === 'status' ? STATUS_PATH : SET_PATH, {
            method: kind === 'status' ? 'GET' : 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: kind === 'set'
              ? {
                  'content-type': 'application/json',
                  'x-dsh-sleep-control-token': mutationToken,
                }
              : undefined,
            body: kind === 'set' ? JSON.stringify(payload) : undefined,
            signal: abort.signal,
          });
          const body = await response.json().catch(() => null);
          if (!response.ok || !body || body.ok !== true) {
            throw clientError(
              body && body.error && typeof body.error.code === 'string'
                ? body.error.code
                : 'request-failed',
              body && body.error && body.error.message,
            );
          }
          if (typeof body.sleepDisabled !== 'boolean') {
            throw clientError('request-failed', 'The Host returned an invalid sleep state.');
          }
          if (kind === 'status') {
            if (typeof body.mutationToken !== 'string' || body.mutationToken.length === 0) {
              throw clientError('request-failed', 'The Host returned no mutation token.');
            }
            mutationToken = body.mutationToken;
          }
          return body;
        } catch (error) {
          if (error && error.clientCode) throw error;
          throw clientError('network-error', error instanceof Error ? error.message : String(error));
        } finally {
          if (timeout !== null) clearTimeout(timeout);
          aborters.delete(abort);
        }
      }

      return {
        request,
        dispose() {
          disposed = true;
          mutationToken = null;
          for (const abort of aborters) abort.abort();
          aborters.clear();
        },
      };
    }

    /** Cordis Client entry. */
    function apply(ctx) {
      const t = ctx.locale.bind(NS);
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'sleep-control: dictionaries');
      const transport = createSleepRequest();
      const controller = createSleepController(transport.request);

      function SleepSwitch() {
        const state = useSleepState(controller);
        const checked = state.sleepDisabled === true;
        const busy = state.phase === 'busy';
        const disabled =
          state.sleepDisabled === null ||
          busy ||
          state.phase === 'loading' ||
          state.phase === 'unsupported';
        const stateText = busy
          ? t('waiting')
          : state.phase === 'loading'
            ? t('loading')
            : state.sleepDisabled === null
              ? t(messageKey(state.notice))
              : checked
                ? t('enabled')
                : t('disabled');
        return h(
          React.Fragment,
          null,
          h('style', null, CSS),
          h(
            'button',
            {
              type: 'button',
              className: 'sc-control',
              role: 'switch',
              'aria-checked': checked,
              'aria-label': t('description'),
              'aria-busy': busy,
              'data-busy': String(busy),
              disabled,
              title: `${t('description')}\n${stateText}`,
              onClick: () => {
                void controller.setSleepDisabled(!checked);
              },
            },
            h(MoonIcon),
            h('span', { className: 'sc-label' }, t('label')),
            h(
              'span',
              { className: 'sc-track', 'aria-hidden': true },
              h('span', { className: 'sc-thumb' }),
            ),
          ),
        );
      }

      function SleepStatus() {
        const state = useSleepState(controller);
        if (state.phase === 'ready') return null;
        const busy = state.phase === 'busy';
        const loading = state.phase === 'loading';
        const text = busy
          ? t('waiting')
          : loading
            ? t('loading')
            : t(messageKey(state.notice));
        const tone = state.phase === 'error' || state.phase === 'unsupported'
          ? 'error'
          : state.phase;
        return h(
          'div',
          {
            className: 'sc-status',
            'data-tone': tone,
            role: tone === 'error' ? 'alert' : 'status',
          },
          h('style', null, CSS),
          h('span', null, text),
          state.phase === 'error'
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'sc-retry',
                  onClick: () => {
                    void controller.refresh();
                  },
                },
                t('retry'),
              )
            : null,
        );
      }

      ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
        name: 'conversation.input.right',
        id: 'sleep-control',
        order: 0,
        locale: NS,
      }, SleepSwitch));
      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock',
        id: 'sleep-control-status',
        order: 10,
        locale: NS,
      }, SleepStatus));

      ctx.effect(() => {
        void controller.refresh();
        return () => {
          controller.dispose();
          transport.dispose();
        };
      }, 'sleep-control: initial status and cleanup');
    }

    return {
      inject: ['slots', 'locale'],
      apply,
      createSleepController,
      createSleepRequest,
    };
  },
});
