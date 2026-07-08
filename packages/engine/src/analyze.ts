import type { GraphView } from "./graph/model.js";
import type { UnifiedGraph } from "./model/unified.js";
import type { ParsedFile } from "./model.js";
import { buildUnifiedGraph } from "./graph/unified-builder.js";
import type { DocInput } from "./ingest/docs.js";
import { isSpecPath, type SpecInput } from "./ingest/specs.js";
import { projectCodeGraph } from "./graph/project.js";
import { defaultRegistry, ParserRegistry } from "./parser/registry.js";
import { detectDriftUnified, type DriftReport } from "./drift/detector.js";
import type { DriftConfig } from "./drift/config.js";

/** Markdown file extensions ingested as docs (SPEC-018). */
const DOC_EXTENSIONS = [".md", ".mdx", ".markdown"] as const;

export interface AnalyzeResult {
  /** Backward-compatible file/symbol/external projection of {@link unified}. */
  readonly graph: GraphView;
  /** The full unified architecture graph (code + declared architecture). */
  readonly unified: UnifiedGraph;
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
  /**
   * Markdown docs to ingest (SPEC-018). When omitted, any Markdown files in
   * `files` (`.md` / `.mdx` / `.markdown`) are auto-collected as docs instead of
   * being reported as `skipped`. Pass an explicit list to ingest docs that live
   * outside the code `files` map (or `[]` to disable doc ingestion entirely).
   */
  readonly docs?: Iterable<DocInput>;
  /**
   * Specs to ingest (SPEC-019). When omitted, any `*.spec.md` files in `files`
   * are auto-collected as specs (checked *before* the generic `.md` doc routing,
   * since a spec filename also ends in `.md`). Pass an explicit list to ingest
   * specs that live outside the code `files` map (or `[]` to disable entirely).
   */
  readonly specs?: Iterable<SpecInput>;
}

/**
 * One-shot convenience: parse a set of in-memory files, build the unified graph,
 * and — if a config is provided — detect drift. For real IDE use, drive the
 * incremental parse layer instead of re-analyzing everything.
 *
 * @param files Map of POSIX-normalized path -> source text.
 */
export function analyzeProject(
  files: ReadonlyMap<string, string>,
  options: AnalyzeOptions = {},
): AnalyzeResult {
  const registry = options.registry ?? defaultRegistry();
  const parsed: ParsedFile[] = [];
  const skipped: string[] = [];
  const collectedDocs: DocInput[] = [];
  const collectedSpecs: SpecInput[] = [];
  const explicitDocs = options.docs !== undefined;
  const explicitSpecs = options.specs !== undefined;

  for (const [path, source] of files) {
    // Spec files (`*.spec.md`) are checked first — they also end in `.md`, so a
    // spec would otherwise be swallowed by the generic doc router below.
    if (!explicitSpecs && isSpecPath(path)) {
      collectedSpecs.push({ path, source });
      continue;
    }
    // `isSpecPath` guard: a `*.spec.md` file is never a doc, even when specs are
    // supplied explicitly (it just isn't auto-collected in that case).
    if (!explicitDocs && isDocPath(path) && !isSpecPath(path)) {
      collectedDocs.push({ path, source });
      continue;
    }
    const p = registry.parse(path, source);
    if (p) parsed.push(p);
    else skipped.push(path);
  }

  const docs = explicitDocs ? options.docs : collectedDocs;
  const specs = explicitSpecs ? options.specs : collectedSpecs;
  const unified = buildUnifiedGraph(parsed, {
    ...(options.config ? { config: options.config } : {}),
    ...(docs ? { docs } : {}),
    ...(specs ? { specs } : {}),
  });
  const graph = projectCodeGraph(unified);
  const drift = options.config ? detectDriftUnified(unified, options.config) : undefined;

  return { graph, unified, ...(drift ? { drift } : {}), skipped };
}

function isDocPath(path: string): boolean {
  const lower = path.toLowerCase();
  return DOC_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
