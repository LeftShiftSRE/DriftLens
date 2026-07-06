import type {
  UnifiedEdge,
  UnifiedEdgeType,
  UnifiedGraph,
  UnifiedNode,
  UnifiedNodeKind,
} from "../model/unified.js";
import { moduleId, serviceId } from "./unified-builder.js";

export interface UnifiedSubgraph {
  readonly root?: UnifiedNode;
  readonly nodes: readonly UnifiedNode[];
  readonly edges: readonly UnifiedEdge[];
}

export interface NeighborOpts {
  /** Restrict to a single edge type. */
  readonly edgeType?: UnifiedEdgeType;
  /** `"out"` = edges where the node is `from`; `"in"` = `to`; default `"both"`. */
  readonly direction?: "out" | "in" | "both";
}

/**
 * An indexed, read-only query surface over a {@link UnifiedGraph}. Built once
 * (adjacency + id/kind indexes), then cheap to query. This is the foundation the
 * MCP server (SPEC-020) exposes as context tools.
 */
export interface GraphQuery {
  /** The underlying graph. */
  readonly graph: UnifiedGraph;
  node(id: string): UnifiedNode | undefined;
  nodesByKind(kind: UnifiedNodeKind): readonly UnifiedNode[];
  /** Module and symbol nodes owned by a file path. */
  findByPath(path: string): readonly UnifiedNode[];
  edgesOf(id: string, opts?: NeighborOpts): readonly UnifiedEdge[];
  neighbors(id: string, opts?: NeighborOpts): readonly UnifiedNode[];
  /**
   * A component's context subgraph: the `service` node named `name`, its member
   * modules and their contained symbols, imports among members, the owner, and
   * declared dependencies. Powers `query_component` in the MCP server.
   */
  component(name: string): UnifiedSubgraph;
}

export function createQuery(graph: UnifiedGraph): GraphQuery {
  const byId = new Map<string, UnifiedNode>();
  const byKind = new Map<UnifiedNodeKind, UnifiedNode[]>();
  const byPath = new Map<string, UnifiedNode[]>();
  const outEdges = new Map<string, UnifiedEdge[]>();
  const inEdges = new Map<string, UnifiedEdge[]>();

  for (const node of graph.nodes) {
    byId.set(node.id, node);
    push(byKind, node.kind, node);
    if (node.filePath) push(byPath, node.filePath, node);
  }
  for (const edge of graph.edges) {
    push(outEdges, edge.from, edge);
    push(inEdges, edge.to, edge);
  }

  const edgesOf = (id: string, opts: NeighborOpts = {}): UnifiedEdge[] => {
    const direction = opts.direction ?? "both";
    const collected: UnifiedEdge[] = [];
    if (direction === "out" || direction === "both") collected.push(...(outEdges.get(id) ?? []));
    if (direction === "in" || direction === "both") collected.push(...(inEdges.get(id) ?? []));
    return opts.edgeType ? collected.filter((e) => e.type === opts.edgeType) : collected;
  };

  const neighbors = (id: string, opts: NeighborOpts = {}): UnifiedNode[] => {
    const seen = new Set<string>();
    const out: UnifiedNode[] = [];
    for (const edge of edgesOf(id, opts)) {
      const otherId = edge.from === id ? edge.to : edge.from;
      if (seen.has(otherId)) continue;
      seen.add(otherId);
      const node = byId.get(otherId);
      if (node) out.push(node);
    }
    return out;
  };

  const component = (name: string): UnifiedSubgraph => {
    const svcId = serviceId(name);
    const root = byId.get(svcId);
    if (!root) return { nodes: [], edges: [] };

    const nodeSet = new Map<string, UnifiedNode>([[svcId, root]]);
    const edgeSet = new Map<string, UnifiedEdge>();
    const include = (n: UnifiedNode | undefined): void => {
      if (n) nodeSet.set(n.id, n);
    };

    // Member modules (module -> service via member_of) and their symbols.
    const memberModuleIds = new Set<string>();
    for (const edge of inEdges.get(svcId) ?? []) {
      if (edge.type !== "member_of") continue;
      edgeSet.set(edge.id, edge);
      memberModuleIds.add(edge.from);
      include(byId.get(edge.from));
      for (const contains of outEdges.get(edge.from) ?? []) {
        if (contains.type !== "contains") continue;
        edgeSet.set(contains.id, contains);
        include(byId.get(contains.to));
      }
    }

    // Imports among member modules.
    for (const modId of memberModuleIds) {
      for (const edge of outEdges.get(modId) ?? []) {
        if (edge.type === "imports" && memberModuleIds.has(edge.to)) edgeSet.set(edge.id, edge);
      }
    }

    // Owner, declared dependencies, and decision/spec links touching the service.
    for (const edge of [...(outEdges.get(svcId) ?? []), ...(inEdges.get(svcId) ?? [])]) {
      if (edge.type === "member_of") continue; // already handled
      edgeSet.set(edge.id, edge);
      include(byId.get(edge.from));
      include(byId.get(edge.to));
    }

    return { root, nodes: [...nodeSet.values()], edges: [...edgeSet.values()] };
  };

  return {
    graph,
    node: (id) => byId.get(id),
    nodesByKind: (kind) => byKind.get(kind) ?? [],
    findByPath: (path) => byPath.get(path) ?? [],
    edgesOf,
    neighbors,
    component,
  };
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Re-exported so callers can build ids without importing the builder. */
export { moduleId, serviceId };
