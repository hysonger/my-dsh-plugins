/**
 * Pure runtime helpers for serial Mermaid work and pre-layout safety checks.
 * Keeping these functions DOM-free makes them testable without emulating a
 * browser or the Harness React tree.
 */

export const MAX_SOURCE_CHARS = 64 * 1024

/**
 * Serialize tasks so Mermaid's process-global configuration and layout queue
 * cannot be initialized by two diagrams at once.
 *
 * @template T
 * @returns {(task: () => Promise<T>) => Promise<T>}
 */
export function createSerialQueue() {
  let tail = Promise.resolve()
  return (task) => {
    const run = tail.then(task)
    tail = run.catch(() => { /* The caller owns this task's rejection. */ })
    return run
  }
}

/**
 * Mermaid's strict security mode does not prevent flowchart image nodes from
 * fetching resources during layout. Reject them before calling `render`.
 *
 * @param {{ type?: string, db?: any }} diagram
 * @returns {void}
 */
export function assertSafeMermaidDiagram(diagram) {
  if (diagram === null || typeof diagram !== 'object' || typeof diagram.type !== 'string') {
    throw new Error('Mermaid did not return a diagram type')
  }
  if (!diagram.type.startsWith('flowchart')) return

  const db = diagram.db
  const vertices = db?.getVertices?.()
  if (vertices === undefined || typeof vertices.values !== 'function') {
    // A future Mermaid version could change its internal DB. Fail closed: a
    // source block is always preferable to an uninspected network-capable node.
    throw new Error('Unable to inspect Mermaid flowchart nodes')
  }
  for (const vertex of vertices.values()) {
    if (vertex?.img !== undefined) throw new Error('Mermaid image nodes are not supported')
  }
}

/**
 * Validate a source before any Mermaid work.
 * @param {string} source
 * @returns {void}
 */
export function assertMermaidSource(source) {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new Error('Mermaid source is empty')
  }
  if (source.length > MAX_SOURCE_CHARS) {
    throw new Error('Mermaid source is too large')
  }
}
