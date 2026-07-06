import type { GraphEdge, GraphNode, GraphView } from "./model.js";
import type { UnifiedGraph, UnifiedNode } from "../model/unified.js";
import { moduleId } from "./unified-builder.js";

/**
 * Project the unified model down to the classic {@link GraphView} (file /
 * symbol / external nodes; import / contains edges). This is what makes the old
 * code graph "one projection of the unified model": the webview and any existing
 * consumer keep working unchanged.
 *
 * Declared-architecture and doc/spec nodes (service, owner, adr, …) are dropped —
 * they have no representation in the legacy view.
 */
export function projectCodeGraph(unified: UnifiedGraph): GraphView {
  const projectedId = new Map<string, string>();
  const nodes = new Map<string, GraphNode>();

  for (const node of unified.nodes) {
    const projected = projectNode(node);
    if (!projected) continue;
    projectedId.set(node.id, projected.id);
    nodes.set(projected.id, projected);
  }

  const edges = new Map<string, GraphEdge>();
  for (const edge of unified.edges) {
    if (edge.type !== "imports" && edge.type !== "contains") continue;
    const from = projectedId.get(edge.from);
    const to = projectedId.get(edge.to);
    if (from === undefined || to === undefined) continue;

    if (edge.type === "contains") {
      const id = `${from}=>${to}`;
      if (!edges.has(id)) edges.set(id, { id, source: from, target: to, type: "contains" });
    } else {
      const id = `${from}->${to}`;
      if (!edges.has(id)) {
        edges.set(id, { id, source: from, target: to, type: "import", typeOnly: !!edge.typeOnly });
      }
    }
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

function projectNode(node: UnifiedNode): GraphNode | undefined {
  switch (node.kind) {
    case "module":
      return { id: node.filePath!, type: "file", label: node.label, filePath: node.filePath };
    case "class":
    case "function":
    case "symbol":
      return {
        id: `${node.filePath}#${node.label}`,
        type: "symbol",
        label: node.label,
        filePath: node.filePath,
        ...(node.definitionKind ? { kind: node.definitionKind } : {}),
      };
    case "external":
      return { id: `ext:${node.label}`, type: "external", label: node.label };
    default:
      return undefined; // service / owner / adr / spec / document / contract / component
  }
}

/**
 * Lift a legacy {@link GraphView} into the minimal {@link UnifiedGraph} the drift
 * detector needs (module nodes + module→module import edges). Used only by the
 * backward-compatible {@link import("../drift/detector.js").detectDrift} adapter
 * so the public `GraphView` signature keeps working while the detector operates
 * natively on the unified model.
 */
export function liftGraphView(view: GraphView): UnifiedGraph {
  const fileIds = new Set(view.nodes.filter((n) => n.type === "file").map((n) => n.id));

  const nodes: UnifiedNode[] = [];
  for (const node of view.nodes) {
    if (node.type !== "file") continue;
    const path = node.filePath ?? node.id;
    nodes.push({
      id: moduleId(node.id),
      kind: "module",
      label: node.label,
      source: { kind: "code", path },
      filePath: path,
    });
  }

  const edges = [];
  for (const edge of view.edges) {
    if (edge.type !== "import") continue;
    if (!fileIds.has(edge.source) || !fileIds.has(edge.target)) continue; // module→module only
    const from = moduleId(edge.source);
    const to = moduleId(edge.target);
    edges.push({
      id: `imports:${from}->${to}`,
      type: "imports" as const,
      from,
      to,
      typeOnly: edge.typeOnly,
      source: { kind: "code" as const, path: edge.source },
    });
  }

  return { nodes, edges, schemaVersion: 1 };
}
