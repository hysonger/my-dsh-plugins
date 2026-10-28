import { randomBytes, timingSafeEqual } from 'node:crypto';

export const ROUTE_PREFIX = '/sleep-control/api';
export const STATUS_PATH = `${ROUTE_PREFIX}/status`;
export const SET_PATH = `${ROUTE_PREFIX}/set`;
export const MUTATION_HEADER = 'x-dsh-sleep-control-token';

const MAX_BODY_BYTES = 1024;
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export function isLoopbackAddress(address) {
  if (typeof address !== 'string' || address.length === 0) return false;
  let normalized = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1);
  }
  return normalized === '::1' || normalized === '127.0.0.1' || normalized.startsWith('127.');
}

export function isAllowedOrigin(origin, hostOrigin) {
  if (typeof origin !== 'string' || origin.length === 0 || origin === 'null') return false;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === 'dsh-app:') return parsed.host === 'app';
    return parsed.origin === new URL(hostOrigin).origin;
  } catch {
    return false;
  }
}

function isValidMutationToken(provided, expected) {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const presented = Buffer.from(provided, 'utf8');
  const required = Buffer.from(expected, 'utf8');
  return presented.length === required.length && timingSafeEqual(presented, required);
}

function sendJson(req, res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...JSON_HEADERS,
    'content-length': Buffer.byteLength(body),
  });
  if (req.method === 'HEAD') res.end();
  else res.end(body);
}

function sendError(req, res, status, code, message) {
  sendJson(req, res, status, { ok: false, error: { code, message } });
}

function allowMethod(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.writeHead(405, { ...JSON_HEADERS, allow: methods.join(', ') });
  res.end(JSON.stringify({ ok: false, error: { code: 'bad-request', message: 'Method not allowed.' } }));
  return false;
}

function allowPeer(req, res) {
  if (isLoopbackAddress(req.socket?.remoteAddress)) return true;
  sendError(req, res, 403, 'forbidden', 'Sleep control is restricted to local DSH clients.');
  return false;
}

function allowMutation(req, res, hostOrigin, mutationToken) {
  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite !== undefined && fetchSite !== 'same-origin') {
    sendError(req, res, 403, 'forbidden', 'Cross-site sleep-control requests are not allowed.');
    return false;
  }
  // Desktop strips Origin and Sec-Fetch-Site while forwarding, but preserves
  // this custom header. Cross-origin pages cannot obtain the token through SOP
  // nor attach a custom header without a successful CORS preflight.
  if (!isValidMutationToken(req.headers[MUTATION_HEADER], mutationToken)) {
    sendError(req, res, 403, 'forbidden', 'A valid DSH sleep-control token is required.');
    return false;
  }
  const origin = req.headers.origin;
  if (origin !== undefined && !isAllowedOrigin(origin, hostOrigin)) {
    sendError(req, res, 403, 'forbidden', 'The request Origin is not the DSH GUI.');
    return false;
  }
  const contentType = String(req.headers['content-type'] ?? '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    sendError(req, res, 400, 'bad-request', 'Content-Type must be application/json.');
    return false;
  }
  return true;
}

class SleepControlRouteError extends Error {
  constructor(code, message, closeConnection = false) {
    super(message);
    this.code = code;
    this.closeConnection = closeConnection;
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    const cleanup = () => {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
    };
    const fail = (error) => {
      cleanup();
      req.resume();
      reject(error);
    };
    const onData = (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        fail(new SleepControlRouteError('bad-request', 'Request body is too large.', true));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new SleepControlRouteError('bad-request', 'Request body must be valid JSON.'));
      }
    };
    const onError = () => {
      fail(new SleepControlRouteError('bad-request', 'Request body could not be read.'));
    };
    req.on('data', onData);
    req.once('end', onEnd);
    req.once('error', onError);
  });
}

function statusForError(code) {
  if (code === 'bad-request') return 400;
  if (code === 'forbidden') return 403;
  if (code === 'busy' || code === 'cancelled') return 409;
  if (code === 'unsupported') return 501;
  if (code === 'status-unavailable') return 503;
  return 500;
}

const SAFE_ERROR_MESSAGES = {
  'bad-request': 'The request is invalid.',
  forbidden: 'The request is not authorized.',
  busy: 'Another sleep-setting change is already in progress.',
  cancelled: 'Administrator authorization was cancelled.',
  unsupported: 'Sleep control is available only on macOS.',
  'command-failed': 'The privileged pmset command failed.',
  'verification-failed': 'The resulting SleepDisabled value could not be verified.',
  'status-unavailable': 'Unable to read macOS power settings.',
  disposed: 'Sleep control has been unloaded.',
};

function sendServiceError(req, res, error) {
  const code = typeof error?.code === 'string' && SAFE_ERROR_MESSAGES[error.code]
    ? error.code
    : 'command-failed';
  sendError(req, res, statusForError(code), code, SAFE_ERROR_MESSAGES[code]);
}

function closeAfterResponse(req, res) {
  req.resume();
  res.once('finish', () => {
    if (!req.destroyed) req.destroy();
  });
}

/** Register the two plugin-private routes and return their combined disposer. */
export function registerRoutes(webServer, service, options = {}) {
  const mutationToken = options.mutationToken ?? randomBytes(32).toString('hex');

  const handleStatus = async (req, res) => {
    if (!allowMethod(req, res, ['GET', 'HEAD']) || !allowPeer(req, res)) return;
    try {
      const status = await service.getStatus();
      sendJson(req, res, 200, { ok: true, ...status, mutationToken });
    } catch (error) {
      sendServiceError(req, res, error);
    }
  };

  const handleSet = async (req, res) => {
    if (!allowMethod(req, res, ['POST']) || !allowPeer(req, res)) return;
    if (!allowMutation(req, res, webServer.getOrigin(), mutationToken)) return;
    const declaredLength = Number(req.headers['content-length']);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      closeAfterResponse(req, res);
      sendError(req, res, 400, 'bad-request', 'Request body is too large.');
      return;
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      if (error.closeConnection) closeAfterResponse(req, res);
      sendServiceError(req, res, error);
      return;
    }
    if (
      body === null ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      typeof body.sleepDisabled !== 'boolean' ||
      Object.keys(body).length !== 1
    ) {
      sendError(req, res, 400, 'bad-request', 'Body must contain only a boolean sleepDisabled field.');
      return;
    }
    try {
      const status = await service.setSleepDisabled(body.sleepDisabled);
      sendJson(req, res, 200, { ok: true, ...status });
    } catch (error) {
      sendServiceError(req, res, error);
    }
  };

  const disposers = [];
  try {
    disposers.push(webServer.register({ kind: 'exact', path: STATUS_PATH, handler: handleStatus }));
    disposers.push(webServer.register({ kind: 'exact', path: SET_PATH, handler: handleSet }));
  } catch (error) {
    for (const dispose of disposers.splice(0)) dispose();
    throw error;
  }
  return () => {
    for (const dispose of disposers.splice(0)) dispose();
  };
}
