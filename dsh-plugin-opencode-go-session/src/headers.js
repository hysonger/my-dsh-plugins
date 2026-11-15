/** No credentials, network, global patches, or session-id cache. */
export const SESSION_HEADER = 'x-opencode-session';

export function isOpenCodeGoRequest(request) {
  if (request?.provider !== 'opencode-go' || typeof request.baseURL !== 'string') return false;
  try {
    const url = new URL(request.baseURL);
    return url.origin === 'https://opencode.ai' && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Match pi-ai's existing-header precedence; leave sessionless calls unchanged. */
export function addSessionHeader(request, headers) {
  if (!isOpenCodeGoRequest(request) || headers.has(SESSION_HEADER)) return headers;
  // A malformed/Unicode/CRLF id must not turn header preparation into a TypeError.
  if (typeof request.sessionId !== 'string' || !/^[\x21-\x7e]{1,512}$/.test(request.sessionId)) return headers;
  headers.set(SESSION_HEADER, request.sessionId);
  return headers;
}
