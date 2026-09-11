import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { ConnectionGraph } from '../graphTypes';

// The Connection Graph webview. The page itself lives in src/webview/graph.ts
// (bundled to dist/webview/graph.js); this side builds the HTML and relays messages.

type PanelMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'export' }
  | { type: 'open'; path: string };

export interface GraphPanelHandlers {
  build: () => Promise<{ graph: ConnectionGraph; folder: vscode.WorkspaceFolder } | undefined>;
  exportMap: (graph: ConnectionGraph, folder: vscode.WorkspaceFolder) => void;
}

const ICON = {
  search: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 9.5a5 5 0 1 0-1 1l3.8 3.8 1-1-3.8-3.8zM6.5 10a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>',
  refresh: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9L10 6h4.5V1.5l-1.5 1.5A7 7 0 1 0 15 8h-1.5z"/></svg>',
  plus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7.25 2h1.5v5.25H14v1.5H8.75V14h-1.5V8.75H2v-1.5h5.25z"/></svg>',
  minus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 7.25h12v1.5H2z"/></svg>',
  fit: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h4v1.5H3.5V6H2zm8 0h4v4h-1.5V3.5H10zM2 10h1.5v2.5H6V14H2zm10.5 0H14v4h-4v-1.5h2.5z"/></svg>',
  folder: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3h4.8l1.5 1.5h6.7v8.5h-13zM3 6v5.5h10V6z"/></svg>',
  sparkle: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 1l1.2 3.8L11 6 7.2 7.2 6 11 4.8 7.2 1 6l3.8-1.2zm6 7l.7 2.3L15 11l-2.3.7L12 14l-.7-2.3L9 11l2.3-.7z"/></svg>',
};

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
  :root {
    --entry: var(--vscode-charts-blue, #3794ff);
    --used: var(--vscode-charts-green, #89d185);
    --maybe: var(--vscode-charts-yellow, #cca700);
    --unused: var(--vscode-charts-red, #f14c4c);
    --package: var(--vscode-charts-purple, #b180d7);
    --border: var(--vscode-panel-border, rgba(128,128,128,.35));
    --muted: var(--vscode-descriptionForeground);
    --surface: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    --radius: 6px;
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; }
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); display: flex; flex-direction: column; }
  svg { width: 16px; height: 16px; fill: currentColor; flex: none; }
  button { font: inherit; color: inherit; cursor: pointer; }
  button:focus-visible, input:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }

  /* Top bar */
  .topbar { display: flex; align-items: center; gap: 16px; padding: 10px 16px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .title-block { display: flex; flex-direction: column; min-width: 0; margin-right: auto; }
  .title { font-size: 1.15em; font-weight: 600; white-space: nowrap; }
  .title .project { color: var(--muted); font-weight: 400; }
  .meta { color: var(--muted); font-size: 0.88em; margin-top: 2px; }
  .search { display: flex; align-items: center; gap: 6px; padding: 0 8px; height: 28px; min-width: 260px; flex: 0 1 340px; border-radius: var(--radius); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--border)); color: var(--muted); }
  .search:focus-within { border-color: var(--vscode-focusBorder); }
  .search input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; color: var(--vscode-input-foreground); font: inherit; }
  .search .count { font-size: 0.85em; white-space: nowrap; }
  .search kbd { font-family: var(--vscode-editor-font-family); font-size: 0.8em; padding: 0 5px; border-radius: 3px; border: 1px solid var(--border); }
  .controls { display: flex; align-items: center; gap: 8px; }
  .segmented { display: inline-flex; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .segmented button { border: none; background: transparent; padding: 4px 12px; color: var(--muted); }
  .segmented button + button { border-left: 1px solid var(--border); }
  .segmented button.active { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .icon-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 28px; min-width: 28px; padding: 0 8px; border-radius: var(--radius); border: 1px solid var(--border); background: transparent; color: var(--muted); }
  .icon-btn:hover { background: var(--vscode-toolbar-hoverBackground); color: var(--vscode-foreground); }
  .icon-btn[aria-pressed="true"] { color: var(--vscode-foreground); background: var(--vscode-button-secondaryBackground); }
  .icon-btn:disabled { opacity: .4; cursor: default; }

  /* Status chips = legend + filter */
  .filters { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .filters .label { color: var(--muted); font-size: 0.88em; margin-right: 2px; }
  .chip { display: inline-flex; align-items: center; gap: 7px; padding: 3px 10px 3px 8px; border-radius: 999px; border: 1px solid var(--border); background: transparent; }
  .chip:hover { background: var(--vscode-toolbar-hoverBackground); }
  .chip .n { font-weight: 600; }
  .chip[aria-pressed="false"] { opacity: .45; }
  .chip[aria-pressed="false"] .name { text-decoration: line-through; }
  .filters .hint { margin-left: auto; color: var(--muted); font-size: 0.85em; }
  .shape { display: inline-block; width: 10px; height: 10px; flex: none; }
  .shape.entry { background: var(--entry); border-radius: 2px; }
  .shape.used { background: var(--used); border-radius: 50%; }
  .shape.maybe { background: var(--maybe); border-radius: 50%; }
  .shape.unused { background: var(--unused); border-radius: 50%; box-shadow: 0 0 0 3px color-mix(in srgb, var(--unused) 30%, transparent); }
  .shape.package { background: var(--package); transform: rotate(45deg) scale(.85); }

  /* Canvas and floating widgets */
  main { flex: 1; position: relative; min-height: 0; }
  #cy { position: absolute; inset: 0; cursor: grab; }
  #cy.over-node { cursor: pointer; }
  #cy.space-pan, #cy.space-pan.over-node { cursor: grab; }
  #cy.panning, #cy.panning.over-node { cursor: grabbing; }
  .filters kbd { font-family: var(--vscode-editor-font-family); font-size: 0.85em; padding: 0 4px; border-radius: 3px; border: 1px solid var(--border); }
  .floating { position: absolute; background: var(--surface); border: 1px solid var(--vscode-editorWidget-border, var(--border)); border-radius: var(--radius); box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgba(0,0,0,.25)); }
  .zoom { right: 16px; bottom: 16px; display: flex; flex-direction: column; overflow: hidden; }
  .zoom button { border: none; background: transparent; color: var(--muted); width: 32px; height: 30px; display: flex; align-items: center; justify-content: center; }
  .zoom button + button { border-top: 1px solid var(--border); }
  .zoom button:hover { background: var(--vscode-toolbar-hoverBackground); color: var(--vscode-foreground); }
  .legend { left: 16px; bottom: 16px; padding: 8px 12px; font-size: 0.85em; color: var(--muted); display: grid; grid-template-columns: auto auto; gap: 4px 18px; }
  .legend .row { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
  /* Match the edge styles in src/webview/graph.ts. */
  .line { display: inline-block; width: 24px; border-top: 2px solid color-mix(in srgb, var(--vscode-editor-foreground) 55%, transparent); }
  .line.type { border-top-style: dashed; }
  .line.config { border-top-style: dotted; border-top-width: 3px; }
  .line.maybe { border-top-style: dashed; border-color: var(--maybe); }
  .line.to-package { border-color: color-mix(in srgb, var(--package) 65%, transparent); }
  .line.out { width: 16px; border-top-width: 3px; border-color: var(--vscode-focusBorder); }
  .line.in { width: 16px; border-top-width: 3px; border-color: var(--vscode-charts-orange, #d18616); }
  .tooltip { position: absolute; pointer-events: none; padding: 6px 10px; max-width: 320px; font-size: 0.88em; z-index: 5; }
  .tooltip .t-name { font-weight: 600; }
  .tooltip .t-path { color: var(--muted); font-family: var(--vscode-editor-font-family); word-break: break-all; }
  .tooltip .t-reason { margin-top: 4px; }

  /* Details panel */
  .details { top: 16px; right: 16px; bottom: 16px; width: 340px; display: flex; flex-direction: column; overflow: hidden; }
  .d-head { display: flex; align-items: flex-start; gap: 10px; padding: 14px 14px 10px; }
  .d-head .shape { width: 14px; height: 14px; margin-top: 4px; }
  .d-titles { flex: 1; min-width: 0; }
  .d-name { font-weight: 600; font-size: 1.08em; word-break: break-all; }
  .d-path { color: var(--muted); font-family: var(--vscode-editor-font-family); font-size: 0.88em; word-break: break-all; margin-top: 2px; }
  .d-close { border: none; background: transparent; color: var(--muted); padding: 2px; border-radius: 4px; }
  .d-close:hover { background: var(--vscode-toolbar-hoverBackground); color: var(--vscode-foreground); }
  .d-body { overflow: auto; padding: 0 14px 14px; }
  .pill { display: inline-block; font-size: 0.82em; font-weight: 600; padding: 1px 9px; border-radius: 999px; border: 1px solid currentColor; }
  .pill.entry { color: var(--entry); } .pill.used { color: var(--used); } .pill.maybe { color: var(--maybe); } .pill.unused { color: var(--unused); }
  .kind { color: var(--muted); font-size: 0.85em; margin-left: 6px; }
  .callout { margin: 12px 0; padding: 8px 10px; border-radius: 4px; border-left: 3px solid var(--muted); background: var(--vscode-textBlockQuote-background, rgba(128,128,128,.1)); line-height: 1.45; }
  .callout.entry { border-color: var(--entry); } .callout.used { border-color: var(--used); } .callout.maybe { border-color: var(--maybe); } .callout.unused { border-color: var(--unused); }
  .callout .c-label { font-size: 0.78em; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); margin-bottom: 2px; }
  .actions { display: flex; gap: 8px; margin-bottom: 6px; }
  .btn { border: none; border-radius: 3px; padding: 5px 14px; }
  .btn.primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  .btn.primary:hover { background: var(--vscode-button-hoverBackground); }
  .btn.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  .btn.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .d-body h3 { display: flex; align-items: center; gap: 6px; font-size: 0.78em; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); margin: 18px 0 6px; }
  .d-body h3 .count { padding: 0 6px; border-radius: 999px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .d-body ul { list-style: none; margin: 0; padding: 0; }
  .d-body li button { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; border: none; background: transparent; padding: 4px 6px; border-radius: 4px; }
  .d-body li button:hover { background: var(--vscode-list-hoverBackground); }
  .d-body li .li-name { font-family: var(--vscode-editor-font-family); font-size: 0.92em; }
  .d-body li .li-dir { color: var(--muted); font-size: 0.85em; margin-left: auto; padding-left: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 45%; }
  .d-body li .tag { font-size: 0.75em; color: var(--muted); border: 1px solid var(--border); border-radius: 3px; padding: 0 4px; }
  .d-body .none { color: var(--muted); padding: 2px 6px; }

  /* Overlays */
  .overlay { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 12px; align-items: center; justify-content: center; color: var(--muted); text-align: center; padding: 24px; }
  .overlay.error { color: var(--vscode-errorForeground); }
  .spinner { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--border); border-top-color: var(--vscode-progressBar-background, var(--entry)); animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
  <header class="topbar">
    <div class="title-block">
      <div class="title">Connection Graph <span class="project" id="project"></span></div>
      <div class="meta" id="meta">Building…</div>
    </div>
    <label class="search" title="Search files and packages">
      ${ICON.search}
      <input type="search" id="search" placeholder="Search files and packages" aria-label="Search files and packages">
      <span class="count" id="search-count"></span>
      <kbd>/</kbd>
    </label>
    <div class="controls">
      <div class="segmented" role="group" aria-label="Layout">
        <button data-layout="force" class="active" title="Group files by folder">Clusters</button>
        <button data-layout="tree" title="Flow from the entry points">Tree</button>
      </div>
      <button class="icon-btn" id="toggle-folders" aria-pressed="true" title="Group files in folder boxes">${ICON.folder} Folders</button>
      <button class="icon-btn" id="export-ai" title="Export a compact project map for AI agents, so they understand the structure without reading every file">${ICON.sparkle} Export for AI</button>
      <button class="icon-btn" id="refresh" title="Rebuild the graph">${ICON.refresh}</button>
    </div>
  </header>
  <nav class="filters" id="filters" aria-label="Show or hide by status"></nav>
  <main>
    <div id="cy" aria-label="Connection graph"></div>
    <div id="loading" class="overlay"><div class="spinner"></div>Building the connection graph…</div>
    <div id="empty" class="overlay" hidden>Nothing to show with the current filters.<br>Click a status above to show it again.</div>
    <div id="error" class="overlay error" hidden></div>
    <div id="tooltip" class="floating tooltip" hidden></div>
    <div class="floating legend" id="legend" aria-label="Legend">
      <span class="row"><span class="shape entry"></span>entry point</span>
      <span class="row"><span class="line"></span>import</span>
      <span class="row"><span class="shape used"></span>file</span>
      <span class="row"><span class="line type"></span>type-only import</span>
      <span class="row"><span class="shape package"></span>package</span>
      <span class="row"><span class="line config"></span>path in a config</span>
      <span class="row"><span class="shape unused"></span>unused</span>
      <span class="row"><span class="line maybe"></span>computed import</span>
      <span class="row"></span>
      <span class="row"><span class="line to-package"></span>uses a package</span>
    </div>
    <div class="floating zoom" role="group" aria-label="Zoom">
      <button id="zoom-in" title="Zoom in">${ICON.plus}</button>
      <button id="zoom-out" title="Zoom out">${ICON.minus}</button>
      <button id="fit" title="Fit to screen (F)">${ICON.fit}</button>
    </div>
    <aside id="details" class="floating details" hidden aria-live="polite"></aside>
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
  private graph: ConnectionGraph | undefined;
  private readonly panel: vscode.WebviewPanel;

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
  ) {
    this.pendingFocus = focusId;
    this.panel = vscode.window.createWebviewPanel(
      'deadweight.graph',
      'Deadweight: Connection Graph',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
      },
    );

    const { panel } = this;
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
        case 'export':
          if (this.graph && this.folder) {
            this.handlers.exportMap(this.graph, this.folder);
          }
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
      this.graph = built.graph;
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
