/**
 * Turn prose (`README`, `docs/`, `adr/`) into first-class graph nodes and edges
 * so DriftLens can answer "why is this component here?" and "which decision
 * governs it?".
 *
 * Two node kinds come out of here (both with `source.kind === "doc"`):
 * - `document` — any Markdown page (`document:<path>`).
 * - `adr` — an Architecture Decision Record (`adr:<slug>`), detected by path
 *   pattern (`**​/adr/NNNN-*.md`) **or** frontmatter `status:` (SPEC-018 honors
 *   both signals).
 *
 * Two edge kinds:
 * - `references` — `document|adr → module`, one per Markdown link whose target
 *   resolves to a known project file.
 * - `decided_by` — `service → adr`, drawn when an ADR *names* a service: either
 *   it links to a file that belongs to that service, or its frontmatter lists
 *   the service under `components:`/`services:`. This is the "ADR → component"
 *   edge the Decision View (SPEC-021) renders.
 *
 * Pure and deterministic. Link resolution is dependency-free and reuses the same
 * relative-path logic as the import resolver.
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
import { isRelative, resolveImport } from "../graph/resolve.js";
import { moduleId, serviceId } from "../graph/unified-builder.js";
import { parseMarkdown } from "./markdown.js";

/** One Markdown source to ingest. */
export interface DocInput {
  /** Repo-relative, POSIX path. */
  readonly path: string;
  readonly source: string;
}

export interface DocGraphOptions {
  /**
   * All known project file paths, used to resolve Markdown links to `module`
   * nodes. Typically the paths of the parsed code files.
   */
  readonly knownFiles?: ReadonlySet<string>;
  /**
   * Declared architecture. Required for `decided_by` (service → adr) edges:
   * without it there are no `service` nodes to attach a decision to.
   */
  readonly config?: DriftConfig;
}

/** The doc-derived slice of the unified graph, ready to merge. */
export interface DocGraph {
  readonly nodes: readonly UnifiedNode[];
  readonly edges: readonly UnifiedEdge[];
}

/**
 * Build the doc/adr nodes and their edges from a set of Markdown files. The
 * result is merged into the {@link import("../graph/unified-builder.js").buildUnifiedGraph}
 * output; ids are stable so re-ingesting the same docs is idempotent.
 */
export function buildDocGraph(files: Iterable<DocInput>, options: DocGraphOptions = {}): DocGraph {
  const knownFiles = options.knownFiles ?? new Set<string>();
  const config = options.config;

  const nodes: UnifiedNode[] = [];
  const edges = new Map<string, UnifiedEdge>();
  const addEdge = (edge: UnifiedEdge): void => {
    if (!edges.has(edge.id)) edges.set(edge.id, edge);
  };

  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const md = parseMarkdown(file.source);
    const isAdr = isAdrDocument(file.path, md.frontmatter);
    const nodeId = isAdr ? adrId(file.path) : documentId(file.path);
    const docSource = (line?: number): Provenance => ({
      kind: "doc",
      path: file.path,
      ...(line !== undefined ? { line } : {}),
    });

    // The node's declared attributes: its sections, and (for ADRs) status/date.
    const data: Record<string, AttrValue> = {
      sections: md.sections.map((s) => s.title),
    };
    if (isAdr) {
      const status = scalar(md.frontmatter.status);
      if (status !== undefined) data.status = status;
      const date = scalar(md.frontmatter.date);
      if (date !== undefined) data.date = date;
    }

    nodes.push({
      id: nodeId,
      kind: isAdr ? "adr" : "document",
      label: md.title ?? basename(file.path),
      source: docSource(),
      data,
    });

    // ── references: link → module ──
    const referencedServices = new Set<string>();
    for (const link of md.links) {
      const targetPath = resolveDocLink(file.path, link.target, knownFiles);
      if (!targetPath) continue;
      addEdge({
        id: `references:${nodeId}->${moduleId(targetPath)}`,
        type: "references",
        from: nodeId,
        to: moduleId(targetPath),
        source: docSource(link.line),
      });
      if (isAdr && config) {
        const svc = firstMatchingService(targetPath, config);
        if (svc !== null) referencedServices.add(svc);
      }
    }

    // ── decided_by: service → adr ──
    if (isAdr && config) {
      // Services named directly in frontmatter (`components:` / `services:`).
      for (const name of frontmatterServices(md.frontmatter)) {
        if (config.services.some((s) => s.name === name)) referencedServices.add(name);
      }
      for (const name of [...referencedServices].sort()) {
        addEdge({
          id: `decided_by:${serviceId(name)}->${nodeId}`,
          type: "decided_by",
          from: serviceId(name),
          to: nodeId,
          source: docSource(),
        });
      }
    }
  }

  return {
    nodes: nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    edges: [...edges.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
}

/** `document:<path>` — path-based so identity survives edits. */
export function documentId(path: string): string {
  return `document:${path}`;
}

/** `adr:<slug>` — slug of the filename stem, stable across content edits. */
export function adrId(path: string): string {
  return `adr:${slug(stem(basename(path)))}`;
}

/** True if `path` sits in an `adr/` directory as `NNNN-*.md`. */
export function isAdrPath(path: string): boolean {
  return /(^|\/)adr\/\d+[^/]*\.mdx?$/i.test(path);
}

/**
 * An ADR is detected by **either** signal (SPEC-018): the `adr/NNNN-*.md` path
 * pattern, or a frontmatter `status:` key (the ADR convention). Either is
 * sufficient; when both are present they agree.
 */
function isAdrDocument(path: string, frontmatter: Readonly<Record<string, AttrValue>>): boolean {
  return isAdrPath(path) || frontmatter.status !== undefined;
}

/**
 * Resolve a Markdown link target to a known project file path, or `undefined`.
 * Strips any `#anchor`/`?query`, URL-decodes, and skips off-repo targets
 * (`http(s):`, `mailto:`, protocol-relative `//`, bare anchors). Relative
 * targets resolve against the doc's directory via the shared import resolver;
 * repo-root-relative targets are probed directly.
 */
export function resolveDocLink(
  docPath: string,
  rawTarget: string,
  knownFiles: ReadonlySet<string>,
): string | undefined {
  const stripped = rawTarget.split("#")[0]!.split("?")[0]!.trim();
  if (stripped === "") return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(stripped) || stripped.startsWith("//")) return undefined;

  let target: string;
  try {
    target = decodeURIComponent(stripped);
  } catch {
    target = stripped;
  }

  if (isRelative(target)) {
    return resolveImport(docPath, target, knownFiles);
  }
  // Repo-root-relative (`src/checkout/x.ts`). Probe the path as written.
  const normalized = target.replace(/^\.?\//, "");
  return knownFiles.has(normalized) ? normalized : undefined;
}

/** Service names named directly in an ADR's frontmatter. */
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

function stem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}
