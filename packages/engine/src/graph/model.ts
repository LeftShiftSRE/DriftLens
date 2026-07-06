import type { DefinitionKind } from "../model.js";

export type NodeType = "file" | "symbol" | "external";

export interface GraphNode {
  /** Stable id. Files use their path; symbols use `path#name`; external uses `ext:specifier`. */
  readonly id: string;
  readonly type: NodeType;
  readonly label: string;
  /** Owning file path (for `file` and `symbol` nodes). */
  readonly filePath?: string;
  /** Definition kind, for `symbol` nodes. */
  readonly kind?: DefinitionKind;
}

export type EdgeType = "import" | "contains";

export interface GraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly type: EdgeType;
  /** True for type-only imports. */
  readonly typeOnly?: boolean;
}

/** An immutable snapshot of the code graph. */
export interface GraphView {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}
