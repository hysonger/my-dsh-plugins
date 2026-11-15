import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadClient() {
  let loader;
  const window = { __ModuleLoader__: { load: (value) => void (loader = value) } };
  vm.runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), { window });
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  };
  return loader.factory((name) => {
    assert.equal(name, 'react');
    return react;
  });
}

function text(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join(' ');
  return `${text(node.props?.children)} ${text(node.children)}`;
}

function walk(node, visit) {
  if (node === null || node === undefined || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  visit(node);
  walk(node.props?.children, visit);
  walk(node.children, visit);
}

function links(node, out = []) {
  walk(node, (element) => {
    if (element.type === 'a') out.push(element.props.href);
  });
  return out;
}

function findByClass(node, className) {
  let found;
  walk(node, (element) => {
    if (found === undefined && typeof element.props?.className === 'string' && element.props.className.split(' ').includes(className)) found = element;
  });
  return found;
}

function mounted() {
  const client = loadClient();
  const registrations = new Map();
  const dictionaries = {};
  const effects = [];
  const ctx = {
    effect(callback) {
      effects.push(callback());
    },
    locale: {
      register(namespace, locale, dict) {
        dictionaries[locale] = dict;
        return () => undefined;
      },
    },
    slots: {
      inject(_name, callback) {
        for (const _registration of callback()) {
          // Iterating executes the yields and therefore both registrations.
        }
      },
      register(options, component) {
        registrations.set(options.key, { options, component });
        return () => registrations.delete(options.key);
      },
    },
  };
  client.apply(ctx);
  return { registrations, dictionaries, effects, ctx };
}

function t(key, params = {}) {
  return Object.entries(params).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), key);
}

const disclosure = (expanded) => () => ({ expanded, toggle: () => undefined });

test('client registers keyed Kimi tool views and balanced locale dictionaries', () => {
  const { registrations, dictionaries } = mounted();
  assert.deepEqual([...registrations.keys()].sort(), ['kimi_web_fetch', 'kimi_web_search']);
  assert.deepEqual(Object.keys(dictionaries.en).sort(), Object.keys(dictionaries.zh).sort());
  for (const { options } of registrations.values()) {
    assert.equal(options.name, 'tool.call.toolview');
    assert.equal(options.locale, 'kimi-web');
  }
});

test('search renderer produces a source card with safe external links', () => {
  const { registrations } = mounted();
  const Row = registrations.get('kimi_web_search').component;
  const tree = Row({
    phase: 'result',
    toolName: 'kimi_web_search',
    block: {
      call: { argsRaw: JSON.stringify({ queries: ['query'] }) },
      meta: {
        sources: [{ url: 'https://example.com', title: 'Example', snippet: 'Snippet', publishedAt: 'today' }],
        truncated: false,
      },
      content: [{ type: 'text', text: 'result' }],
      isError: false,
    },
    useDisclosure: disclosure(true),
    t,
  });
  const rendered = text(tree);
  assert.match(rendered, /searchTitle/);
  assert.match(rendered, /Example/);
  assert.match(rendered, /Snippet/);
  assert.match(rendered, /sources · 1/);
  assert.deepEqual(links(tree), ['https://example.com']);
  const sourceLink = findByClass(tree, 'kimi-web-tool__source-title');
  assert.equal(sourceLink.props.target, '_blank');
  assert.equal(sourceLink.props.rel, 'noopener noreferrer');
});

test('row mirrors the host disclosure: title, separator dot, and summary', () => {
  const { registrations } = mounted();
  const Row = registrations.get('kimi_web_search').component;
  const tree = Row({
    phase: 'result',
    toolName: 'kimi_web_search',
    block: {
      call: { argsRaw: JSON.stringify({ queries: ['alpha', 'beta'] }) },
      meta: { sources: [] },
      content: [{ type: 'text', text: 'result' }],
      isError: false,
    },
    useDisclosure: disclosure(false),
    t,
  });
  const title = findByClass(tree, 'kimi-web-tool__title');
  const separator = findByClass(tree, 'kimi-web-tool__sep');
  const summary = findByClass(tree, 'kimi-web-tool__summary');
  assert.equal(text(title).trim(), 'searchTitle');
  assert.equal(separator.props['aria-hidden'], 'true');
  assert.equal(text(summary).trim(), 'alpha, beta');
  const row = findByClass(tree, 'kimi-web-tool__row');
  assert.equal(row.props.role, 'button');
  assert.equal(row.props.tabIndex, 0);
  assert.equal(row.props['aria-expanded'], false);
  assert.equal(row.props['data-expandable'], 'true');
  assert.equal(findByClass(tree, 'kimi-web-tool__glyph').props.className, 'kimi-web-tool__glyph');
  assert.equal(findByClass(tree, 'kimi-web-tool__body'), undefined);
});

test('fetch renderer distinguishes Kimi API status from target status', () => {
  const { registrations } = mounted();
  const Row = registrations.get('kimi_web_fetch').component;
  const tree = Row({
    phase: 'result',
    toolName: 'kimi_web_fetch',
    block: {
      call: { argsRaw: JSON.stringify({ url: 'https://example.com' }) },
      meta: { url: 'https://example.com', statusCode: 200, truncated: false },
      content: [{ type: 'text', text: 'Markdown body' }],
      isError: false,
    },
    useDisclosure: disclosure(true),
    t: (key, params = {}) => {
      const value = Object.entries(params).reduce((acc, [name, v]) => acc.replace(`{${name}}`, String(v)), key);
      return value === 'apiStatus' ? `Kimi API HTTP ${params.status}; target status unavailable` : value;
    },
  });
  const rendered = text(tree);
  assert.match(rendered, /Kimi API HTTP 200/);
  assert.match(rendered, /target status unavailable/);
  assert.match(rendered, /Markdown body/);
  assert.deepEqual(links(tree), ['https://example.com']);
});

test('preparing and error stages remain bounded text views', () => {
  const { registrations } = mounted();
  const Row = registrations.get('kimi_web_fetch').component;
  const preparing = Row({
    phase: 'preparing', toolName: 'kimi_web_fetch', block: { argsRaw: '{"url":' },
    useDisclosure: disclosure(true), t,
  });
  const preparingRow = findByClass(preparing, 'kimi-web-tool__row');
  assert.equal(preparingRow.props.role, undefined);
  assert.equal(preparingRow.props['aria-expanded'], undefined);
  assert.equal(findByClass(preparing, 'kimi-web-tool__body'), undefined);
  assert.equal(findByClass(preparing, 'kimi-web-tool__summary'), undefined);

  const failure = Row({
    phase: 'result', toolName: 'kimi_web_fetch',
    block: {
      call: { argsRaw: '{"url":"http://127.0.0.1"}' }, meta: {}, isError: true,
      content: [{ type: 'text', text: 'Error: blocked' }],
    },
    useDisclosure: disclosure(true), t,
  });
  assert.match(text(failure), /Error: blocked/);
  assert.equal(findByClass(failure, 'kimi-web-tool__output').props['data-error'], 'true');
  const failureSummary = findByClass(failure, 'kimi-web-tool__summary');
  assert.equal(failureSummary.props['data-error'], 'true');
  assert.equal(text(failureSummary).trim(), 'Error: blocked');
});
