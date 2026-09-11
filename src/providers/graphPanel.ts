import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { ConnectionGraph } from '../graphTypes';

// The Connection Graph webview. The page itself lives in src/webview/graph.ts
// (bundled to dist/webview/graph.js); this side builds the HTML and relays messages.

type PanelMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'open'; path: string };

export interface GraphPanelHandlers {
  build: () => Promise<{ graph: ConnectionGraph; folder: vscode.WorkspaceFolder } | undefined>;
}

function renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri, nonce: string): string {
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'graph.js'));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Connection Graph</title>
<style>
  html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; }
  [hidden] { display: none !important; }
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); display: flex; flex-direction: column; }
  header { padding: 10px 14px 8px; border-bottom: 1px solid var(--vscode-panel-border); display: flex; flex-direction: column; gap: 8px; }
  h1 { font-size: 1.15em; font-weight: 600; margin: 0; }
  .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .chip { display: inline-flex; align-items: center; gap: 5px; padding: 1px 8px; border-radius: 10px; border: 1px solid var(--vscode-panel-border); }
  .muted { color: var(--vscode-descriptionForeground); }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; flex: none; }
  .dot.entry { background: var(--vscode-charts-blue); border-radius: 2px; }
  .dot.used { background: var(--vscode-charts-green); }
  .dot.maybe { background: var(--vscode-charts-yellow); }
  .dot.unused { background: var(--vscode-charts-red); }
  .diamond { display: inline-block; width: 8px; height: 8px; transform: rotate(45deg); background: var(--vscode-descriptionForeground); }
  label { display: inline-flex; gap: 4px; align-items: center; cursor: pointer; }
  input[type="search"] { font: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); padding: 3px 6px; min-width: 220px; }
  select { font: inherit; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border); padding: 2px 4px; }
  button { font: inherit; padding: 3px 12px; border: none; border-radius: 2px; cursor: pointer; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button#open-file { color: var(--vscode-button-foreground); background: var(--vscode-button-background); margin: 4px 0 8px; }
  button.icon { background: transparent; padding: 0 4px; color: var(--vscode-descriptionForeground); }
  main { flex: 1; position: relative; min-height: 0; }
  #cy { position: absolute; inset: 0; }
  #details { position: absolute; top: 12px; right: 12px; bottom: 12px; width: 330px; overflow: auto; padding: 12px 14px; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border)); box-shadow: 0 2px 8px var(--vscode-widget-shadow); }
  #details h2 { font-size: 1em; font-family: var(--vscode-editor-font-family); word-break: break-all; margin: 8px 0 4px; }
  #details h3 { font-size: 0.9em; font-weight: 600; margin: 14px 0 4px; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.04em; }
  #details ul { list-style: none; margin: 0; padding: 0; }
  #details li { padding: 2px 0; font-family: var(--vscode-editor-font-family); font-size: 0.92em; word-break: break-all; }
  #details li a { color: var(--vscode-textLink-foreground); text-decoration: none; display: inline-flex; gap: 6px; align-items: center; }
  #details li a:hover { text-decoration: underline; }
  .details-header { display: flex; justify-content: space-between; align-items: center; }
  .reason { margin: 6px 0; line-height: 1.4; }
  .badge { font-size: 0.85em; padding: 1px 8px; border-radius: 8px; border: 1px solid currentColor; }
  .badge.entry { color: var(--vscode-charts-blue); }
  .badge.used { color: var(--vscode-charts-green); }
  .badge.maybe { color: var(--vscode-charts-yellow); }
  .badge.unused { color: var(--vscode-charts-red); }
  .overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--vscode-descriptionForeground); }
  #error { color: var(--vscode-errorForeground); padding: 24px; text-align: center; }
  .legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 0.9em; }
  .line { display: inline-block; width: 22px; border-top: 2px solid var(--vscode-editorLineNumber-foreground); vertical-align: middle; }
  .line.dashed { border-top-style: dashed; border-color: var(--vscode-charts-yellow); }
  .line.dotted { border-top-style: dotted; }
</style>
</head>
<body>
  <header>
    <div class="row">
      <h1 id="title">Connection Graph</h1>
      <div class="row" id="stats"></div>
    </div>
    <div class="row">
      <input type="search" id="search" placeholder="Find a file or package…">
      <label><input type="checkbox" id="only-problems"> Only unused &amp; maybe</label>
      <label><input type="checkbox" id="show-packages" checked> Packages</label>
      <label><input type="checkbox" id="group-folders" checked> Group by folder</label>
      <label>Layout <select id="layout"><option value="force">Clusters</option><option value="tree">Tree from entries</option></select></label>
      <button id="fit">Fit</button>
      <button id="refresh">Rebuild</button>
    </div>
    <div class="legend muted">
      <span><span class="dot entry"></span> entry point</span>
      <span><span class="dot used"></span> used</span>
      <span><span class="dot maybe"></span> maybe (computed import / can't prove)</span>
      <span><span class="dot unused"></span> unused</span>
      <span><span class="diamond"></span> package</span>
      <span><span class="line"></span> import</span>
      <span><span class="line dotted"></span> referenced by config</span>
      <span><span class="line dashed"></span> computed import</span>
      <span>Click a node for details · double-click to open</span>
    </div>
  </header>
  <main>
    <div id="cy"></div>
    <div id="loading" class="overlay">Building the connection graph…</div>
    <div id="empty" class="overlay" hidden>Nothing to show with the current filters.</div>
    <div id="error" class="overlay" hidden></div>
    <aside id="details" hidden></aside>
  </main>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}

export class GraphPanel {
  private static current: GraphPanel | undefined;

  private ready = false;
  private pendingFocus: string | undefined;
  private folder: vscode.WorkspaceFolder | undefined;

  static show(extensionUri: vscode.Uri, handlers: GraphPanelHandlers, focusId?: string) {
    if (GraphPanel.current) {
      GraphPanel.current.panel.reveal(vscode.ViewColumn.Active);

      if (focusId) {
        GraphPanel.current.focus(focusId);
      }

      return;
    }

    GraphPanel.current = new GraphPanel(extensionUri, handlers, focusId);
  }

  private constructor(
    extensionUri: vscode.Uri,
    private readonly handlers: GraphPanelHandlers,
    focusId: string | undefined,
    private readonly panel = vscode.window.createWebviewPanel(
      'deadweight.graph',
      'Deadweight: Connection Graph',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
      },
    ),
  ) {
    this.pendingFocus = focusId;
    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'icon.png');
    panel.webview.html = renderHtml(panel.webview, extensionUri, randomBytes(16).toString('hex'));

    panel.webview.onDidReceiveMessage((message: PanelMessage) => {
      switch (message.type) {
        case 'ready':
          this.ready = true;
          void this.rebuild();
          break;
        case 'refresh':
          void this.rebuild();
          break;
        case 'open':
          if (this.folder && typeof message.path === 'string') {
            void vscode.commands.executeCommand(
              'vscode.open',
              vscode.Uri.joinPath(this.folder.uri, message.path),
              { viewColumn: vscode.ViewColumn.Beside, preview: true },
            );
          }
          break;
      }
    });

    panel.onDidDispose(() => {
      GraphPanel.current = undefined;
    });
  }

  private focus(id: string) {
    if (this.ready) {
      void this.panel.webview.postMessage({ type: 'focus', id });
    } else {
      this.pendingFocus = id;
    }
  }

  private async rebuild() {
    try {
      const built = await this.handlers.build();

      if (!built) {
        this.panel.dispose();
        return;
      }

      this.folder = built.folder;
      await this.panel.webview.postMessage({ type: 'graph', graph: built.graph, folderName: built.folder.name });

      if (this.pendingFocus) {
        await this.panel.webview.postMessage({ type: 'focus', id: this.pendingFocus });
        this.pendingFocus = undefined;
      }
    } catch (error) {
      await this.panel.webview.postMessage({
        type: 'error',
        message: `Couldn't build the connection graph: ${(error as Error).message}`,
      });
    }
  }
}
