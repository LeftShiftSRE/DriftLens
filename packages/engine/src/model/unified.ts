/**
 * The **unified architecture data model** — one node/edge schema that spans code,
 * declared architecture, docs, and specs, with provenance on everything.
 *
 * A file graph is not an architecture. This model lets a single graph hold
 * services, components, modules, classes, contracts, ADRs, specs and owners, and
 * — because every node and edge carries a {@link Provenance} `source` — lets the
 * UI show *where each piece of knowledge came from* (code vs YAML vs a doc vs a
 * spec).
 *
 * The current {@link import("../graph/model.js").GraphView} is one *projection*
 * of this model (see `graph/project.ts`). SPEC-016 populates the code- and
 * config-derived kinds; later specs merge doc/spec/contract nodes into the same
 * shape without changing this schema. See `docs/architecture-data-model.md`.
 */

import type { DefinitionKind } from "../model.js";

/** Where a piece of knowledge was extracted from. */
export type SourceKind = "code" | "yaml" | "doc" | "spec";

/** Provenance attached to every {@link UnifiedNode} and {@link UnifiedEdge}. */
export interface Provenance {
  readonly kind: SourceKind;
  /** Repo-relative, POSIX path of the artifact this was derived from. */
  readonly path: string;
  /** 1-based line, when known (a definition, import, or config entry). */
  readonly line?: number;
  /**
   * Content fingerprint of the source artifact at extraction time, for change
   * detection. Note: identity lives in {@link UnifiedNode.id} (path/slug based);
   * the hash describes the *revision*, not the identity.
   */
  readonly hash?: string;
}

export type UnifiedNodeKind =
  // ── Code-derived (populated by SPEC-016) ──
  /** One source file. */
  | "module"
  /** An exported class definition. */
  | "class"
  /** An exported function definition. */
  | "function"
  /** Any other exported definition (interface/enum/type/variable/method). */
  | "symbol"
  /** A bare / third-party module specifier (an npm package, etc.). */
  | "external"
  // ── Declared architecture (populated by SPEC-016, from .driftlens.yml) ──
  | "service"
  | "owner"
  // ── Reserved: id space + schema defined now, builders added by later specs ──
  /** A finer-grained unit within a service (SPEC-005 v2 / SPEC-019). */
  | "component"
  /** An exported interface / route / RPC signature (SPEC-023). */
  | "contract"
  /** An architecture decision record (SPEC-018). */
  | "adr"
  /** A spec / work item (SPEC-019). */
  | "spec"
  /** A prose document, e.g. README or a docs page (SPEC-018). */
  | "document";

export type UnifiedEdgeType =
  // ── Code-derived (now) ──
  /** module → module | module → external. Projects to the `import` edge. */
  | "imports"
  /** module → class|function|symbol. */
  | "contains"
  // ── Declared architecture (now) ──
  /** module → service. A file's membership in a service (path-glob match). */
  | "member_of"
  /** owner → service. */
  | "owns"
  /** service → service. A *declared* dependency. */
  | "depends_on"
  // ── Reserved for later specs ──
  /** class → contract (SPEC-023). */
  | "implements"
  /** service → adr (SPEC-018). */
  | "decided_by"
  /** component → spec (SPEC-019). */
  | "specified_by"
  /** code|spec → adr (SPEC-018/019). */
  | "contradicts"
  /** document → any (SPEC-018). */
  | "references";

/** A JSON-serializable value carried in a node/edge `data` bag. */
export type AttrValue = string | number | boolean | readonly string[];

export interface UnifiedNode {
  readonly id: string;
  readonly kind: UnifiedNodeKind;
  readonly label: string;
  /** Provenance — a uniform `.source` accessor on nodes and edges. */
  readonly source: Provenance;
  /** Owning file path for code nodes (module/class/function/symbol). */
  readonly filePath?: string;
  /** Underlying definition kind for code-definition nodes (lossless projection). */
  readonly definitionKind?: DefinitionKind;
  /** Small, kind-specific attributes (e.g. declared deps, owner, status). */
  readonly data?: Readonly<Record<string, AttrValue>>;
}

export interface UnifiedEdge {
  readonly id: string;
  readonly type: UnifiedEdgeType;
  /** Endpoint node ids. Named `from`/`to` so `source` can carry provenance. */
  readonly from: string;
  readonly to: string;
  readonly source: Provenance;
  /** Preserved so the projection can reproduce type-only imports. */
  readonly typeOnly?: boolean;
  readonly data?: Readonly<Record<string, AttrValue>>;
}

/** An immutable, canonical (sorted-by-id) snapshot of the unified model. */
export interface UnifiedGraph {
  readonly nodes: readonly UnifiedNode[];
  readonly edges: readonly UnifiedEdge[];
  /** Bumped when the schema changes; used by future persistence migrations. */
  readonly schemaVersion: 1;
}
