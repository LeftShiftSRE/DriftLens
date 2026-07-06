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

// Drift
export { parseConfig, ConfigError } from "./drift/config.js";
export type { DriftConfig, ServiceSpec } from "./drift/config.js";
export { detectDrift } from "./drift/detector.js";
export type { DriftEvent, DriftKind, DriftReport, DriftSeverity } from "./drift/detector.js";
export { matchGlob, globToRegExp } from "./drift/glob.js";

// High-level convenience
export { analyzeProject } from "./analyze.js";
export type { AnalyzeOptions, AnalyzeResult } from "./analyze.js";
