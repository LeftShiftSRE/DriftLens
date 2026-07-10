/**
 * Compact text renderers for the MCP tools (SPEC-020).
 *
 * Returns plain Markdown-ish strings that an LLM can read in a single tool
 * result. We keep these intentionally terse: `query_component` is the worst
 * case (subgraph), and the acceptance criterion caps total response at ~2k
 * tokens. Each renderer is pure.
 */

import type { GraphQuery, UnifiedSubgraph } from "@driftlens/engine";
import type { DriftReport, UnifiedNode } from "@driftlens/engine";

/** Group + count by `kind`. */
function countByKind(nodes: readonly UnifiedNode[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of nodes) out[n.kind] = (out[n.kind] ?? 0) + 1;
  return out;
}

/** Pretty service node list with status/owner from `data`. */
function describeService(node: UnifiedNode | undefined, q: GraphQuery): string {
  if (!node) return "(unknown service)";
  const owner = node.data?.owner ?? "—";
  const deps = (node.data?.dependencies as readonly string[] | undefined) ?? [];
  const dec = q.decisionsFor(node.label).map((a) => `- ${a.label} [${a.data?.status ?? "?"}]`);
  const specs = q.specsFor(node.label).map(
    (s) => `- ${s.label} [${s.data?.status ?? "?"}]${s.data?.owner ? ` (${s.data.owner})` : ""}`,
  );
  return [
    `**Service:** ${node.label}`,
    `**Owner:** ${owner}`,
    deps.length ? `**Declared deps:** ${deps.join(", ")}` : "**Declared deps:** none",
    dec.length ? `**Governing ADRs:**\n${dec.join("\n")}` : "**Governing ADRs:** none",
    specs.length ? `**Targeting specs:**\n${specs.join("\n")}` : "**Targeting specs:** none",
  ].join("\n");
}

/** Render a `component(name)` subgraph as compact Markdown. */
export function renderComponent(sub: UnifiedSubgraph, q: GraphQuery): string {
  if (!sub.root) return `No service named "${q.graph.nodes.find((n) => n.kind === "service")?.label ?? "?"}" found.`;
  const counts = countByKind(sub.nodes);
  const lines: string[] = [];
  lines.push(`# Component: ${sub.root.label}`);
  lines.push("");
  lines.push(describeService(sub.root, q));
  lines.push("");
  lines.push(`## Subgraph (${sub.nodes.length} nodes, ${sub.edges.length} edges)`);
  lines.push(`Kinds: ${Object.entries(counts).map(([k, v]) => `${k}×${v}`).join(", ")}`);

  // Member modules + their symbols (most useful to an agent).
  const members = sub.nodes.filter((n) => n.kind === "module");
  if (members.length > 0) {
    lines.push("");
    lines.push("## Members");
    for (const m of members) {
      const syms = sub.nodes.filter(
        (n) => (n.kind === "class" || n.kind === "function" || n.kind === "symbol") && n.filePath === m.filePath,
      );
      const sym = syms.length ? ` — ${syms.map((s) => s.label).join(", ")}` : "";
      lines.push(`- \`${m.filePath}\`${sym}`);
    }
  }

  // Member-to-member imports.
  const imports = sub.edges.filter((e) => e.type === "imports");
  if (imports.length > 0) {
    lines.push("");
    lines.push("## Internal imports");
    for (const e of imports) lines.push(`- ${shortId(e.from)} → ${shortId(e.to)}`);
  }
  return lines.join("\n");
}

/** Render a `get_health()` report as compact Markdown. */
export function renderHealth(report: DriftReport): string {
  const lines: string[] = [];
  lines.push(`# Architecture Health: ${report.healthScore}%`);
  lines.push("");
  lines.push(`**Violating edges:** ${report.violatingEdges.length ? report.violatingEdges.join(", ") : "none"}`);
  lines.push(`**Drift events:** ${report.events.length}`);
  for (const e of report.events) {
    const where = e.files?.length ? `\n  files: ${e.files.join(", ")}` : "";
    lines.push(`- [${e.severity}] ${e.message}${where}`);
  }
  return lines.join("\n");
}

/** Render `find_owners` ownership chain. */
export function renderOwners(
  path: string,
  service: string | null,
  owner: string | null,
): string {
  const chain = [`file: ${path}`, service ? `service: ${service}` : "service: (unassigned)", `owner: ${owner ?? "—"}`];
  return `# Ownership\n\n${chain.map((l) => `- ${l}`).join("\n")}`;
}

/** Render `get_decision_history` — ADRs + specs for a service. */
export function renderDecisions(
  name: string,
  adrs: readonly UnifiedNode[],
  specs: readonly UnifiedNode[],
): string {
  const lines: string[] = [`# Decision history: ${name}`, ""];
  lines.push(`## ADRs (${adrs.length})`);
  for (const a of adrs) {
    lines.push(`- ${a.label} [${a.data?.status ?? "?"}] — ${a.source.path}`);
  }
  if (adrs.length === 0) lines.push("- (none)");
  lines.push("", `## Targeting specs (${specs.length})`);
  for (const s of specs) {
    lines.push(`- ${s.label} [${s.data?.status ?? "?"}] — ${s.source.path}`);
  }
  if (specs.length === 0) lines.push("- (none)");
  return lines.join("\n");
}

function shortId(id: string): string {
  return id.replace(/^(module|external|service|owner|class|function|symbol|adr|spec|document|component|contract):/, "");
}