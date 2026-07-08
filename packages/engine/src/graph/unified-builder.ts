import type { ParsedFile } from "../model.js";
import type {
  AttrValue,
  Provenance,
  UnifiedEdge,
  UnifiedGraph,
  UnifiedNode,
  UnifiedNodeKind,
} from "../model/unified.js";
import type { DriftConfig } from "../drift/config.js";
import { firstMatchingService } from "../drift/assign.js";
import { slug } from "../util/slug.js";
import { buildDocGraph, type DocInput } from "../ingest/docs.js";
import { buildSpecGraph, type SpecInput } from "../ingest/specs.js";
import { isRelative, resolveImport } from "./resolve.js";

/** Conventional path recorded as the provenance of config-derived nodes. */
const CONFIG_PATH = ".driftlens.yml";

export interface BuildOptions {
  /**
   * Declared architecture. When present, the graph also carries `service` /
   * `owner` nodes and `member_of` / `owns` / `depends_on` edges. When absent,
   * the graph is code-only (its {@link import("./project.js").projectCodeGraph}
   * is identical either way).
   */
  readonly config?: DriftConfig;
  /**
   * Markdown docs to ingest (SPEC-018). When present, the graph also carries
   * `document` / `adr` nodes and `references` / `decided_by` edges. Links are
   * resolved against the parsed code files, so docs see the same file set as the
   * code graph. Purely additive: {@link import("./project.js").projectCodeGraph}
   * ignores these kinds, so the legacy view is unchanged either way.
   */
  readonly docs?: Iterable<DocInput>;
  /**
   * Specs to ingest (SPEC-019). When present, the graph also carries `spec`
   * nodes and `specified_by` (service → spec) edges. Like `docs`, links are
   * resolved against the parsed code files and services come from `config`.
   * Purely additive: the legacy projection ignores these kinds.
   */
  readonly specs?: Iterable<SpecInput>;
}

/**
 * Build the canonical {@link UnifiedGraph} from parsed files (and, optionally,
 * declared architecture). Pure and deterministic: nodes and edges are sorted by
 * id so the snapshot is independent of input iteration order.
 *
 * The code-derived portion is a faithful superset of what
 * {@link import("./builder.js").CodeGraph} produces — that is what lets the old
 * {@link import("./model.js").GraphView} be recovered as one projection.
 */
export function buildUnifiedGraph(
  files: Iterable<ParsedFile>,
  options: BuildOptions = {},
): UnifiedGraph {
  const fileList = [...files];
  const knownFiles = new Set(fileList.map((f) => f.path));

  const nodes = new Map<string, UnifiedNode>();
  const edges = new Map<string, UnifiedEdge>();

  const addNode = (node: UnifiedNode): void => {
    // First-write-wins, mirroring lazy node creation in the old builder.
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const addEdge = (edge: UnifiedEdge): void => {
    if (!edges.has(edge.id)) edges.set(edge.id, edge);
  };

  // ── Code-derived nodes: modules + their exported symbols ──
  for (const file of fileList) {
    const codeSource = (line?: number): Provenance => ({
      kind: "code",
      path: file.path,
      ...(line !== undefined ? { line } : {}),
      ...(file.contentHash !== undefined ? { hash: file.contentHash } : {}),
    });

    addNode({
      id: moduleId(file.path),
      kind: "module",
      label: basename(file.path),
      source: codeSource(),
      filePath: file.path,
    });

    // One symbol node per unique export name (last export with a name wins its
    // kind), plus one `contains` edge — matching CodeGraph's dedupe semantics.
    const byName = new Map<string, { kind: UnifiedNodeKind; defKind: ParsedFile["exports"][number]["kind"]; line: number }>();
    for (const exp of file.exports) {
      byName.set(exp.name, { kind: symbolKind(exp.kind), defKind: exp.kind, line: exp.line });
    }
    for (const [name, info] of byName) {
      const childId = symbolNodeId(info.kind, file.path, name);
      addNode({
        id: childId,
        kind: info.kind,
        label: name,
        source: codeSource(info.line),
        filePath: file.path,
        definitionKind: info.defKind,
      });
      addEdge({
        id: `contains:${moduleId(file.path)}=>${childId}`,
        type: "contains",
        from: moduleId(file.path),
        to: childId,
        source: codeSource(),
      });
    }
  }

  // ── Code-derived edges: imports (module→module or module→external) ──
  for (const file of fileList) {
    for (const imp of file.imports) {
      const target = resolveImport(file.path, imp.moduleSpecifier, knownFiles);
      const from = moduleId(file.path);
      const importProvenance: Provenance = {
        kind: "code",
        path: file.path,
        line: imp.line,
        ...(file.contentHash !== undefined ? { hash: file.contentHash } : {}),
      };
      if (target) {
        addEdge(importEdge(from, moduleId(target), imp.isTypeOnly, importProvenance));
      } else if (!isRelative(imp.moduleSpecifier)) {
        const extId = externalId(imp.moduleSpecifier);
        addNode({
          id: extId,
          kind: "external",
          label: imp.moduleSpecifier,
          source: { kind: "code", path: file.path },
        });
        addEdge(importEdge(from, extId, imp.isTypeOnly, importProvenance));
      }
      // Unresolved relative imports are dropped (target not yet parsed); they
      // reappear once the target file is added — same as the old builder.
    }
  }

  // ── Declared-architecture nodes/edges from .driftlens.yml ──
  const config = options.config;
  if (config) {
    const yaml = (): Provenance => ({ kind: "yaml", path: CONFIG_PATH });

    for (const svc of config.services) {
      const svcId = serviceId(svc.name);
      const data: Record<string, AttrValue> = { dependencies: [...svc.dependencies] };
      if (svc.owner !== undefined) data.owner = svc.owner;
      addNode({ id: svcId, kind: "service", label: svc.name, source: yaml(), data });

      if (svc.owner !== undefined) {
        const ownId = ownerId(svc.owner);
        addNode({ id: ownId, kind: "owner", label: svc.owner, source: yaml() });
        addEdge({ id: `owns:${ownId}->${svcId}`, type: "owns", from: ownId, to: svcId, source: yaml() });
      }

      for (const dep of svc.dependencies) {
        const depId = serviceId(dep);
        addEdge({
          id: `depends_on:${svcId}->${depId}`,
          type: "depends_on",
          from: svcId,
          to: depId,
          source: yaml(),
        });
      }
    }

    // member_of: each module to its owning service (first-matching glob).
    for (const file of fileList) {
      const owner = firstMatchingService(file.path, config);
      if (owner === null) continue;
      const svcId = serviceId(owner);
      const modId = moduleId(file.path);
      addEdge({
        id: `member_of:${modId}->${svcId}`,
        type: "member_of",
        from: modId,
        to: svcId,
        source: yaml(),
      });
    }
  }

  // ── Doc-derived nodes/edges from Markdown (SPEC-018) ──
  if (options.docs) {
    const docGraph = buildDocGraph(options.docs, { knownFiles, ...(config ? { config } : {}) });
    for (const node of docGraph.nodes) addNode(node);
    for (const edge of docGraph.edges) addEdge(edge);
  }

  // ── Spec-derived nodes/edges from `.spec.md` files (SPEC-019) ──
  if (options.specs) {
    const specGraph = buildSpecGraph(options.specs, { knownFiles, ...(config ? { config } : {}) });
    for (const node of specGraph.nodes) addNode(node);
    for (const edge of specGraph.edges) addEdge(edge);
  }

  return {
    nodes: [...nodes.values()].sort(byId),
    edges: [...edges.values()].sort(byId),
    schemaVersion: 1,
  };
}

// ── ID helpers (stable across rebuilds) ──

export function moduleId(path: string): string {
  return `module:${path}`;
}
export function externalId(specifier: string): string {
  return `external:${specifier}`;
}
export function serviceId(name: string): string {
  return `service:${slug(name)}`;
}
export function ownerId(name: string): string {
  return `owner:${slug(name)}`;
}
function symbolNodeId(kind: UnifiedNodeKind, path: string, name: string): string {
  return `${kind}:${path}#${name}`;
}

function symbolKind(defKind: ParsedFile["exports"][number]["kind"]): UnifiedNodeKind {
  if (defKind === "class") return "class";
  if (defKind === "function") return "function";
  return "symbol";
}

function importEdge(
  from: string,
  to: string,
  typeOnly: boolean,
  source: Provenance,
): UnifiedEdge {
  return { id: `imports:${from}->${to}`, type: "imports", from, to, typeOnly, source };
}

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}
