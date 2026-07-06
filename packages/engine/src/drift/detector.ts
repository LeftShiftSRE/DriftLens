import type { GraphView } from "../graph/model.js";
import type { UnifiedGraph } from "../model/unified.js";
import { liftGraphView } from "../graph/project.js";
import type { DriftConfig } from "./config.js";
import { firstMatchingService } from "./assign.js";

export type DriftSeverity = "error" | "warning" | "info";

export type DriftKind =
  | "undeclared-dependency"
  | "unused-declared-dependency"
  | "unassigned-file";

/** A single detected divergence between declared and actual architecture. */
export interface DriftEvent {
  readonly kind: DriftKind;
  readonly severity: DriftSeverity;
  readonly message: string;
  /** Source service name, when applicable. */
  readonly source?: string;
  /** Target service name, when applicable. */
  readonly target?: string;
  /** Example file paths that evidence this event. */
  readonly files?: readonly string[];
}

export interface DriftReport {
  readonly events: readonly DriftEvent[];
  /** 0–100 architecture health score, driven by cross-service edge compliance. */
  readonly healthScore: number;
  /** Map of file path -> owning service name (or `null` if unassigned). */
  readonly serviceOfFile: Readonly<Record<string, string | null>>;
  /**
   * Import edges between two different services that violate the declared
   * dependency graph, keyed as `"source->target"`. Useful for painting red
   * edges in the UI.
   */
  readonly violatingEdges: readonly string[];
}

/**
 * Compare the actual code graph against the declared architecture and produce a
 * {@link DriftReport}. Backward-compatible entry point: lifts the legacy
 * {@link GraphView} into the unified model and delegates to
 * {@link detectDriftUnified}. Pure and deterministic — no I/O, no LLM.
 */
export function detectDrift(graph: GraphView, config: DriftConfig): DriftReport {
  return detectDriftUnified(liftGraphView(graph), config);
}

/**
 * The drift detector, operating natively on the {@link UnifiedGraph}. Reads
 * `module` nodes (assigned to services by {@link firstMatchingService}) and
 * `imports` edges between them. Output is byte-identical to the legacy detector
 * for the same code (see `tests/drift-equivalence.test.ts`).
 */
export function detectDriftUnified(graph: UnifiedGraph, config: DriftConfig): DriftReport {
  // Map each module node to its owning service (or null), plus its bare path so
  // report messages/paths match the legacy detector exactly.
  const serviceOf = new Map<string, string | null>();
  const pathOf = new Map<string, string>();
  for (const node of graph.nodes) {
    if (node.kind !== "module") continue;
    const path = node.filePath ?? node.id;
    serviceOf.set(node.id, firstMatchingService(path, config));
    pathOf.set(node.id, path);
  }

  const declaredDeps = new Map<string, Set<string>>();
  for (const svc of config.services) declaredDeps.set(svc.name, new Set(svc.dependencies));

  const events: DriftEvent[] = [];
  const violatingEdges: string[] = [];

  // Track which declared dependencies are actually exercised.
  const observedDeps = new Map<string, Set<string>>();
  for (const svc of config.services) observedDeps.set(svc.name, new Set());

  // Aggregate undeclared cross-service dependencies with example files.
  const undeclared = new Map<string, { source: string; target: string; files: Set<string> }>();

  let compliant = 0;
  let violating = 0;

  for (const edge of graph.edges) {
    if (edge.type !== "imports") continue;
    const from = serviceOf.get(edge.from);
    const to = serviceOf.get(edge.to);
    // undefined => endpoint is not a module (e.g. an external package); null =>
    // module belongs to no service. Either way, not a cross-service drift signal.
    if (!from || !to || from === to) continue;

    observedDeps.get(from)?.add(to);

    if (declaredDeps.get(from)?.has(to)) {
      compliant += 1;
    } else {
      violating += 1;
      violatingEdges.push(`${from}->${to}`);
      const key = `${from}->${to}`;
      const entry = undeclared.get(key) ?? { source: from, target: to, files: new Set<string>() };
      entry.files.add(pathOf.get(edge.from)!);
      undeclared.set(key, entry);
    }
  }

  for (const { source, target, files } of undeclared.values()) {
    events.push({
      kind: "undeclared-dependency",
      severity: "error",
      message: `"${source}" imports "${target}" but does not declare it as a dependency.`,
      source,
      target,
      files: [...files].sort(),
    });
  }

  // Declared-but-unused dependencies.
  for (const svc of config.services) {
    const observed = observedDeps.get(svc.name)!;
    for (const dep of svc.dependencies) {
      if (!observed.has(dep)) {
        events.push({
          kind: "unused-declared-dependency",
          severity: "warning",
          message: `"${svc.name}" declares a dependency on "${dep}" that is never used.`,
          source: svc.name,
          target: dep,
        });
      }
    }
  }

  // Files that belong to no declared service.
  const unassigned = [...serviceOf.entries()]
    .filter(([, svc]) => svc === null)
    .map(([id]) => pathOf.get(id)!)
    .sort();
  if (unassigned.length > 0) {
    events.push({
      kind: "unassigned-file",
      severity: "info",
      message: `${unassigned.length} file(s) are not assigned to any declared service.`,
      files: unassigned,
    });
  }

  const checked = compliant + violating;
  const healthScore = checked === 0 ? 100 : Math.round((compliant / checked) * 100);

  const serviceOfFile: Record<string, string | null> = {};
  for (const [id, svc] of serviceOf) serviceOfFile[pathOf.get(id)!] = svc;

  return {
    events: sortEvents(events),
    healthScore,
    serviceOfFile,
    violatingEdges: [...new Set(violatingEdges)].sort(),
  };
}

const SEVERITY_ORDER: Record<DriftSeverity, number> = { error: 0, warning: 1, info: 2 };

function sortEvents(events: DriftEvent[]): DriftEvent[] {
  return [...events].sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    return a.message.localeCompare(b.message);
  });
}
