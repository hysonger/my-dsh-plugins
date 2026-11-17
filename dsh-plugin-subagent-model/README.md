# dsh-plugin-subagent-model

A lightweight DeepSeek Harness (DSH) UI plugin that displays read-only model information in the input bar for continuable subagent sessions.

## Background

In upstream DeepSeek Harness, `@deepseek-ai/dsh-client-ui-model-selection` marks `available = sessions.subagentAddress(sessionId) === undefined`, so the native composer model selector (`ModelSelect`) renders nothing on all subagent sessions because subagent models cannot be switched mid-session.

This plugin restores model visibility on continuable subagent sessions (both in the main conversation view and in the right-sidebar subagent chat view) by rendering a native-styled, read-only model indicator in the `conversation.input.right` composer slot.

## Behavior

- **Scope**: Active whenever `sessions.subagentAddress(sessionId) !== undefined` inside `conversation.input.right` (`order: 200`, sitting after `dsh-plugin-usage-board` if both are installed and immediately before the send button). Root sessions stay completely untouched.
- **Model selection source**: Reads the `modelSelection` session projection (`projection.lastUsed ?? projection.next`).
  - Once the subagent records at least one model request (`request/header`), `lastUsed` reflects the exact `provider`, `model`, and explicit `reasoningEffort` executed by the subagent.
  - Before the first request completes, it falls back to `next` (`pending`), or displays a subtle loading indicator while the subagent is actively running.
- **Display resolution**: Subscribes passively to `directory.store` (`modelDirectories.directoryFor(sessionId)`) — with a passive `remote.session.modelCatalog()` fallback when needed — to resolve provider display names, localized model names, badges, and reasoning effort labels, without calling restricted `directory.load()` / `directory.select()`. Falls back to raw IDs if the model is absent from the active catalog.
- **Read-only details popover**: Clicking the pill opens a floating details card showing Provider, Model Name, raw Model ID, Reasoning Effort, and a brief explanation noting why subagent models cannot be switched mid-session.
- **Responsive compact mode**: Follows DSH composer CSS variables (`--dsh-composer-model-icon-display` / `--dsh-composer-model-text-display`) when the toolbar enters narrow `data-model-compact` mode.

## Limitations

- `one-shot` / `unknown` read-only subagents replace the composer bar with `SubagentReadOnlyComposer`, which intentionally omits `conversation.input.*` slots.
- For freshly spawned `continuable` subagents before their first `request/header` event persists, exact model metadata may briefly show a loading state until the first request begins.

## Development & Verification

```sh
# Rebuild lib/client.js from src/client/*
npm --prefix dsh-plugin-subagent-model run build:client

# Verify bundle freshness and run unit + contract tests
npm --prefix dsh-plugin-subagent-model run check
```

## Installation

### As part of the `my-dsh-plugins` bundle (recommended)

Already wired into the root [package.json](../package.json) `dependencies` and `dsh.bundle.patch`.

### Standalone local installation

```sh
dsh plugin --profile desktop add "$PWD/dsh-plugin-subagent-model"
```
