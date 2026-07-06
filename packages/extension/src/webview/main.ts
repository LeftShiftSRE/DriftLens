import cytoscape from "cytoscape";
import type { GraphNode } from "@driftlens/engine";
import type { RenderMessage, ToWebview } from "../messages.js";

interface VsCodeApi {
  postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscodeApi = acquireVsCodeApi();

const PALETTE = [
  "#3794ff", "#2ec4b6", "#e07b39", "#b388eb", "#f2c14e",
  "#4cb944", "#ef476f", "#06b6d4", "#a3a380", "#7c9eb2",
];

/** Deterministic color per service name. */
function serviceColor(service: string | null): string {
  if (!service) return "#3794ff";
  let hash = 0;
  for (let i = 0; i < service.length; i++) hash = (hash * 31 + service.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length]!;
}

const cy = cytoscape({
  container: document.getElementById("cy"),
  wheelSensitivity: 0.2,
  style: [
    {
      selector: "node",
      style: {
        "background-color": "data(color)",
        label: "data(label)",
        color: "#ddd",
        "font-size": "10px",
        "text-valign": "bottom",
        "text-margin-y": 3,
        width: 22,
        height: 22,
      },
    },
    {
      selector: 'node[type="external"]',
      style: { "background-color": "#888", shape: "round-rectangle", width: 16, height: 16 },
    },
    {
      selector: "edge",
      style: {
        width: 1.5,
        "line-color": "#5a5a5a",
        "target-arrow-color": "#5a5a5a",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        "arrow-scale": 0.8,
      },
    },
    {
      selector: 'edge[drift="true"]',
      style: { "line-color": "#f14c4c", "target-arrow-color": "#f14c4c", width: 3 },
    },
    // A drifted component keeps its service color but gets a translucent red
    // overlay + border painted ON TOP of it — the drift color literally overlaps
    // the component.
    {
      selector: 'node[drift="origin"]',
      style: {
        "border-width": 3,
        "border-color": "#f14c4c",
        "overlay-color": "#f14c4c",
        "overlay-opacity": 0.4,
        "overlay-padding": 6,
      },
    },
    {
      selector: 'node[drift="affected"]',
      style: {
        "border-width": 2,
        "border-color": "#f0a35e",
        "overlay-color": "#f0a35e",
        "overlay-opacity": 0.25,
        "overlay-padding": 5,
      },
    },
  ],
});

cy.on("tap", "node", (evt) => {
  const path = evt.target.data("filePath") as string | undefined;
  if (path) vscodeApi.postMessage({ type: "openFile", path });
});

window.addEventListener("message", (event: MessageEvent<ToWebview>) => {
  if (event.data.type === "render") render(event.data);
});

function render(msg: RenderMessage): void {
  const { graph, drift, serviceOfFile } = msg;
  const violating = new Set(drift?.violatingEdges ?? []);

  // Diagram = file + external nodes and import edges (symbols/contains are kept
  // in the data model for later features but omitted here for clarity).
  const nodes = graph.nodes.filter((n) => n.type === "file" || n.type === "external");
  const nodeIds = new Set(nodes.map((n) => n.id));

  // First pass: find import edges that violate the declared architecture, and
  // record which components each edge implicates so we can overlay them.
  const driftOrigin = new Set<string>(); // the component doing the illegal import
  const driftAffected = new Set<string>(); // the component being illegally imported
  const edgeElements: cytoscape.ElementDefinition[] = [];

  for (const e of graph.edges) {
    if (e.type !== "import") continue;
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    const from = serviceOfFile[e.source] ?? null;
    const to = serviceOfFile[e.target] ?? null;
    const isDrift = from !== null && to !== null && from !== to && violating.has(`${from}->${to}`);
    if (isDrift) {
      driftOrigin.add(e.source);
      driftAffected.add(e.target);
    }
    edgeElements.push({
      data: { id: e.id, source: e.source, target: e.target, drift: String(isDrift) },
    });
  }

  const elements: cytoscape.ElementDefinition[] = [];
  for (const n of nodes) {
    const drift = driftOrigin.has(n.id) ? "origin" : driftAffected.has(n.id) ? "affected" : "none";
    elements.push({ data: nodeData(n, serviceOfFile, drift) });
  }
  elements.push(...edgeElements);

  cy.elements().remove();
  cy.add(elements);
  cy.layout({ name: "cose", animate: false, padding: 30 }).run();

  updateHeader(msg);
  toggleEmpty(nodes.length === 0);
}

function nodeData(
  n: GraphNode,
  serviceOfFile: Readonly<Record<string, string | null>>,
  drift: "origin" | "affected" | "none",
): cytoscape.NodeDataDefinition {
  const service = n.type === "file" ? (serviceOfFile[n.id] ?? null) : null;
  return {
    id: n.id,
    label: n.label,
    type: n.type,
    drift,
    service: service ?? "",
    color: n.type === "external" ? "#888" : serviceColor(service),
    ...(n.filePath ? { filePath: n.filePath } : {}),
  };
}

function updateHeader(msg: RenderMessage): void {
  const health = document.getElementById("health");
  const summary = document.getElementById("summary");
  if (health) {
    health.textContent = msg.drift
      ? `Architecture Health: ${msg.drift.healthScore}%`
      : "Architecture (no .driftlens.yml)";
  }
  if (summary && msg.drift) {
    const errors = msg.drift.events.filter((e) => e.severity === "error").length;
    const warnings = msg.drift.events.filter((e) => e.severity === "warning").length;
    summary.textContent = `${errors} error(s), ${warnings} warning(s)`;
  } else if (summary) {
    summary.textContent = "";
  }
}

function toggleEmpty(isEmpty: boolean): void {
  const empty = document.getElementById("empty");
  const cyEl = document.getElementById("cy");
  if (empty) empty.style.display = isEmpty ? "block" : "none";
  if (cyEl) cyEl.style.display = isEmpty ? "none" : "block";
}
