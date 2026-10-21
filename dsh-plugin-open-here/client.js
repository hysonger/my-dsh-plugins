/**
 * Browser half of dsh-plugin-open-here.
 *
 * Loads immediately with the web GUI (in the desktop App's webview or a plain
 * browser tab alike, thanks to same-origin relative URLs) and waits for open
 * intents from the host half:
 *
 * 1. On boot it drains any pending intent via `GET /open-here/pending` — this
 *    covers "the CLI POSTed while no GUI was connected".
 * 2. It then keeps an `EventSource` on `/open-here/events` for live intents;
 *    the browser reconnects the stream automatically after a reload or
 *    backend restart.
 *
 * Every intent is answered with `ctx.uiWorkspace.openWorkspace(workspaceId)`,
 * the exact call the sidebar's own workspace rows use, so a terminal open is
 * indistinguishable from a click. Intents older than the host TTL plus a
 * margin are dropped, and each intent is handled at most once per client.
 *
 * Hand-written against the module loader contract — this file is served to
 * the browser verbatim, so it must stay dependency-free and free of syntax
 * the loader's `new Function` wrapper would reject.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-open-here',
  factory() {
    var PENDING_URL = '/open-here/pending';
    var EVENTS_URL = '/open-here/events';
    // Host default TTL (5 min) plus a margin for clock skew and in-flight time.
    var MAX_INTENT_AGE_MS = 6 * 60 * 1000;

    return {
      inject: ['uiWorkspace'],
      apply: function (ctx) {
        var log = function (message) {
          try {
            if (ctx.logger && typeof ctx.logger.info === 'function') {
              ctx.logger.info('[open-here] ' + message);
            }
          } catch (error) {
            /* logging must never break navigation */
          }
        };
        var warn = function (message) {
          try {
            console.warn('[open-here] ' + message);
          } catch (error) {
            /* no console in exotic embedders */
          }
        };

        var lastHandledAt = 0;

        var handleIntent = function (intent) {
          if (!intent || typeof intent !== 'object') return;
          var workspaceId = intent.workspaceId;
          var requestedAt = intent.requestedAt;
          if (typeof workspaceId !== 'string' || workspaceId.length === 0) return;
          if (typeof requestedAt !== 'number') return;
          if (requestedAt <= lastHandledAt) return;
          if (Date.now() - requestedAt > MAX_INTENT_AGE_MS) {
            log('dropped stale intent for ' + intent.path);
            return;
          }
          lastHandledAt = requestedAt;
          Promise.resolve()
            .then(function () {
              return ctx.uiWorkspace.openWorkspace(workspaceId);
            })
            .then(function () {
              log('opened workspace ' + workspaceId + ' (' + intent.path + ')');
            })
            .catch(function (error) {
              warn('openWorkspace(' + workspaceId + ') failed: ' + error);
            });
        };

        // Boot drain: an intent that arrived while no GUI was connected.
        fetch(PENDING_URL, { cache: 'no-store', credentials: 'same-origin' })
          .then(function (response) {
            if (!response.ok) return null;
            return response.json();
          })
          .then(function (body) {
            if (body && body.intent) handleIntent(body.intent);
          })
          .catch(function () {
            /* host half absent or restarting; the stream below keeps trying */
          });

        // Live intents. EventSource reconnects by itself on transient errors.
        try {
          var source = new EventSource(EVENTS_URL);
          source.onmessage = function (event) {
            try {
              handleIntent(JSON.parse(event.data));
            } catch (error) {
              warn('unparseable intent frame: ' + error);
            }
          };
        } catch (error) {
          warn('EventSource unavailable: ' + error);
        }
      },
    };
  },
});
