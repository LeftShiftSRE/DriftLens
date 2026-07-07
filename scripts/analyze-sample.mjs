// Analyze examples/sample-repo with the built engine and print a drift report
// plus the doc/ADR graph (SPEC-018).
// Usage: pnpm --filter @driftlens/engine build && node scripts/analyze-sample.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { analyzeProject, createQuery, parseConfig } from "../packages/engine/dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "examples", "sample-repo");

/** Recursively collect files matching `test`, keyed by POSIX-relative path. */
function collect(dir, root, test, out) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, root, test, out);
    } else if (test(entry)) {
      out.set(relative(root, full).replaceAll("\\", "/"), readFileSync(full, "utf8"));
    }
  }
  return out;
}

// Code + Markdown live in one map; analyzeProject routes .md files to doc ingestion.
const files = collect(repo, repo, (e) => /\.(ts|tsx|js|jsx|md)$/.test(e), new Map());
const codeCount = [...files.keys()].filter((p) => /\.(ts|tsx|js|jsx)$/.test(p)).length;
const config = parseConfig(readFileSync(join(repo, ".driftlens.yml"), "utf8"));
const { graph, unified, drift } = analyzeProject(files, { config });
const q = createQuery(unified);

console.log(`\nDriftLens — sample-repo analysis`);
console.log(`────────────────────────────────`);
console.log(`Code files     : ${codeCount}`);
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

// ── Documentation graph (SPEC-018) ──
const documents = q.nodesByKind("document");
const adrs = q.nodesByKind("adr");
const references = unified.edges.filter((e) => e.type === "references");
const decidedBy = unified.edges.filter((e) => e.type === "decided_by");

console.log(`\nDocumentation`);
console.log(`─────────────`);
console.log(`Documents : ${documents.length}   ADRs : ${adrs.length}`);
console.log(`Edges     : ${references.length} references, ${decidedBy.length} decided_by\n`);

for (const doc of documents) {
  const refs = q.edgesOf(doc.id, { edgeType: "references", direction: "out" });
  console.log(`  📄 ${doc.label}  (${doc.source.path})`);
  for (const r of refs) console.log(`      → references ${r.to.replace(/^module:/, "")}`);
}

for (const adr of adrs) {
  const status = adr.data?.status ? ` [${adr.data.status}]` : "";
  console.log(`  📐 ${adr.label}${status}  (${adr.source.path})`);
}

console.log(`\nDecisions by component`);
console.log(`──────────────────────`);
for (const svc of config.services) {
  const decisions = q.decisionsFor(svc.name);
  if (decisions.length === 0) continue;
  for (const adr of decisions) {
    console.log(`  ${adr.label}  →  ${svc.name}`);
  }
}
console.log();
