/**
 * Build (or verify) `src/client/protocol-copy.js` and `lib/client.js` from source files:
 *   - `src/shared/protocol.js` -> `src/client/protocol-copy.js`
 *   - `src/client/styles.css`
 *   - `src/client/protocol-copy.js`
 *   - `src/client/panel.js`
 *
 * Usage:
 *   node scripts/build-client.mjs
 *   node scripts/build-client.mjs --check
 *
 * @module dsh-plugin-git-log/scripts/build-client
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHARED_PATH = join(ROOT, "src/shared/protocol.js");
const PROTOCOL_COPY_PATH = join(ROOT, "src/client/protocol-copy.js");
const CSS_PATH = join(ROOT, "src/client/styles.css");
const PANEL_PATH = join(ROOT, "src/client/panel.js");
const BUNDLE_PATH = join(ROOT, "lib/client.js");

/**
 * Strip ES module `export ` modifiers from `src/shared/protocol.js` so the same
 * constants and pure helpers can live inside the `__ModuleLoader__` factory.
 *
 * @param {string} sharedSource
 * @returns {string}
 */
export function deriveProtocolCopy(sharedSource) {
  const banner = [
    "// GENERATED FROM src/shared/protocol.js by scripts/build-client.mjs — do not edit directly.",
    "",
  ].join("\n");
  const stripped = sharedSource
    .replace(/^export (const|function) /gm, "$1 ");
  return banner + stripped;
}

/**
 * Assemble the complete `lib/client.js` text deterministically.
 *
 * @returns {{ protocolCopy: string, bundle: string }}
 */
export function buildBundleText() {
  const shared = readFileSync(SHARED_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  const panel = readFileSync(PANEL_PATH, "utf8");

  if (css.includes("`") || css.includes("${")) {
    throw new Error("src/client/styles.css contains a backtick or '${', which cannot be embedded verbatim");
  }

  const protocolCopy = deriveProtocolCopy(shared);

  const bundle = [
    `/**`,
    ` * dsh-plugin-git-log — DSH Web client-module bundle.`,
    ` *`,
    ` * ASSEMBLED FROM (and checked by scripts/build-client.mjs --check):`,
    ` *   - src/client/styles.css`,
    ` *   - src/client/protocol-copy.js (derived from src/shared/protocol.js)`,
    ` *   - src/client/panel.js`,
    ` */`,
    ``,
    `window.__ModuleLoader__.load({`,
    `  id: "dsh-plugin-git-log",`,
    `  factory: (require) => {`,
    `    var module = { exports: {} };`,
    `    var exports = module.exports;`,
    `    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });`,
    ``,
    `    const react = require("react");`,
    ``,
    `    //#region src/client/styles.css — embedded verbatim`,
    `    const GIT_LOG_CSS = \`${css}\`;`,
    `    //#endregion`,
    ``,
    `    //#region src/client/protocol-copy.js — embedded verbatim`,
    protocolCopy.trimEnd(),
    `    //#endregion`,
    ``,
    `    //#region src/client/panel.js — embedded verbatim`,
    panel.trimEnd(),
    `    //#endregion`,
    ``,
    `    return module.exports;`,
    `  },`,
    `});`,
    ``,
  ].join("\n");

  return { protocolCopy, bundle };
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const { protocolCopy, bundle } = buildBundleText();

  if (checkOnly) {
    let existingCopy = "";
    let existingBundle = "";
    try {
      existingCopy = readFileSync(PROTOCOL_COPY_PATH, "utf8");
    } catch {
      existingCopy = "";
    }
    try {
      existingBundle = readFileSync(BUNDLE_PATH, "utf8");
    } catch {
      existingBundle = "";
    }
    if (existingCopy !== protocolCopy) {
      console.error("src/client/protocol-copy.js is out of date. Run `npm run build`.");
      process.exit(1);
    }
    if (existingBundle !== bundle) {
      console.error("lib/client.js is out of date. Run `npm run build`.");
      process.exit(1);
    }
    console.log("Client bundle is up to date.");
    return;
  }

  writeFileSync(PROTOCOL_COPY_PATH, protocolCopy, "utf8");
  writeFileSync(BUNDLE_PATH, bundle, "utf8");
  console.log("Built src/client/protocol-copy.js and lib/client.js.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
