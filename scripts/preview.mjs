// Generate a self-contained, offline HTML preview of the sample repo's
// architecture diagram — same coloring and drift overlay as the VS Code webview.
// Usage: pnpm --filter @driftlens/engine build && node scripts/preview.mjs
// Then open examples/sample-repo/preview.html in any browser.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { analyzeProject, parseConfig } from "../packages/engine/dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repo = join(root, "examples", "sample-repo");

function collect(dir, base, out) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, base, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry))
      out.set(relative(base, full).replaceAll("\\", "/"), readFileSync(full, "utf8"));
  }
  return out;
}

const files = collect(join(repo, "src"), repo, new Map());
const config = parseConfig(readFileSync(join(repo, ".driftlens.yml"), "utf8"));
const { graph, drift } = analyzeProject(files, { config });

// Mirror the webview's element construction (component color + drift overlay).
const PALETTE = ["#3794ff", "#2ec4b6", "#e07b39", "#b388eb", "#f2c14e", "#4cb944", "#ef476f", "#06b6d4"];
const serviceColor = (s) => {
  if (!s) return "#3794ff";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
};
const serviceOfFile = drift.serviceOfFile;
const violating = new Set(drift.violatingEdges);
const nodes = graph.nodes.filter((n) => n.type === "file" || n.type === "external");
const nodeIds = new Set(nodes.map((n) => n.id));

const origin = new Set();
const affected = new Set();
const edgeEls = [];
for (const e of graph.edges) {
  if (e.type !== "import" || !nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
  const from = serviceOfFile[e.source] ?? null;
  const to = serviceOfFile[e.target] ?? null;
  const isDrift = from && to && from !== to && violating.has(`${from}->${to}`);
  if (isDrift) { origin.add(e.source); affected.add(e.target); }
  edgeEls.push({ data: { id: e.id, source: e.source, target: e.target, drift: String(!!isDrift) } });
}
const nodeEls = nodes.map((n) => ({
  data: {
    id: n.id,
    label: n.label,
    type: n.type,
    drift: origin.has(n.id) ? "origin" : affected.has(n.id) ? "affected" : "none",
    color: n.type === "external" ? "#888" : serviceColor(serviceOfFile[n.id] ?? null),
  },
}));

const elements = [...nodeEls, ...edgeEls];
const cytoscapeSrc = readFileSync(join(root, "node_modules", "cytoscape", "dist", "cytoscape.umd.js"), "utf8");
const errors = drift.events.filter((e) => e.severity === "error").length;
const warnings = drift.events.filter((e) => e.severity === "warning").length;

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<title>DriftLens — sample-repo preview</title>
<style>
  html,body{height:100%;margin:0;font-family:system-ui,sans-serif;background:#1e1e1e;color:#ddd}
  #header{display:flex;gap:16px;align-items:center;padding:10px 14px;border-bottom:1px solid #333}
  #health{font-weight:600}#summary{opacity:.8;font-size:13px}
  #legend{display:flex;gap:14px;font-size:12px;opacity:.85;margin-left:auto}
  .sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:middle}
  #cy{position:absolute;top:45px;left:0;right:0;bottom:0}
</style></head><body>
<div id="header">
  <span id="health">Architecture Health: ${drift.healthScore}%</span>
  <span id="summary">${errors} error(s), ${warnings} warning(s)</span>
  <span id="legend">
    <span><span class="sw" style="background:#3794ff"></span>component (by service)</span>
    <span><span class="sw" style="background:#f14c4c"></span>drift origin</span>
    <span><span class="sw" style="background:#f0a35e"></span>drift affected</span>
    <span><span class="sw" style="background:#888"></span>external</span>
  </span>
</div>
<div id="cy"></div>
<script>${cytoscapeSrc}</script>
<script>
  const elements = ${JSON.stringify(elements)};
  const cy = cytoscape({ container: document.getElementById('cy'), elements, wheelSensitivity:0.2,
    style: [
      { selector:'node', style:{ 'background-color':'data(color)', label:'data(label)', color:'#ddd',
        'font-size':'10px','text-valign':'bottom','text-margin-y':3, width:24, height:24 } },
      { selector:'node[type="external"]', style:{ 'background-color':'#888', shape:'round-rectangle', width:18, height:18 } },
      { selector:'edge', style:{ width:1.5,'line-color':'#5a5a5a','target-arrow-color':'#5a5a5a',
        'target-arrow-shape':'triangle','curve-style':'bezier','arrow-scale':0.8 } },
      { selector:'edge[drift="true"]', style:{ 'line-color':'#f14c4c','target-arrow-color':'#f14c4c', width:3 } },
      { selector:'node[drift="origin"]', style:{ 'border-width':3,'border-color':'#f14c4c',
        'overlay-color':'#f14c4c','overlay-opacity':0.4,'overlay-padding':6 } },
      { selector:'node[drift="affected"]', style:{ 'border-width':2,'border-color':'#f0a35e',
        'overlay-color':'#f0a35e','overlay-opacity':0.25,'overlay-padding':5 } }
    ]
  });
  cy.layout({ name:'cose', animate:false, padding:40 }).run();
</script>
</body></html>`;

const outPath = join(repo, "preview.html");
writeFileSync(outPath, html);
console.log(`Wrote ${relative(root, outPath)} — open it in a browser.`);
console.log(`Health ${drift.healthScore}% · ${errors} error(s), ${warnings} warning(s) · ${nodes.length} components`);
