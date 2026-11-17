import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODEL_INFO_PATH = path.join(PLUGIN_DIR, "src", "client", "model-info.js");
const PANEL_PATH = path.join(PLUGIN_DIR, "src", "client", "panel.js");
const STYLES_PATH = path.join(PLUGIN_DIR, "src", "client", "styles.css");
const OUTPUT_PATH = path.join(PLUGIN_DIR, "lib", "client.js");

function transformModelInfoSource(source) {
  return source.replace(/^export\s+(?=function\s|const\s|let\s)/gm, "").trimEnd();
}

function transformPanelSource(source) {
  let out = source
    .replace(/^import\s+React\s+from\s+"react";\s*\n/m, "")
    .replace(/^import\s+ReactDOM\s+from\s+"react-dom";\s*\n/m, "")
    .replace(/^import\s+\{[\s\S]*?\}\s+from\s+"\.\/model-info\.js";\s*\n/m, "");

  out = out
    .replace(/^export\s+const\s+inject\s*=\s*/gm, "const inject = ")
    .replace(/^export\s+function\s+apply\s*\(/gm, "function apply(");

  return out.trimEnd();
}

export function buildBundleText() {
  const stylesCss = fs.readFileSync(STYLES_PATH, "utf8");
  const modelInfoSrc = transformModelInfoSource(fs.readFileSync(MODEL_INFO_PATH, "utf8"));
  const panelSrc = transformPanelSource(fs.readFileSync(PANEL_PATH, "utf8"));

  return [
    `window.__ModuleLoader__.load({`,
    `  id: "dsh-plugin-subagent-model",`,
    `  factory(require) {`,
    `    const module = { exports: {} };`,
    `    const exports = module.exports;`,
    `    Object.defineProperty(exports, "__esModule", { value: true });`,
    `    const React = require("react");`,
    `    const ReactDOM = require("react-dom");`,
    `    const STYLES = ${JSON.stringify(stylesCss)};`,
    ``,
    indent(modelInfoSrc, 4),
    ``,
    indent(panelSrc, 4),
    ``,
    `    exports.inject = inject;`,
    `    exports.apply = apply;`,
    `    return module.exports;`,
    `  },`,
    `});`,
    ``,
  ].join("\n");
}

function indent(text, spaces) {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? pad + line : ""))
    .join("\n");
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const built = buildBundleText();

  if (checkOnly) {
    if (!fs.existsSync(OUTPUT_PATH)) {
      console.error(`Missing built bundle: ${path.relative(PLUGIN_DIR, OUTPUT_PATH)}`);
      process.exit(1);
    }
    const existing = fs.readFileSync(OUTPUT_PATH, "utf8");
    if (existing !== built) {
      console.error(`Built bundle is out of date: ${path.relative(PLUGIN_DIR, OUTPUT_PATH)}`);
      process.exit(1);
    }
    return;
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, built, "utf8");
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  main();
}
