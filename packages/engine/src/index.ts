/**
 * `@driftlens/engine` — the deterministic analysis core.
 *
 * Pipeline: {@link ParserRegistry} → {@link CodeGraph} → {@link detectDrift}.
 * No UI, no I/O beyond what the caller feeds in, no LLM. Everything here is a
 * pure function of `(files, config)`.
 */

// Normalized data model
export type {
  Definition,
  DefinitionKind,
  ExportRef,
  ImportRef,
  LanguageParser,
  ParsedFile,
} from "./model.js";

// Parsing
export { TypeScriptParser, typeScriptParser } from "./parser/typescript.js";
export { ParserRegistry, defaultRegistry } from "./parser/registry.js";

// Graph
export { CodeGraph } from "./graph/builder.js";
export { resolveImport, isRelative } from "./graph/resolve.js";
export type { EdgeType, GraphEdge, GraphNode, GraphView, NodeType } from "./graph/model.js";

// Unified architecture data model (SPEC-016)
export type {
  AttrValue,
  Provenance,
  SourceKind,
  UnifiedEdge,
  UnifiedEdgeType,
  UnifiedGraph,
  UnifiedNode,
  UnifiedNodeKind,
} from "./model/unified.js";
export {
  buildUnifiedGraph,
  moduleId,
  externalId,
  serviceId,
  ownerId,
} from "./graph/unified-builder.js";
export type { BuildOptions } from "./graph/unified-builder.js";
export { projectCodeGraph, liftGraphView } from "./graph/project.js";
export { createQuery } from "./graph/query.js";
export type { GraphQuery, NeighborOpts, UnifiedSubgraph } from "./graph/query.js";
export { fnv1a } from "./util/hash.js";
export { slug } from "./util/slug.js";

// Documentation ingestion (SPEC-018)
export { parseMarkdown } from "./ingest/markdown.js";
export type {
  FrontmatterValue,
  MarkdownLink,
  MarkdownSection,
  ParsedMarkdown,
} from "./ingest/markdown.js";
export {
  buildDocGraph,
  documentId,
  adrId,
  isAdrPath,
  resolveDocLink,
} from "./ingest/docs.js";
export type { DocGraph, DocGraphOptions, DocInput } from "./ingest/docs.js";

// Spec ingestion (SPEC-019)
export { buildSpecGraph, specId, isSpecPath } from "./ingest/specs.js";
export type { SpecGraph, SpecGraphOptions, SpecInput } from "./ingest/specs.js";

// Drift
export { parseConfig, ConfigError } from "./drift/config.js";
export type { DriftConfig, ServiceSpec } from "./drift/config.js";
export { detectDrift, detectDriftUnified } from "./drift/detector.js";
export type { DriftEvent, DriftKind, DriftReport, DriftSeverity } from "./drift/detector.js";
export { firstMatchingService } from "./drift/assign.js";
export { matchGlob, globToRegExp } from "./drift/glob.js";

// High-level convenience
export { analyzeProject } from "./analyze.js";
export type { AnalyzeOptions, AnalyzeResult } from "./analyze.js";
