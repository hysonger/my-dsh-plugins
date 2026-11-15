window.__ModuleLoader__.load({
  id: 'dsh-plugin-kimi-web-search',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const DICTS = {
      en: {
        searchTitle: 'Kimi web search',
        fetchTitle: 'Kimi web fetch',
        sources: 'Sources',
        noResults: 'No results found.',
        input: 'Input',
        apiStatus: 'Kimi API HTTP {status}; target status not reported',
        truncated: 'Content truncated',
      },
      zh: {
        searchTitle: 'Kimi 网页搜索',
        fetchTitle: 'Kimi 网页抓取',
        sources: '来源',
        noResults: '未找到结果。',
        input: '输入',
        apiStatus: 'Kimi API HTTP {status}；目标页面状态未知',
        truncated: '内容已截断',
      },
    };

    /**
     * Glyph geometry follows the harness 16px icon grid: viewBox 16, stroke 1,
     * currentColor. Search and page reuse the shipped web_search/web_fetch
     * shapes so a Kimi row reads as the same family as every other tool row.
     */
    const GLYPHS = {
      search: [
        { d: 'M6.58727 11.8586C9.55061 11.8586 11.9529 9.45637 11.9529 6.49304C11.9529 3.5297 9.55061 1.12744 6.58727 1.12744C3.62394 1.12744 1.22168 3.5297 1.22168 6.49304C1.22168 9.45637 3.62394 11.8586 6.58727 11.8586Z' },
        { d: 'M10.2991 10.3933L14.7783 14.8725' },
      ],
      fetch: [
        { d: 'M4.9375 5.90295H11.0625' },
        { d: 'M4.9375 9.02991H8.27841' },
        {
          d: 'M12.5 1.32617C13.3039 1.32617 14 1.95171 14 2.77637V13.2246C13.9996 14.0489 13.3036 14.6738 12.5 14.6738H3.5C2.69637 14.6738 2.00042 14.0489 2 13.2246V2.77637C2 1.95171 2.69613 1.32617 3.5 1.32617H12.5ZM3.5 2.32617C3.1993 2.32617 3 2.55186 3 2.77637V13.2246C3.00044 13.4489 3.19963 13.6738 3.5 13.6738H12.5C12.8004 13.6738 12.9996 13.4489 13 13.2246V2.77637C13 2.55186 12.8007 2.32617 12.5 2.32617H3.5Z',
          fill: true,
        },
      ],
      chevronDown: [{ d: 'M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6' }],
      chevronUp: [{ d: 'M12 10L8.70711 6.70711C8.31658 6.31658 7.68342 6.31658 7.29289 6.70711L4 10' }],
    };

    /**
     * Row metrics mirror the shipped DisclosureRow and ToolRow modules: a 24px
     * line at the secondary content size, a 16px leading box holding a 14px
     * glyph, tertiary label color with a secondary hover, and the 2px separator
     * dot between title and summary.
     */
    const CSS = `
.kimi-web-tool{display:flex;flex-direction:column;width:100%;min-width:0;color:var(--dsw-alias-label-tertiary)}
.kimi-web-tool__header{display:flex;align-items:center;min-width:0}
.kimi-web-tool__row{position:relative;display:flex;align-items:center;flex:1 1 auto;min-width:0;height:calc(24px + var(--dsh-content-font-delta,0px));overflow:hidden;color:inherit}
.kimi-web-tool__row[data-expandable=true]{cursor:pointer}
@media (hover:hover){.kimi-web-tool__row:hover{color:var(--dsw-alias-label-secondary)}}
.kimi-web-tool__leading{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:none;width:calc(16px + var(--dsh-content-font-delta,0px));height:calc(16px + var(--dsh-content-font-delta,0px));margin-right:6px;color:inherit}
.kimi-web-tool__leading svg{width:calc(14px + var(--dsh-content-font-delta,0px));height:calc(14px + var(--dsh-content-font-delta,0px))}
.kimi-web-tool__glyph{display:inline-flex;opacity:1;transition:opacity .1s ease}
.kimi-web-tool__chevron{position:absolute;inset:0;margin:auto;opacity:0;transition:opacity .1s ease}
.kimi-web-tool__open{display:inline-flex}
@media (hover:hover){
.kimi-web-tool__row:hover .kimi-web-tool__glyph{opacity:0}
.kimi-web-tool__row:hover .kimi-web-tool__chevron{opacity:1}
}
.kimi-web-tool__content{display:flex;align-items:center;flex:1 1 auto;min-width:0;overflow:hidden;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px))}
.kimi-web-tool__title{flex:none;font-weight:400}
.kimi-web-tool__sep{flex:none;width:2px;height:2px;margin:0 8px;border-radius:1px;background:var(--dsw-alias-label-caption)}
.kimi-web-tool__summary{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kimi-web-tool__summary[data-error=true]{color:var(--dsw-alias-state-error-primary)}
.kimi-web-tool__body{margin:4px 0 4px 4px;padding:12px 14px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-markdown-code-block);color:var(--dsw-alias-label-primary);max-height:320px;overflow:auto}
.kimi-web-tool__meta{font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-tertiary);margin-bottom:8px}
.kimi-web-tool__sources{display:flex;flex-direction:column;gap:10px;margin:0;padding-left:2.5em}
.kimi-web-tool__source{min-width:0}
.kimi-web-tool__source-title{color:var(--dsw-alias-link);font-size:14px;font-weight:500;line-height:20px;word-break:break-word;text-decoration:none}
@media (hover:hover){.kimi-web-tool__source-title:hover{text-decoration:underline dotted;text-underline-offset:3px}}
.kimi-web-tool__snippet{margin-top:2px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:19px;word-break:break-word}
.kimi-web-tool__published{margin-top:2px;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xs-13)}
.kimi-web-tool__fetch{display:flex;flex-direction:column;gap:6px}
.kimi-web-tool__fetch-url{color:var(--dsw-alias-link);font-family:var(--ds-font-family-code);font-size:13px;font-weight:500;line-height:19px;word-break:break-all;text-decoration:none}
@media (hover:hover){.kimi-web-tool__fetch-url:hover{text-decoration:underline dotted;text-underline-offset:3px}}
.kimi-web-tool__status{color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xs-13)}
.kimi-web-tool__output{margin:0;font-size:13px;line-height:19px;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-secondary)}
.kimi-web-tool__fetch+.kimi-web-tool__output{margin-top:8px}
.kimi-web-tool__output[data-error=true]{color:var(--dsw-alias-state-error-primary)}
.kimi-web-tool__empty{color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xs-13)}
`;

    const STYLE_TAG = 'dsh-plugin-kimi-web-search/tool-card.css';

    function installStyles() {
      if (typeof document === 'undefined' || document.querySelector(`style[data-plugin-css="${STYLE_TAG}"]`) !== null) return () => undefined;
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-plugin-kimi-web-search';
      tag.dataset.pluginCss = STYLE_TAG;
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return () => tag.remove();
    }

    function Glyph({ name, className }) {
      const glyph = GLYPHS[name];
      return h('svg', {
        className,
        width: 14,
        height: 14,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1,
        'aria-hidden': 'true',
        focusable: 'false',
      }, glyph.map((shape, index) => h('path', {
        key: index,
        d: shape.d,
        fill: shape.fill === true ? 'currentColor' : 'none',
        stroke: shape.fill === true ? 'none' : 'currentColor',
      })));
    }

    function resultText(block) {
      if (!Array.isArray(block?.content)) return '';
      return block.content.filter((part) => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('\n');
    }

    function argsRaw(props) {
      if (props.phase === 'result') return props.block.call?.argsRaw ?? '';
      return props.block?.argsRaw ?? '';
    }

    function parsedArgs(props) {
      try {
        const value = JSON.parse(argsRaw(props));
        return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
      } catch {
        return {};
      }
    }

    /** The summary stays empty while arguments stream, matching the shipped generic rows. */
    function summary(props) {
      if (props.phase === 'preparing') return '';
      const args = parsedArgs(props);
      if (props.toolName === 'kimi_web_search' && Array.isArray(args.queries)) {
        return args.queries.filter((query) => typeof query === 'string' && query !== '').join(', ');
      }
      if (typeof args.url === 'string' && args.url !== '') return args.url;
      return argsRaw(props).trim();
    }

    function textOrNull(value) {
      return typeof value === 'string' && value !== '' ? value : null;
    }

    /** Failed rows lead with the first meaningful output line, as the shipped rows do. */
    function firstLine(value) {
      const line = value.split(/\r?\n/).find((part) => part.trim() !== '');
      return line === undefined ? '' : line.trim();
    }

    function sourceItems(meta) {
      return Array.isArray(meta.sources) ? meta.sources.filter((source) => source !== null && typeof source === 'object') : [];
    }

    function searchBody(meta, t) {
      const sources = sourceItems(meta);
      const metaLine = [`${t('sources')} · ${sources.length}`];
      if (meta.truncated === true) metaLine.push(t('truncated'));
      const body = [h('div', { className: 'kimi-web-tool__meta', key: 'meta' }, metaLine.join(' · '))];
      if (sources.length === 0) {
        body.push(h('div', { className: 'kimi-web-tool__empty', key: 'empty' }, t('noResults')));
        return body;
      }
      body.push(h('ol', { className: 'kimi-web-tool__sources', key: 'sources' }, sources.map((source, index) =>
        h('li', { className: 'kimi-web-tool__source', key: `${source.url ?? ''}-${index}` },
          h('a', {
            className: 'kimi-web-tool__source-title',
            href: source.url,
            target: '_blank',
            rel: 'noopener noreferrer',
          }, textOrNull(source.title) ?? source.url),
          textOrNull(source.snippet) === null ? null : h('div', { className: 'kimi-web-tool__snippet' }, source.snippet),
          textOrNull(source.publishedAt) === null ? null : h('div', { className: 'kimi-web-tool__published' }, source.publishedAt)))));
      return body;
    }

    function fetchBody(props, meta, output, t) {
      const args = parsedArgs(props);
      const url = textOrNull(meta.url) ?? textOrNull(args.url);
      const body = [h('div', { className: 'kimi-web-tool__fetch', key: 'fetch' },
        url === null ? null : h('a', {
          className: 'kimi-web-tool__fetch-url',
          href: url,
          target: '_blank',
          rel: 'noopener noreferrer',
        }, url),
        typeof meta.statusCode === 'number' ? h('div', { className: 'kimi-web-tool__status' }, t('apiStatus', { status: meta.statusCode })) : null)];
      if (output !== '') body.push(h('pre', { className: 'kimi-web-tool__output', key: 'output' }, output));
      return body;
    }

    function cardBody(props, meta, output, t) {
      if (props.phase !== 'result') {
        return [
          h('div', { className: 'kimi-web-tool__meta', key: 'label' }, t('input')),
          h('pre', { className: 'kimi-web-tool__output', key: 'input' }, argsRaw(props)),
        ];
      }
      if (props.block.isError) {
        return [h('pre', { className: 'kimi-web-tool__output', key: 'error', 'data-error': 'true' }, output)];
      }
      return props.toolName === 'kimi_web_search' ? searchBody(meta, t) : fetchBody(props, meta, output, t);
    }

    function KimiToolRow(props) {
      const { expanded, toggle } = props.useDisclosure();
      const { block, phase, toolName, t } = props;
      const search = toolName === 'kimi_web_search';
      const title = t(search ? 'searchTitle' : 'fetchTitle');
      const meta = phase === 'result' && block.meta !== null && typeof block.meta === 'object' ? block.meta : {};
      const output = phase === 'result' ? resultText(block) : '';
      const isError = phase === 'result' && block.isError === true;
      const errorSummary = isError ? firstLine(output) : '';
      const summaryText = errorSummary === '' ? summary(props) : errorSummary;
      const expandable = phase !== 'preparing';
      const open = expandable && expanded;

      const onKeyDown = (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggle();
      };

      const leading = open
        ? h(Glyph, { name: 'chevronUp', className: 'kimi-web-tool__open' })
        : [
            h(Glyph, { key: 'glyph', name: search ? 'search' : 'fetch', className: 'kimi-web-tool__glyph' }),
            expandable ? h(Glyph, { key: 'chevron', name: 'chevronDown', className: 'kimi-web-tool__chevron' }) : null,
          ];

      return h('section', { className: 'kimi-web-tool', 'data-kimi-web-card': toolName, 'data-phase': phase },
        h('div', { className: 'kimi-web-tool__header' },
          h('div', {
            className: 'kimi-web-tool__row',
            role: expandable ? 'button' : undefined,
            tabIndex: expandable ? 0 : undefined,
            'data-expandable': expandable ? 'true' : undefined,
            'aria-expanded': expandable ? open : undefined,
            onClick: expandable ? toggle : undefined,
            onKeyDown: expandable ? onKeyDown : undefined,
          },
            h('span', { className: 'kimi-web-tool__leading' }, leading),
            h('span', { className: 'kimi-web-tool__content' },
              h('span', { className: 'kimi-web-tool__title' }, title),
              summaryText === '' ? null : h('span', { className: 'kimi-web-tool__sep', 'aria-hidden': 'true' }),
              summaryText === '' ? null : h('span', {
                className: 'kimi-web-tool__summary',
                'data-error': isError ? 'true' : undefined,
              }, summaryText)))),
        open ? h('div', { className: 'kimi-web-tool__body' }, cardBody(props, meta, output, t)) : null);
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const disposers = [
            installStyles(),
            ctx.locale.register('kimi-web', 'en', DICTS.en),
            ctx.locale.register('kimi-web', 'zh', DICTS.zh),
          ];
          return () => disposers.forEach((dispose) => dispose());
        }, 'kimi-web-search: client locale and card styles');
        ctx.slots.inject('tool.call.toolview', function* () {
          yield ctx.slots.register({ name: 'tool.call.toolview', key: 'kimi_web_search', locale: 'kimi-web' }, KimiToolRow);
          yield ctx.slots.register({ name: 'tool.call.toolview', key: 'kimi_web_fetch', locale: 'kimi-web' }, KimiToolRow);
        });
      },
    };
  },
});
