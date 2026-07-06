import { CodeGraph } from "./graph/builder.js";
import type { GraphView } from "./graph/model.js";
import { defaultRegistry, ParserRegistry } from "./parser/registry.js";
import { detectDrift, type DriftReport } from "./drift/detector.js";
import type { DriftConfig } from "./drift/config.js";

export interface AnalyzeResult {
  readonly graph: GraphView;
  /** Present only when a config was supplied. */
  readonly drift?: DriftReport;
  /** Paths that no registered parser could handle. */
  readonly skipped: readonly string[];
}

export interface AnalyzeOptions {
  /** Declared architecture to check drift against. */
  readonly config?: DriftConfig;
  /** Override the parser registry (defaults to all first-party parsers). */
  readonly registry?: ParserRegistry;
}

/**
 * One-shot convenience: parse a set of in-memory files, build the graph, and —
 * if a config is provided — detect drift. For real IDE use, drive
 * {@link CodeGraph} incrementally instead of re-analyzing everything.
 *
 * @param files Map of POSIX-normalized path -> source text.
 */
export function analyzeProject(
  files: ReadonlyMap<string, string>,
  options: AnalyzeOptions = {},
): AnalyzeResult {
  const registry = options.registry ?? defaultRegistry();
  const graph = new CodeGraph();
  const skipped: string[] = [];

  for (const [path, source] of files) {
    const parsed = registry.parse(path, source);
    if (parsed) graph.setFile(parsed);
    else skipped.push(path);
  }

  const view = graph.snapshot();
  const drift = options.config ? detectDrift(view, options.config) : undefined;

  return { graph: view, ...(drift ? { drift } : {}), skipped };
}
