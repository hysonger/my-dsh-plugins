/**
 * Host half of dsh-plugin-mermaid.
 *
 * The plugin is presentation-only: the Client half observes settled assistant
 * Markdown and renders Mermaid fences locally. There is no Host API, RPC,
 * credential access, or persisted state.
 */

/** Keep the bundle loadable without adding a Host-side service. */
export function apply() {}
