import * as vscode from "vscode";
import type { DriftLensController } from "./controller.js";
import type { FromWebview, ToWebview } from "./messages.js";

/** Manages the single Architecture webview panel and its messaging. */
export class ArchitecturePanel {
  private static current: ArchitecturePanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  static show(
    extensionUri: vscode.Uri,
    controller: DriftLensController,
    folder: vscode.WorkspaceFolder,
  ): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    if (ArchitecturePanel.current) {
      ArchitecturePanel.current.panel.reveal(column);
      ArchitecturePanel.current.render();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "driftlens.architecture",
      "DriftLens — Architecture",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist")],
      },
    );
    ArchitecturePanel.current = new ArchitecturePanel(panel, extensionUri, controller, folder);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly controller: DriftLensController,
    private readonly folder: vscode.WorkspaceFolder,
  ) {
    this.panel.webview.html = this.html(extensionUri);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.controller.onDidChange(() => this.render(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg: FromWebview) => this.handleMessage(msg),
      null,
      this.disposables,
    );

    this.render();
  }

  private render(): void {
    const { graph, drift } = this.controller.state;
    const message: ToWebview = {
      type: "render",
      graph,
      drift,
      serviceOfFile: drift?.serviceOfFile ?? {},
    };
    void this.panel.webview.postMessage(message);
  }

  private async handleMessage(msg: FromWebview): Promise<void> {
    if (msg.type === "openFile") {
      const uri = vscode.Uri.joinPath(this.folder.uri, msg.path);
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: true });
      } catch {
        void vscode.window.showErrorMessage(`DriftLens: could not open ${msg.path}`);
      }
    }
  }

  private html(extensionUri: vscode.Uri): string {
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview.js"));
    const nonce = makeNonce();
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DriftLens — Architecture</title>
  <style>
    html, body { height: 100%; margin: 0; padding: 0;
      font-family: var(--vscode-font-family); color: var(--vscode-foreground);
      background: var(--vscode-editor-background); }
    #header { display: flex; align-items: center; gap: 16px; padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-panel-border); }
    #health { font-weight: 600; }
    #summary { opacity: 0.8; font-size: 12px; }
    #legend { display: flex; gap: 12px; font-size: 12px; opacity: 0.85; }
    .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px;
      margin-right: 4px; vertical-align: middle; }
    #cy { position: absolute; top: 41px; left: 0; right: 0; bottom: 0; }
    #empty { padding: 24px; opacity: 0.7; }
  </style>
</head>
<body>
  <div id="header">
    <span id="health">Architecture Health: —</span>
    <span id="summary"></span>
    <span id="legend">
      <span><span class="swatch" style="background:#3794ff"></span>component (by service)</span>
      <span><span class="swatch" style="background:#f14c4c"></span>drift origin</span>
      <span><span class="swatch" style="background:#f0a35e"></span>drift affected</span>
      <span><span class="swatch" style="background:#888"></span>external</span>
    </span>
  </div>
  <div id="empty">Analyzing workspace…</div>
  <div id="cy"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private dispose(): void {
    ArchitecturePanel.current = undefined;
    this.panel.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

function makeNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}
