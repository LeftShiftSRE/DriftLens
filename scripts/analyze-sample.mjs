// Analyze examples/sample-repo with the built engine and print a drift report.
// Usage: pnpm --filter @driftlens/engine build && node scripts/analyze-sample.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { analyzeProject, parseConfig } from "../packages/engine/dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "examples", "sample-repo");

/** Recursively collect source files, keyed by POSIX-relative path. */
function collect(dir, root, out) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, root, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      out.set(relative(root, full).replaceAll("\\", "/"), readFileSync(full, "utf8"));
    }
  }
  return out;
}

const files = collect(join(repo, "src"), repo, new Map());
const config = parseConfig(readFileSync(join(repo, ".driftlens.yml"), "utf8"));
const { graph, drift } = analyzeProject(files, { config });

console.log(`\nDriftLens — sample-repo analysis`);
console.log(`────────────────────────────────`);
console.log(`Files analyzed : ${files.size}`);
console.log(`Graph          : ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
console.log(`\nArchitecture Health: ${drift.healthScore}%\n`);

if (drift.events.length === 0) {
  console.log("No drift detected. ✅");
} else {
  const icon = { error: "✗", warning: "!", info: "·" };
  for (const e of drift.events) {
    console.log(`  ${icon[e.severity] ?? "-"} [${e.severity}] ${e.message}`);
    if (e.files?.length) console.log(`      ${e.files.join(", ")}`);
  }
}
console.log();
