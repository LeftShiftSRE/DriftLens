/**
 * Turn specs (`.spec.md` files under a `.spec/`/`spec/` folder) into first-class
 * graph nodes and edges, so DriftLens can answer "what work is targeting this
 * component?" and — later — "are two specs colliding on the same component?"
 * (SPEC-027). Specs must be first-class for the AI-bubble story: the whole point
 * is that overlapping specs, worked in parallel, drift into each other.
 *
 * One node kind comes out of here (with `source.kind === "spec"`):
 * - `spec` — a work item (`spec:<slug>`), detected by the `*.spec.md` filename.
 *   Carries `status`/`owner`/`sections` in `data`.
 *
 * One edge kind:
 * - `specified_by` — `service → spec`, drawn when a spec *names* a service:
 *   either it links to a file that belongs to that service, or its frontmatter
 *   lists the service under `components:`/`services:`. This mirrors SPEC-018's
 *   `decided_by` (`service → adr`) exactly, so decisions and specs attach to a
 *   component the same way and the component subgraph pulls both in identically.
 *   When component-level nodes exist (SPEC-005 v2), the same builder emits
 *   `component → spec` with no schema change.
 *
 * Pure and deterministic. Reuses the SPEC-018 markdown scanner and link resolver;
 * no new dependency (see `ingest/markdown.ts` for the rationale).
 */

import type { DriftConfig } from "../drift/config.js";
import { firstMatchingService } from "../drift/assign.js";
import type {
  AttrValue,
  Provenance,
  UnifiedEdge,
  UnifiedNode,
} from "../model/unified.js";
import { slug } from "../util/slug.js";
import { serviceId } from "../graph/unified-builder.js";
import { resolveDocLink } from "./docs.js";
import { parseMarkdown } from "./markdown.js";

/** One spec source to ingest. */
export interface SpecInput {
  /** Repo-relative, POSIX path (e.g. `.spec/047-checkout-flow.spec.md`). */
  readonly path: string;
  readonly source: string;
}

export interface SpecGraphOptions {
  /**
   * All known project file paths, used to resolve Markdown links to project
   * files (and, via {@link SpecGraphOptions.config}, to their owning service).
   * Typically the paths of the parsed code files.
   */
  readonly knownFiles?: ReadonlySet<string>;
  /**
   * Declared architecture. Required for `specified_by` (service → spec) edges:
   * without it there are no `service` nodes to attach a spec to.
   */
  readonly config?: DriftConfig;
}

/** The spec-derived slice of the unified graph, ready to merge. */
export interface SpecGraph {
  readonly nodes: readonly UnifiedNode[];
  readonly edges: readonly UnifiedEdge[];
}

/**
 * Build the `spec` nodes and their `specified_by` edges from a set of `.spec.md`
 * files. The result is merged into the
 * {@link import("../graph/unified-builder.js").buildUnifiedGraph} output; ids are
 * stable so re-ingesting the same specs is idempotent.
 */
export function buildSpecGraph(files: Iterable<SpecInput>, options: SpecGraphOptions = {}): SpecGraph {
  const knownFiles = options.knownFiles ?? new Set<string>();
  const config = options.config;

  const nodes: UnifiedNode[] = [];
  const edges = new Map<string, UnifiedEdge>();
  const addEdge = (edge: UnifiedEdge): void => {
    if (!edges.has(edge.id)) edges.set(edge.id, edge);
  };

  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const md = parseMarkdown(file.source);
    const nodeId = specId(file.path);
    const specSource = (line?: number): Provenance => ({
      kind: "spec",
      path: file.path,
      ...(line !== undefined ? { line } : {}),
    });

    // Node attributes: sections plus the declared status/owner (verbatim).
    const data: Record<string, AttrValue> = {
      sections: md.sections.map((s) => s.title),
    };
    const status = scalar(md.frontmatter.status);
    if (status !== undefined) data.status = status;
    const owner = scalar(md.frontmatter.owner);
    if (owner !== undefined) data.owner = owner;

    nodes.push({
      id: nodeId,
      kind: "spec",
      label: md.title ?? basename(file.path),
      source: specSource(),
      data,
    });

    // ── specified_by: service → spec ──
    // A service is "named" by a resolvable link to one of its files, or by an
    // explicit frontmatter `components:`/`services:` entry.
    if (config) {
      const targetedServices = new Set<string>();
      for (const link of md.links) {
        const targetPath = resolveDocLink(file.path, link.target, knownFiles);
        if (!targetPath) continue;
        const svc = firstMatchingService(targetPath, config);
        if (svc !== null) targetedServices.add(svc);
      }
      for (const name of frontmatterServices(md.frontmatter)) {
        if (config.services.some((s) => s.name === name)) targetedServices.add(name);
      }
      for (const name of [...targetedServices].sort()) {
        addEdge({
          id: `specified_by:${serviceId(name)}->${nodeId}`,
          type: "specified_by",
          from: serviceId(name),
          to: nodeId,
          source: specSource(),
        });
      }
    }
  }

  return {
    nodes: nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    edges: [...edges.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
}

/** `spec:<slug>` — slug of the filename stem (sans `.spec`), stable across edits. */
export function specId(path: string): string {
  return `spec:${slug(specStem(basename(path)))}`;
}

/** True if `path` is a spec file (`*.spec.md` / `*.spec.mdx`). */
export function isSpecPath(path: string): boolean {
  return /\.spec\.mdx?$/i.test(path);
}

/** Service names named directly in a spec's frontmatter. */
function frontmatterServices(frontmatter: Readonly<Record<string, AttrValue>>): string[] {
  const out: string[] = [];
  for (const key of ["components", "services"] as const) {
    const value = frontmatter[key];
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) out.push(...value);
  }
  return out;
}

function scalar(value: AttrValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Strip the `.spec.md` / `.spec.mdx` (or a plain extension) suffix from a name. */
function specStem(name: string): string {
  const specMatch = name.match(/^(.*)\.spec\.mdx?$/i);
  if (specMatch) return specMatch[1]!;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}
