window.__ModuleLoader__.load({
  id: 'dsh-plugin-sleep-control',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'sleepControl';
    const ENTRY_ID = 'sleep-control';
    const STATUS_PATH = '/sleep-control/api/status';
    const SET_PATH = '/sleep-control/api/set';

    const zh = {
      nav: '防睡眠',
      title: '防睡眠',
      intro: '管理 macOS 与 Windows 系统睡眠。以下两种方式彼此独立；“完全关闭睡眠”仅支持 macOS。',
      caffeinateLabel: '会话运行时防睡眠',
      caffeinateHelp: '使用 caffeinate -s，仅在有会话运行时生效。开盖时可阻止睡眠；合盖时只有接入电源才有效，电池供电且合盖时不生效。',
      windowsSessionHelp: '通过 Windows 执行状态请求（SetThreadExecutionState）在会话运行期间阻止系统空闲睡眠；辅助进程结束即自动恢复。屏幕仍可能关闭，合盖或手动睡眠等显式操作不会被阻止。',
      caffeinateEnabled: '已开启：有会话运行时将自动保持系统唤醒。',
      caffeinateDisabled: '开启后，将在会话运行期间自动阻止系统睡眠。',
      label: '完全关闭睡眠',
      description: '通过 pmset 完全关闭 macOS 系统睡眠；切换时需要管理员授权',
      fullSleepHelp: '效果最强，但 pmset 修改的是全局持久电源设置。退出 DSH 后仍然有效；忘记改回可能导致系统异常耗电。',
      persistentUnsupported: '“完全关闭睡眠”仅支持 macOS，当前平台不可用。',
      persistentUnsupportedHelp: '此方式依赖 macOS 的 pmset；Windows 不提供等效的持久化禁用睡眠。',
      warning: '警告',
      persistent: '全局持久生效',
      loading: '正在读取系统电源设置…',
      waiting: '正在等待 macOS 管理员授权…',
      enabled: '已完全关闭系统睡眠',
      disabled: '允许系统睡眠',
      cancelled: '已取消授权，系统设置未更改。',
      retry: '重试',
      unsupported: '此功能在当前平台不受支持。',
      statusUnavailable: '无法读取 SleepDisabled 状态，请重试。',
      busy: '另一次切换正在等待授权。',
      commandFailed: '管理员命令执行失败，请重试。',
      verificationFailed: '无法确认系统设置是否已更改，请重试。',
      networkFailed: '无法连接本机 DSH 服务。',
      requestFailed: '操作失败，请重试。',
      saving: '正在保存设置…',
      saveFailed: '设置未保存，请重试。',
      unavailable: '防睡眠配置当前不可用。',
      readOnly: '当前部署的设置为只读。',
    };

    const en = {
      nav: 'Sleep Control',
      title: 'Sleep Control',
      intro: 'Manage system sleep on macOS and Windows. The two methods below are independent; "Disable sleep completely" is available only on macOS.',
      caffeinateLabel: 'Prevent sleep while sessions run',
      caffeinateHelp: 'Uses caffeinate -s only while a session is running. It works with the lid open; with the lid closed, it works only while connected to power, not on battery.',
      windowsSessionHelp: 'Uses a Windows execution-state request (SetThreadExecutionState) to block idle system sleep while sessions run; the request ends with the helper process. The display may still turn off, and explicit actions such as closing the lid or choosing Sleep are not blocked.',
      caffeinateEnabled: 'Enabled: system sleep is prevented automatically whenever a session is running.',
      caffeinateDisabled: 'When enabled, system sleep is prevented automatically while sessions run.',
      label: 'Disable sleep completely',
      description: 'Disable macOS system sleep with pmset; administrator authorization is required',
      fullSleepHelp: 'This is the strongest method, but pmset changes a global, persistent power setting. It remains active after DSH exits; forgetting to restore it may cause abnormal battery drain.',
      persistentUnsupported: '"Disable sleep completely" is available only on macOS and is not supported on this platform.',
      persistentUnsupportedHelp: 'This method relies on the macOS pmset utility; Windows has no equivalent persistent sleep disable.',
      warning: 'Warning',
      persistent: 'Global and persistent',
      loading: 'Reading the system power settings…',
      waiting: 'Waiting for macOS administrator authorization…',
      enabled: 'System sleep is completely disabled',
      disabled: 'System sleep is allowed',
      cancelled: 'Authorization cancelled. The system setting was not changed.',
      retry: 'Retry',
      unsupported: 'This feature is not supported on the current platform.',
      statusUnavailable: 'Unable to read SleepDisabled. Try again.',
      busy: 'Another change is already waiting for authorization.',
      commandFailed: 'The privileged command failed. Try again.',
      verificationFailed: 'The resulting system setting could not be verified. Try again.',
      networkFailed: 'Unable to reach the local DSH service.',
      requestFailed: 'The operation failed. Try again.',
      saving: 'Saving the setting…',
      saveFailed: 'The setting was not saved. Try again.',
      unavailable: 'Sleep-control configuration is currently unavailable.',
      readOnly: 'This deployment stores settings read-only.',
    };

    const CSS = `
.sc-page {
  box-sizing: border-box;
  max-width: 760px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  color: var(--dsw-alias-label-primary);
}
.sc-heading { margin: 0; font-size: 18px; font-weight: 600; line-height: 26px; }
.sc-intro { margin: -6px 0 2px; color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 20px; }
.sc-card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
}
.sc-card--warning {
  border-color: var(--dsw-alias-state-warning-primary, var(--dsw-alias-state-error-primary));
  background: var(--dsw-alias-bg-layer-1);
  background: color-mix(in srgb, var(--dsw-alias-state-warning-primary, var(--dsw-alias-state-error-primary)) 7%, var(--dsw-alias-bg-layer-1));
}
.sc-card--warning[data-active="true"] {
  box-shadow: 0 0 0 1px var(--dsw-alias-state-warning-primary, var(--dsw-alias-state-error-primary));
}
.sc-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.sc-title-wrap { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; min-width: 0; }
.sc-title { margin: 0; font-size: 14px; font-weight: 600; line-height: 22px; }
.sc-warning-icon { width: 17px; height: 17px; flex: 0 0 auto; color: var(--dsw-alias-state-warning-primary, var(--dsw-alias-state-error-primary)); }
.sc-badge {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 1px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-alias-state-warning-primary, var(--dsw-alias-state-error-primary)) 14%, transparent);
  color: var(--dsw-alias-state-warning-primary, var(--dsw-alias-state-error-primary));
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
}
.sc-help { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 20px; }
.sc-card--warning .sc-help { color: var(--dsw-alias-label-primary); }
.sc-status { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-height: 18px; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.sc-status[data-tone="error"] { color: var(--dsw-alias-state-error-primary); }
.sc-status[data-tone="warning"] { color: var(--dsw-alias-state-warning-primary, var(--dsw-alias-state-error-primary)); }
.sc-toggle {
  appearance: none;
  box-sizing: border-box;
  position: relative;
  flex: 0 0 auto;
  width: 36px;
  height: 22px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--dsw-alias-state-idle-primary);
  cursor: pointer;
  transition: background 120ms ease;
}
.sc-toggle::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-base);
  box-shadow: 0 1px 2px rgb(0 0 0 / 18%);
  transition: transform 120ms ease;
}
.sc-toggle[aria-checked="true"] { background: var(--dsw-alias-state-success-primary); }
.sc-toggle[aria-checked="true"]::after { transform: translateX(14px); }
.sc-card--warning .sc-toggle[aria-checked="true"] { background: var(--dsw-alias-state-warning-primary, var(--dsw-alias-state-error-primary)); }
.sc-toggle:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 3px; }
.sc-toggle:disabled { opacity: 0.5; cursor: not-allowed; }
.sc-toggle[data-busy="true"] { cursor: progress; }
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
.sc-retry:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
@media (prefers-reduced-motion: reduce) {
  .sc-toggle, .sc-toggle::after { transition: none; }
}
`;

    function clientError(code, message) {
      const error = new Error(message || code);
      error.clientCode = code;
      return error;
    }

    /** Host capabilities reported with every status read. */
    function capabilitiesOf(result) {
      return {
        platform: typeof result.platform === 'string' ? result.platform : null,
        persistentSleep: result.persistentSleep === true,
      };
    }

    /**
     * Presentation keys for the two cards. An unknown capability (first load or
     * a failed first read) must not be presented as "unsupported": only a
     * Host-verified `persistentSleep: false` may claim the card is unavailable,
     * and help text is withheld until the Host has answered once.
     */
    function sleepPresentation(state) {
      const persistentUnsupported = state.persistentSleep === false;
      return {
        persistentUnsupported,
        persistentSupported: state.persistentSleep === true,
        sessionHelpKey:
          state.platform === 'win32'
            ? 'windowsSessionHelp'
            : state.platform === 'darwin'
              ? 'caffeinateHelp'
              : null,
        persistentHelpKey: persistentUnsupported
          ? 'persistentUnsupportedHelp'
          : state.persistentSleep === true
            ? 'fullSleepHelp'
            : null,
      };
    }

    /** Page-local pmset state, shared by every mount of the settings section. */
    function createSleepController(request) {
      let state = {
        phase: 'loading',
        platform: null,
        persistentSleep: null,
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
            ...capabilitiesOf(result),
            sleepDisabled: typeof result.sleepDisabled === 'boolean' ? result.sleepDisabled : null,
            notice: null,
          });
        } catch (error) {
          if (disposed || id !== operation) return;
          const code = error.clientCode || 'network-error';
          // Keep the last Host-verified capability: a failed read does not mean
          // the platform changed. The initial nulls already mean "unknown".
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
          state.persistentSleep !== true ||
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
          publish({ phase: 'ready', sleepDisabled: result.sleepDisabled, notice: null });
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
          ...verified ? capabilitiesOf(verified) : {},
          sleepDisabled: verified
            ? (typeof verified.sleepDisabled === 'boolean' ? verified.sleepDisabled : null)
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

    /** Accepted configForms value plus local save progress; never optimistic. */
    function createCaffeinatePreference(scope) {
      let saving = false;
      let notice = null;
      let disposed = false;
      const listeners = new Set();
      const publish = () => {
        if (disposed) return;
        const snapshot = getState();
        for (const listener of listeners) listener(snapshot);
      };
      const unsubscribe = scope.subscribe(publish);

      function getState() {
        return { ...scope.getSnapshot(), saving, notice };
      }

      async function setEnabled(enabled) {
        const snapshot = scope.getSnapshot();
        if (
          disposed ||
          saving ||
          typeof enabled !== 'boolean' ||
          snapshot.status !== 'ready' ||
          !snapshot.writable ||
          snapshot.value?.caffeinateDuringSessions === enabled
        ) return false;
        saving = true;
        notice = null;
        publish();
        let accepted = false;
        try {
          accepted = await scope.set('caffeinateDuringSessions', enabled) === true;
        } catch {
          accepted = false;
        }
        if (disposed) return accepted;
        saving = false;
        notice = accepted ? null : 'save-failed';
        publish();
        return accepted;
      }

      return {
        getState,
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        setEnabled,
        dispose() {
          if (disposed) return;
          disposed = true;
          unsubscribe();
          listeners.clear();
        },
      };
    }

    function useStore(store) {
      const [state, setState] = React.useState(store.getState());
      React.useEffect(() => {
        const unsubscribe = store.subscribe((next) => setState(next));
        setState(store.getState());
        return unsubscribe;
      }, [store]);
      return state;
    }

    function messageKey(code) {
      const keys = {
        cancelled: 'cancelled',
        unsupported: 'unsupported',
        'persistent-unsupported': 'persistentUnsupported',
        'status-unavailable': 'statusUnavailable',
        busy: 'busy',
        'command-failed': 'commandFailed',
        'verification-failed': 'verificationFailed',
        'network-error': 'networkFailed',
      };
      return keys[code] || 'requestFailed';
    }

    function sleepStatusText(state, t) {
      if (state.phase === 'busy') return t('waiting');
      if (state.phase === 'loading') return t('loading');
      if (state.phase === 'ready') {
        if (state.persistentSleep === false) return t('persistentUnsupported');
        return t(state.sleepDisabled === true ? 'enabled' : 'disabled');
      }
      return t(messageKey(state.notice));
    }

    function WarningIcon() {
      return h(
        'svg',
        {
          className: 'sc-warning-icon',
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': true,
        },
        h('path', {
          d: 'M10.3 4.1 2.8 17.2A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.8L13.7 4.1a2 2 0 0 0-3.4 0Z',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinejoin: 'round',
        }),
        h('path', { d: 'M12 9v4', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }),
        h('circle', { cx: 12, cy: 16.5, r: 1, fill: 'currentColor' }),
      );
    }

    function Toggle({ checked, disabled, busy, label, describedBy, onChange }) {
      return h('button', {
        type: 'button',
        className: 'sc-toggle',
        role: 'switch',
        'aria-checked': checked,
        'aria-label': label,
        'aria-describedby': describedBy,
        'aria-busy': busy,
        'data-busy': String(busy),
        disabled,
        onClick: () => onChange(!checked),
      });
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
        const timeout = kind === 'status' ? setTimeout(() => abort.abort(), 10000) : null;
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
          if (kind === 'set') {
            if (typeof body.sleepDisabled !== 'boolean') {
              throw clientError('request-failed', 'The Host returned an invalid sleep state.');
            }
            return body;
          }
          if (body.platform !== 'darwin' && body.platform !== 'win32') {
            throw clientError('request-failed', 'The Host returned an unsupported platform.');
          }
          if (typeof body.persistentSleep !== 'boolean') {
            throw clientError('request-failed', 'The Host returned an invalid sleep capability.');
          }
          if (body.persistentSleep) {
            if (typeof body.sleepDisabled !== 'boolean') {
              throw clientError('request-failed', 'The Host returned an invalid sleep state.');
            }
          } else if (body.sleepDisabled !== null) {
            throw clientError('request-failed', 'The Host returned an inconsistent sleep state.');
          }
          if (typeof body.mutationToken !== 'string' || body.mutationToken.length === 0) {
            throw clientError('request-failed', 'The Host returned no mutation token.');
          }
          mutationToken = body.mutationToken;
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
      const preference = createCaffeinatePreference(ctx.configForms.get(ENTRY_ID));

      function SleepControlSection() {
        const sleep = useStore(controller);
        const config = useStore(preference);
        React.useEffect(() => {
          void controller.refresh();
        }, []);

        const unsupported = sleep.phase === 'unsupported';
        const {
          persistentUnsupported,
          persistentSupported,
          sessionHelpKey,
          persistentHelpKey,
        } = sleepPresentation(sleep);
        const sessionHelp = sessionHelpKey === null ? null : t(sessionHelpKey);
        const persistentHelp = persistentHelpKey === null ? null : t(persistentHelpKey);
        const fullChecked = sleep.sleepDisabled === true;
        const fullBusy = sleep.phase === 'busy';
        const fullDisabled =
          !persistentSupported ||
          sleep.sleepDisabled === null ||
          fullBusy ||
          sleep.phase === 'loading' ||
          unsupported;
        const fullText = sleepStatusText(sleep, t);
        const fullTone = sleep.phase === 'error' || unsupported ? 'error' : sleep.phase;

        const caffeinateChecked = config.value?.caffeinateDuringSessions === true;
        const configBusy = config.saving;
        const configDisabled =
          unsupported ||
          configBusy ||
          config.status !== 'ready' ||
          !config.writable;
        const configText = unsupported
          ? t('unsupported')
          : configBusy
            ? t('saving')
            : config.notice === 'save-failed'
              ? t('saveFailed')
              : config.status === 'unavailable'
                ? t('unavailable')
                : config.status !== 'ready'
                  ? t('loading')
                  : !config.writable
                    ? t('readOnly')
                    : caffeinateChecked
                      ? t('caffeinateEnabled')
                      : t('caffeinateDisabled');

        return h(
          'section',
          { className: 'sc-page', 'aria-labelledby': 'sc-page-title' },
          h('style', null, CSS),
          h('h2', { className: 'sc-heading', id: 'sc-page-title' }, t('title')),
          h('p', { className: 'sc-intro' }, t('intro')),
          h(
            'section',
            { className: 'sc-card', 'aria-labelledby': 'sc-caffeinate-title' },
            h(
              'div',
              { className: 'sc-card-head' },
              h('h3', { className: 'sc-title', id: 'sc-caffeinate-title' }, t('caffeinateLabel')),
              h(Toggle, {
                checked: caffeinateChecked,
                disabled: configDisabled,
                busy: configBusy,
                label: t('caffeinateLabel'),
                describedBy: sessionHelp === null ? undefined : 'sc-caffeinate-help',
                onChange: (enabled) => {
                  void preference.setEnabled(enabled);
                },
              }),
            ),
            sessionHelp === null
              ? null
              : h('p', { className: 'sc-help', id: 'sc-caffeinate-help' }, sessionHelp),
            h(
              'div',
              {
                className: 'sc-status',
                'data-tone': config.notice || unsupported ? 'error' : 'status',
                role: config.notice || unsupported ? 'alert' : 'status',
              },
              h('span', null, configText),
            ),
          ),
          h(
            'section',
            {
              className: persistentUnsupported ? 'sc-card' : 'sc-card sc-card--warning',
              'data-active': String(persistentSupported && fullChecked),
              'aria-labelledby': 'sc-full-sleep-title',
            },
            h(
              'div',
              { className: 'sc-card-head' },
              h(
                'div',
                { className: 'sc-title-wrap' },
                persistentUnsupported ? null : h(WarningIcon),
                h('h3', { className: 'sc-title', id: 'sc-full-sleep-title' }, t('label')),
                persistentUnsupported ? null : h('span', { className: 'sc-badge' }, t('warning')),
                persistentSupported && fullChecked
                  ? h('span', { className: 'sc-badge' }, t('persistent'))
                  : null,
              ),
              h(Toggle, {
                checked: fullChecked,
                disabled: fullDisabled,
                busy: fullBusy,
                label: t('description'),
                describedBy: persistentHelp === null ? undefined : 'sc-full-sleep-help',
                onChange: (disabled) => {
                  void controller.setSleepDisabled(disabled);
                },
              }),
            ),
            persistentHelp === null
              ? null
              : h('p', { className: 'sc-help', id: 'sc-full-sleep-help' }, persistentHelp),
            h(
              'div',
              {
                className: 'sc-status',
                'data-tone': fullTone,
                role: fullTone === 'error' ? 'alert' : 'status',
              },
              h('span', null, fullText),
              sleep.phase === 'error'
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
            ),
          ),
        );
      }

      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: ENTRY_ID,
        order: 5,
        label: () => t('nav'),
        locale: NS,
      }, SleepControlSection));

      ctx.effect(() => () => {
        preference.dispose();
        controller.dispose();
        transport.dispose();
      }, 'sleep-control: cleanup');
    }

    return {
      inject: ['slots', 'locale', 'configForms'],
      apply,
      createSleepController,
      createCaffeinatePreference,
      createSleepRequest,
      sleepPresentation,
      sleepStatusText,
    };
  },
});
