import * as vscode from "vscode";
import { DriftLensController, type AnalysisState } from "./controller.js";
import { ArchitecturePanel } from "./panel.js";

export function activate(context: vscode.ExtensionContext): void {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    context.subscriptions.push(
      vscode.commands.registerCommand("driftlens.showArchitecture", () =>
        vscode.window.showInformationMessage("DriftLens: open a folder to analyze."),
      ),
    );
    return;
  }

  const controller = new DriftLensController(folder);
  context.subscriptions.push(controller);

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = "driftlens.showArchitecture";
  status.text = "$(pulse) DriftLens";
  status.tooltip = "Show architecture";
  status.show();
  context.subscriptions.push(status);
  context.subscriptions.push(controller.onDidChange((state) => updateStatus(status, state)));

  context.subscriptions.push(
    vscode.commands.registerCommand("driftlens.showArchitecture", () =>
      ArchitecturePanel.show(context.extensionUri, controller, folder),
    ),
    vscode.commands.registerCommand("driftlens.refresh", () => runFullAnalysis(controller)),
  );

  registerWatcher(context, controller, folder);

  void runFullAnalysis(controller);
}

export function deactivate(): void {
  /* controller & disposables are cleaned up via context.subscriptions */
}

function runFullAnalysis(controller: DriftLensController): Thenable<void> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: "DriftLens: analyzing…" },
    () => controller.analyzeAll(),
  );
}

function updateStatus(status: vscode.StatusBarItem, state: AnalysisState): void {
  const drift = state.drift;
  if (!drift) {
    status.text = `$(pulse) DriftLens`;
    status.tooltip = "No .driftlens.yml — showing architecture only";
    status.backgroundColor = undefined;
    return;
  }
  const errors = drift.events.filter((e) => e.severity === "error").length;
  status.text = `$(pulse) Architecture Health: ${drift.healthScore}%`;
  status.tooltip =
    errors > 0
      ? `${errors} drift issue(s) detected — click to inspect`
      : "No drift detected — click to inspect";
  status.backgroundColor =
    errors > 0 ? new vscode.ThemeColor("statusBarItem.warningBackground") : undefined;
}

/** Watch source files and the config, debouncing bursts of file events. */
function registerWatcher(
  context: vscode.ExtensionContext,
  controller: DriftLensController,
  folder: vscode.WorkspaceFolder,
): void {
  const include = vscode.workspace.getConfiguration("driftlens").get<string>("include")!;
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(folder, `{${include},.driftlens.yml}`),
  );
  context.subscriptions.push(watcher);

  const changed = new Map<string, vscode.Uri>();
  const deleted = new Map<string, vscode.Uri>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = (): void => {
    timer = undefined;
    const toUpdate = [...changed.values()];
    const toDelete = [...deleted.values()];
    changed.clear();
    deleted.clear();
    for (const uri of toDelete) controller.removeFile(uri);
    void Promise.all(toUpdate.map((uri) => controller.updateFile(uri)));
  };

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 150);
  };

  const onChange = (uri: vscode.Uri): void => {
    deleted.delete(uri.toString());
    changed.set(uri.toString(), uri);
    schedule();
  };
  const onDelete = (uri: vscode.Uri): void => {
    changed.delete(uri.toString());
    deleted.set(uri.toString(), uri);
    schedule();
  };

  watcher.onDidChange(onChange);
  watcher.onDidCreate(onChange);
  watcher.onDidDelete(onDelete);
}
