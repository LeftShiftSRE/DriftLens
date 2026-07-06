import type { DriftReport, GraphView } from "@driftlens/engine";

/** Extension host → webview. */
export interface RenderMessage {
  readonly type: "render";
  readonly graph: GraphView;
  readonly drift: DriftReport | null;
  /** Map of file path → owning service, for coloring. */
  readonly serviceOfFile: Readonly<Record<string, string | null>>;
}

export type ToWebview = RenderMessage;

/** Webview → extension host. */
export interface OpenFileMessage {
  readonly type: "openFile";
  readonly path: string;
}

export type FromWebview = OpenFileMessage;
