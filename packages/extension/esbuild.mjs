// Builds two bundles: the extension host (CJS, Node) and the webview (IIFE, browser).
import * as esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");
const dev = watch || process.argv.includes("--dev");

// The engine is bundled from source rather than node-linked. This keeps the
// build independent of workspace symlinks (which some filesystems, e.g. exFAT,
// do not support). See docs/adr/0002-engine-bundling.md.
const engineAlias = { "@driftlens/engine": resolve(here, "../engine/src/index.ts") };

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  sourcemap: dev,
  minify: !dev,
  logLevel: "info",
  alias: engineAlias,
};

/** Extension host — runs in Node, `vscode` is provided by the runtime. */
const extension = {
  ...common,
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode"],
};

/** Webview — runs in a browser context; Cytoscape is bundled in. */
const webview = {
  ...common,
  entryPoints: ["src/webview/main.ts"],
  outfile: "dist/webview.js",
  platform: "browser",
  format: "iife",
  target: "es2020",
};

if (watch) {
  const ctxs = await Promise.all([esbuild.context(extension), esbuild.context(webview)]);
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log("esbuild: watching…");
} else {
  await Promise.all([esbuild.build(extension), esbuild.build(webview)]);
}
