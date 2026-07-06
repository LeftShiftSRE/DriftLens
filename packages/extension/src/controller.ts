import * as vscode from "vscode";
import {
  CodeGraph,
  ConfigError,
  defaultRegistry,
  detectDrift,
  parseConfig,
  type DriftConfig,
  type DriftReport,
  type GraphView,
} from "@driftlens/engine";

const CONFIG_FILE = ".driftlens.yml";
const decoder = new TextDecoder();

export interface AnalysisState {
  readonly graph: GraphView;
  readonly drift: DriftReport | null;
}

/**
 * Owns the live analysis for the active workspace folder: keeps a {@link CodeGraph}
 * in sync with files on disk, loads `.driftlens.yml`, and recomputes drift. The
 * expensive step — parsing — happens per changed file; graph assembly is cheap.
 */
export class DriftLensController implements vscode.Disposable {
  private readonly registry = defaultRegistry();
  private graph = new CodeGraph();
  private config: DriftConfig | null = null;

  private latest: AnalysisState = { graph: { nodes: [], edges: [] }, drift: null };

  private readonly emitter = new vscode.EventEmitter<AnalysisState>();
  /** Fires whenever analysis is recomputed. */
  readonly onDidChange = this.emitter.event;

  constructor(private readonly folder: vscode.WorkspaceFolder) {}

  get state(): AnalysisState {
    return this.latest;
  }

  /** Full (re)scan of the workspace folder. */
  async analyzeAll(): Promise<void> {
    await this.loadConfig();

    const settings = vscode.workspace.getConfiguration("driftlens");
    const include = settings.get<string>("include")!;
    const exclude = settings.get<string>("exclude")!;
    const uris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(this.folder, include),
      exclude,
    );

    const fresh = new CodeGraph();
    await Promise.all(
      uris.map(async (uri) => {
        const parsed = this.registry.parse(this.rel(uri), await this.read(uri));
        if (parsed) fresh.setFile(parsed);
      }),
    );
    this.graph = fresh;
    this.recompute();
  }

  /** Incrementally re-parse a single changed/created file. */
  async updateFile(uri: vscode.Uri): Promise<void> {
    if (this.rel(uri) === CONFIG_FILE) {
      await this.loadConfig();
      this.recompute();
      return;
    }
    const parsed = this.registry.parse(this.rel(uri), await this.read(uri));
    if (!parsed) return;
    this.graph.setFile(parsed);
    this.recompute();
  }

  /** Handle a deleted file. */
  removeFile(uri: vscode.Uri): void {
    if (this.graph.removeFile(this.rel(uri))) this.recompute();
  }

  dispose(): void {
    this.emitter.dispose();
  }

  private recompute(): void {
    const graph = this.graph.snapshot();
    const drift = this.config ? detectDrift(graph, this.config) : null;
    this.latest = { graph, drift };
    this.emitter.fire(this.latest);
  }

  private async loadConfig(): Promise<void> {
    const uri = vscode.Uri.joinPath(this.folder.uri, CONFIG_FILE);
    try {
      this.config = parseConfig(await this.read(uri));
    } catch (err) {
      this.config = null;
      if (err instanceof ConfigError) {
        void vscode.window.showWarningMessage(`DriftLens: invalid ${CONFIG_FILE} — ${err.message}`);
      }
      // A missing config is fine — we run without drift detection.
    }
  }

  private rel(uri: vscode.Uri): string {
    return vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/");
  }

  private async read(uri: vscode.Uri): Promise<string> {
    return decoder.decode(await vscode.workspace.fs.readFile(uri));
  }
}
