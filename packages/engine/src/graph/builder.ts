import type { ParsedFile } from "../model.js";
import type { GraphEdge, GraphNode, GraphView } from "./model.js";
import { isRelative, resolveImport } from "./resolve.js";

/**
 * Holds the parsed representation of every known file and assembles a
 * {@link GraphView} on demand.
 *
 * Incrementality lives at the *parse* layer — the expensive step — via
 * {@link setFile} / {@link removeFile}, which replace a single file's parsed
 * data. Assembling the graph from cached {@link ParsedFile}s is cheap and done
 * fresh in {@link snapshot} so the view is always consistent.
 */
export class CodeGraph {
  private readonly files = new Map<string, ParsedFile>();

  /** Add or replace the parsed data for one file. */
  setFile(parsed: ParsedFile): void {
    this.files.set(parsed.path, parsed);
  }

  /** Remove a file (e.g. it was deleted). Returns true if it was present. */
  removeFile(path: string): boolean {
    return this.files.delete(normalize(path));
  }

  /** Number of files currently in the graph. */
  get size(): number {
    return this.files.size;
  }

  /** Build an immutable snapshot of the current graph. */
  snapshot(): GraphView {
    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    const knownFiles = new Set(this.files.keys());

    for (const file of this.files.values()) {
      nodes.set(file.path, {
        id: file.path,
        type: "file",
        label: basename(file.path),
        filePath: file.path,
      });

      // Exported symbols become nodes contained by their file.
      for (const exp of file.exports) {
        const id = `${file.path}#${exp.name}`;
        nodes.set(id, {
          id,
          type: "symbol",
          label: exp.name,
          filePath: file.path,
          kind: exp.kind,
        });
        edges.push({
          id: `${file.path}=>${id}`,
          source: file.path,
          target: id,
          type: "contains",
        });
      }
    }

    // Import edges (file -> file, or file -> external).
    for (const file of this.files.values()) {
      for (const imp of file.imports) {
        const target = resolveImport(file.path, imp.moduleSpecifier, knownFiles);
        if (target) {
          edges.push({
            id: `${file.path}->${target}`,
            source: file.path,
            target,
            type: "import",
            typeOnly: imp.isTypeOnly,
          });
        } else if (!isRelative(imp.moduleSpecifier)) {
          const extId = `ext:${imp.moduleSpecifier}`;
          if (!nodes.has(extId)) {
            nodes.set(extId, { id: extId, type: "external", label: imp.moduleSpecifier });
          }
          edges.push({
            id: `${file.path}->${extId}`,
            source: file.path,
            target: extId,
            type: "import",
            typeOnly: imp.isTypeOnly,
          });
        }
        // Unresolved relative imports (e.g. to files we haven't parsed) are
        // dropped rather than guessed; they reappear once the target is added.
      }
    }

    return { nodes: [...nodes.values()], edges: dedupeEdges(edges) };
  }
}

function dedupeEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  const out: GraphEdge[] = [];
  for (const edge of edges) {
    if (seen.has(edge.id)) continue;
    seen.add(edge.id);
    out.push(edge);
  }
  return out;
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/");
}
