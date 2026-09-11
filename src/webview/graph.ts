// Runs inside the Connection Graph webview. Bundled separately (browser, IIFE) by
// esbuild.js into dist/webview/graph.js. Talks to the extension via postMessage.
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import type { ConnectionGraph, EdgeKind, GraphNode, NodeStatus } from '../graphTypes';

// fcose lays out folder groups properly and packs unconnected pieces tightly,
// which cytoscape's built-in cose does poorly.
cytoscape.use(fcose);

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

type InboundMessage =
  | { type: 'graph'; graph: ConnectionGraph; folderName: string }
  | { type: 'focus'; id: string }
  | { type: 'error'; message: string };

// Each chip filters one group; 'package' covers every package node.
type FilterKey = NodeStatus | 'package';

const vscode = acquireVsCodeApi();

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const STATUS_LABEL: Record<NodeStatus, string> = {
  entry: 'Entry point',
  used: 'Used',
  maybe: 'Maybe used',
  unused: 'Unused',
};

const CHIPS: { key: FilterKey; name: string; title: string }[] = [
  { key: 'entry', name: 'Entry points', title: 'Files the app starts from: main, bin, framework pages, configs, tests' },
  { key: 'used', name: 'Used', title: 'Reachable from an entry point' },
  { key: 'maybe', name: 'Maybe', title: "Can't be proven either way, e.g. loaded by a computed import" },
  { key: 'unused', name: 'Unused', title: 'Nothing reachable uses it' },
  { key: 'package', name: 'Packages', title: 'Dependencies from package.json' },
];

const EDGE_TAG: Partial<Record<EdgeKind, string>> = {
  type: 'type',
  config: 'config',
  maybe: 'computed',
  dynamic: 'dynamic',
};

// --- State ------------------------------------------------------------------------

interface ViewState {
  hidden: FilterKey[];
  groupFolders: boolean;
  layout: 'force' | 'tree';
}

const saved = (vscode.getState() ?? {}) as Partial<ViewState>;

const state = {
  hidden: new Set<FilterKey>(saved.hidden ?? []),
  groupFolders: saved.groupFolders ?? true,
  layout: saved.layout ?? 'force',
  hasSavedFilters: Array.isArray(saved.hidden),
};

function persist() {
  vscode.setState({ hidden: [...state.hidden], groupFolders: state.groupFolders, layout: state.layout } satisfies ViewState);
}

let cy: cytoscape.Core | undefined;
let graph: ConnectionGraph | undefined;
let nodesById = new Map<string, GraphNode>();
let searchMatches: string[] = [];
let searchIndex = -1;

// --- Helpers ----------------------------------------------------------------------

function themeColor(variable: string, fallback: string): string {
  return getComputedStyle(document.body).getPropertyValue(variable).trim() || fallback;
}

// `color` (#rgb, #rrggbb, #rrggbbaa or rgb()/rgba()) at the given opacity, as rgba().
// Lets edges take the theme's text color and stay readable on light and dark themes.
function withAlpha(color: string, alpha: number): string {
  const hex = color.match(/^#([\da-f]{3,8})$/i)?.[1];
  let channels: number[] | undefined;

  if (hex && (hex.length === 3 || hex.length === 4)) {
    channels = [...hex.slice(0, 3)].map((digit) => parseInt(digit + digit, 16));
  } else if (hex && (hex.length === 6 || hex.length === 8)) {
    channels = [0, 2, 4].map((start) => parseInt(hex.slice(start, start + 2), 16));
  } else {
    channels = color.match(/^rgba?\(([^)]+)\)$/i)?.[1].split(/[\s,/]+/).slice(0, 3).map(Number);
  }

  return channels && channels.length === 3 && channels.every((n) => Number.isFinite(n))
    ? `rgba(${channels.join(', ')}, ${alpha})`
    : color;
}

function colors() {
  const text = themeColor('--vscode-editor-foreground', '#cccccc');
  const packageColor = themeColor('--vscode-charts-purple', '#b180d7');

  return {
    entry: themeColor('--vscode-charts-blue', '#3794ff'),
    used: themeColor('--vscode-charts-green', '#89d185'),
    maybe: themeColor('--vscode-charts-yellow', '#cca700'),
    unused: themeColor('--vscode-charts-red', '#f14c4c'),
    package: packageColor,
    text,
    muted: themeColor('--vscode-descriptionForeground', '#999999'),
    // Edges use the text color, so they contrast with the background on any theme.
    edge: withAlpha(text, 0.55),
    packageEdge: withAlpha(packageColor, 0.65),
    incoming: themeColor('--vscode-charts-orange', '#d18616'),
    border: themeColor('--vscode-panel-border', '#444444'),
    background: themeColor('--vscode-editor-background', '#1e1e1e'),
    folder: themeColor('--vscode-sideBar-background', '#252526'),
    selection: themeColor('--vscode-focusBorder', '#007fd4'),
  };
}

// Edge widths are in graph units, so zooming out on a big graph shrinks lines to
// hairlines. Widths are multiplied by this, stepped so zooming doesn't restyle
// every frame.
let edgeScale = 1;

function edgeScaleFor(zoom: number): number {
  const raw = Math.min(3, Math.max(1, Math.pow(zoom, -0.6)));
  return Math.round(raw * 4) / 4;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function splitPath(node: GraphNode): { name: string; dir: string } {
  if (node.kind === 'package') {
    return { name: node.label, dir: 'package' };
  }

  const path = node.path ?? node.label;
  const slash = path.lastIndexOf('/');

  return slash === -1 ? { name: path, dir: '' } : { name: path.slice(slash + 1), dir: path.slice(0, slash) };
}

function folderOf(node: GraphNode): string {
  if (node.kind === 'package') {
    return 'dir:(packages)';
  }

  const { dir } = splitPath(node);
  return `dir:${dir || '.'}`;
}

function shapeClass(node: GraphNode): string {
  if (node.kind === 'package') {
    return 'package';
  }

  return node.status;
}

const isProblem = (node: GraphNode) => node.status === 'maybe' || node.status === 'unused';

function isFilteredOut(node: GraphNode): boolean {
  return state.hidden.has(node.status) || (node.kind === 'package' && state.hidden.has('package'));
}

// --- Filters & elements -----------------------------------------------------------------

// Shown nodes, plus faded "context" nodes: hidden neighbours of a shown problem, so
// a dead file still shows what it points at.
function visibleNodes(): { shown: GraphNode[]; context: Set<string> } {
  if (!graph) {
    return { shown: [], context: new Set() };
  }

  const shown = graph.nodes.filter((node) => !isFilteredOut(node));
  const shownIds = new Set(shown.map((node) => node.id));
  const context = new Set<string>();

  const anyHidden = state.hidden.size > 0;

  if (anyHidden) {
    const problems = new Set(shown.filter(isProblem).map((node) => node.id));

    for (const edge of graph.edges) {
      for (const [from, to] of [[edge.from, edge.to], [edge.to, edge.from]]) {
        const neighbour = nodesById.get(to);

        if (problems.has(from) && neighbour && !shownIds.has(to) && !(neighbour.kind === 'package' && state.hidden.has('package'))) {
          context.add(to);
        }
      }
    }
  }

  return { shown: [...shown, ...[...context].map((id) => nodesById.get(id)!)], context };
}

const grouped = () => state.groupFolders && state.layout !== 'tree';

function buildElements(): cytoscape.ElementDefinition[] {
  const { shown, context } = visibleNodes();
  const ids = new Set(shown.map((node) => node.id));
  const elements: cytoscape.ElementDefinition[] = [];

  if (grouped()) {
    for (const folder of new Set(shown.map(folderOf))) {
      const label = folder === 'dir:(packages)' ? 'packages' : folder === 'dir:.' ? '(root)' : folder.slice(4);
      elements.push({ data: { id: folder, label }, classes: 'folder' });
    }
  }

  for (const node of shown) {
    elements.push({
      data: { id: node.id, label: node.label, parent: grouped() ? folderOf(node) : undefined },
      classes: [node.kind, node.status, context.has(node.id) ? 'context' : ''].join(' '),
    });
  }

  graph!.edges
    .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
    .forEach((edge, index) => {
      elements.push({
        data: { id: `e${index}`, source: edge.from, target: edge.to },
        classes: `${edge.kind} ${edge.to.startsWith('package:') ? 'to-package' : ''}`,
      });
    });

  return elements;
}

// --- Styles & layout --------------------------------------------------------------------

function style(): cytoscape.StylesheetJson {
  const c = colors();
  const tree = state.layout === 'tree';
  const w = (px: number) => px * edgeScale;

  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        color: c.text,
        'font-size': 11,
        'font-family': 'var(--vscode-font-family), sans-serif',
        'text-valign': 'bottom',
        'text-margin-y': 5,
        'text-max-width': '140px',
        'text-wrap': 'ellipsis',
        'text-background-color': c.background,
        'text-background-opacity': 0.75,
        'text-background-padding': '2px',
        'text-background-shape': 'roundrectangle',
        'min-zoomed-font-size': 7,
        width: 16,
        height: 16,
        'border-width': 0,
        'background-color': c.used,
        'transition-property': 'opacity, border-width',
        'transition-duration': 150,
      },
    },
    { selector: 'node.entry', style: { 'background-color': c.entry, shape: 'round-rectangle', width: 20, height: 20, 'font-weight': 600 } },
    { selector: 'node.maybe', style: { 'background-color': c.background, 'border-width': 3, 'border-color': c.maybe, 'border-style': 'dashed' } },
    {
      selector: 'node.unused',
      style: {
        'background-color': c.unused,
        width: 20,
        height: 20,
        'underlay-color': c.unused,
        'underlay-opacity': 0.25,
        'underlay-padding': 6,
        'underlay-shape': 'ellipse',
      },
    },
    { selector: 'node.package', style: { shape: 'diamond', width: 15, height: 15, color: c.muted, 'font-size': 10 } },
    { selector: 'node.package.used', style: { 'background-color': c.package } },
    { selector: 'node.package.unused', style: { 'underlay-shape': 'ellipse' } },
    {
      selector: 'node.folder',
      style: {
        shape: 'round-rectangle',
        'background-color': c.folder,
        'background-opacity': 0.3,
        'border-width': 1,
        'border-color': c.border,
        color: c.muted,
        'font-size': 10,
        'font-weight': 600,
        'text-transform': 'uppercase',
        'text-valign': 'top',
        'text-halign': 'center',
        'text-margin-y': -6,
        'text-background-opacity': 0,
        padding: '16px',
        'min-zoomed-font-size': 6,
      },
    },
    { selector: 'node.context', style: { opacity: 0.35 } },
    {
      selector: 'edge',
      style: {
        width: w(1.6),
        'line-color': c.edge,
        'line-cap': 'round',
        'target-arrow-color': c.edge,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 1.05,
        'target-distance-from-node': 2,
        'curve-style': tree ? 'taxi' : 'bezier',
        'taxi-direction': 'downward',
        'taxi-turn': '50%',
        // Draw above folder boxes; otherwise edges crossing a box disappear behind it.
        'z-compound-depth': 'top',
        'transition-property': 'opacity, line-color, width',
        'transition-duration': 150,
      },
    },
    { selector: 'edge.to-package', style: { width: w(1.3), 'line-color': c.packageEdge, 'target-arrow-color': c.packageEdge } },
    { selector: 'edge.type', style: { 'line-style': 'dashed', 'line-dash-pattern': [6, 4] } },
    { selector: 'edge.config', style: { 'line-style': 'dotted', width: w(2.2) } },
    { selector: 'edge.maybe', style: { 'line-style': 'dashed', 'line-dash-pattern': [6, 4], 'line-color': c.maybe, 'target-arrow-color': c.maybe } },
    { selector: '.faded', style: { opacity: 0.12, 'underlay-opacity': 0.02 } },
    { selector: 'edge.hover', style: { width: w(2.6), 'line-color': c.selection, 'target-arrow-color': c.selection, 'arrow-scale': 1.25, 'z-index': 10 } },
    // Selected node: what it imports in the focus color, what imports it in orange.
    { selector: 'edge.highlighted', style: { width: w(2.8), opacity: 1, 'arrow-scale': 1.3, 'z-index': 10 } },
    { selector: 'edge.hl-out', style: { 'line-color': c.selection, 'target-arrow-color': c.selection } },
    { selector: 'edge.hl-in', style: { 'line-color': c.incoming, 'target-arrow-color': c.incoming } },
    { selector: 'node:selected', style: { 'border-width': 3, 'border-color': c.selection, 'border-style': 'solid' } },
    { selector: 'node.match', style: { 'border-width': 3, 'border-color': c.selection, 'border-style': 'solid' } },
    { selector: 'node.hover', style: { 'border-width': 2, 'border-color': c.text, 'border-style': 'solid' } },
  ] as unknown as cytoscape.StylesheetJson;
}

function layoutOptions(nodeCount: number): cytoscape.LayoutOptions {
  const animate = nodeCount <= 250;

  if (state.layout === 'tree') {
    const roots = cy!.nodes('.entry').map((node) => node.id());

    return {
      name: 'breadthfirst',
      directed: true,
      spacingFactor: 1.15,
      roots: roots.length > 0 ? roots.map((id) => `[id = "${id}"]`).join(',') : undefined,
      animate,
      animationDuration: 350,
      padding: 40,
    } as cytoscape.LayoutOptions;
  }

  return {
    name: 'fcose',
    quality: 'proof',
    randomize: true,
    animate: animate ? 'end' : false,
    animationDuration: 350,
    fit: true,
    padding: 40,
    nodeDimensionsIncludeLabels: true,
    packComponents: true,
    nodeRepulsion: () => 6000,
    idealEdgeLength: () => 75,
    edgeElasticity: () => 0.45,
    nestingFactor: 0.1,
    gravity: 0.35,
    gravityCompound: 1.2,
    gravityRangeCompound: 1.5,
    tilingPaddingVertical: 16,
    tilingPaddingHorizontal: 16,
  } as cytoscape.LayoutOptions;
}

// --- Rendering ----------------------------------------------------------------------------

function render() {
  if (!graph) {
    return;
  }

  cy?.destroy();
  hideTooltip();

  cy = cytoscape({
    container: $('cy'),
    elements: buildElements(),
    style: style(),
    wheelSensitivity: 0.25,
    minZoom: 0.05,
    maxZoom: 3,
  });

  const nodeCount = cy.nodes().not('.folder').length;
  const layout = cy.layout(layoutOptions(nodeCount));
  layout.one('layoutstop', () => capZoom());
  layout.run();

  cy.on('tap', 'node', (event) => {
    const id = event.target.id() as string;

    if (!id.startsWith('dir:')) {
      select(id);
    }
  });

  cy.on('dbltap', 'node.file', (event) => openFile(event.target.id()));

  cy.on('tap', (event) => {
    if (event.target === cy) {
      clearSelection();
    }
  });

  cy.on('mouseover', 'node', (event) => {
    const element = event.target as cytoscape.NodeSingular;

    if (element.hasClass('folder')) {
      return;
    }

    element.addClass('hover');
    element.connectedEdges().addClass('hover');
    showTooltip(element);
  });

  cy.on('mouseout', 'node', (event) => {
    const element = event.target as cytoscape.NodeSingular;
    element.removeClass('hover');
    element.connectedEdges().removeClass('hover');
    hideTooltip();
  });

  cy.on('pan zoom', hideTooltip);

  // Keep edges legible at any zoom; restyle only when the stepped scale changes.
  let scaleQueued = false;

  cy.on('zoom', () => {
    if (scaleQueued) {
      return;
    }

    scaleQueued = true;

    requestAnimationFrame(() => {
      scaleQueued = false;
      const next = cy ? edgeScaleFor(cy.zoom()) : edgeScale;

      if (cy && next !== edgeScale) {
        edgeScale = next;
        cy.style(style());
      }
    });
  });

  $('empty').hidden = nodeCount > 0;
  renderChips();
  syncControls();
}

function renderMeta(folderName: string) {
  const g = graph!;

  $('project').textContent = `· ${folderName}`;
  $('meta').textContent = `${g.stats.files} files · ${g.stats.packages} packages · ${g.edges.length} connections · built in ${g.durationMs} ms`;
}

function renderChips() {
  if (!graph) {
    return;
  }

  const count = (key: FilterKey) => key === 'package'
    ? graph!.nodes.filter((node) => node.kind === 'package').length
    : graph!.nodes.filter((node) => node.status === key).length;

  $('filters').innerHTML = `
    <span class="label">Show</span>
    ${CHIPS.map(({ key, name, title }) => `
      <button class="chip" data-filter="${key}" aria-pressed="${!state.hidden.has(key)}" title="${escapeHtml(title)} · click to ${state.hidden.has(key) ? 'show' : 'hide'}">
        <span class="shape ${key}"></span><span class="name">${name}</span><span class="n">${count(key)}</span>
      </button>`).join('')}
    <span class="hint">Click a node for details · double-click to open · <kbd>F</kbd> to fit</span>
  `;

  for (const chip of $('filters').querySelectorAll<HTMLButtonElement>('[data-filter]')) {
    chip.addEventListener('click', () => {
      const key = chip.dataset.filter as FilterKey;

      if (state.hidden.has(key)) {
        state.hidden.delete(key);
      } else {
        state.hidden.add(key);
      }

      persist();
      render();
      clearSelection();
    });
  }
}

function syncControls() {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-layout]')) {
    button.classList.toggle('active', button.dataset.layout === state.layout);
  }

  const folders = $<HTMLButtonElement>('toggle-folders');
  folders.setAttribute('aria-pressed', String(grouped()));
  folders.disabled = state.layout === 'tree';
  folders.title = state.layout === 'tree' ? 'Folder boxes are off in the tree layout' : 'Group files in folder boxes';
}

// --- Viewport ------------------------------------------------------------------------------

function fitAll(animate = true) {
  if (!cy || cy.elements().empty()) {
    return;
  }

  cy.resize();

  if (animate) {
    cy.animate({ fit: { eles: cy.elements(), padding: 40 }, duration: 250, complete: capZoom });
  } else {
    cy.fit(cy.elements(), 40);
    capZoom();
  }
}

// A tiny graph fitted to the screen looks blown up; keep it at a readable size.
function capZoom() {
  if (cy && cy.zoom() > 1.3) {
    cy.zoom({ level: 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    cy.center();
  }
}

function zoomBy(factor: number) {
  if (cy) {
    cy.animate({ zoom: { level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }, duration: 150 });
  }
}

let resizeTimer: number | undefined;

window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => fitAll(false), 150);
});

// --- Tooltip ---------------------------------------------------------------------------------

function showTooltip(element: cytoscape.NodeSingular) {
  const node = nodesById.get(element.id());

  if (!node) {
    return;
  }

  const tooltip = $('tooltip');
  const { name, dir } = splitPath(node);
  const position = element.renderedPosition();

  tooltip.innerHTML = `
    <div class="t-name">${escapeHtml(name)} <span class="pill ${node.status}">${STATUS_LABEL[node.status]}</span></div>
    ${dir ? `<div class="t-path">${escapeHtml(dir)}</div>` : ''}
    <div class="t-reason">${escapeHtml(node.reason)}</div>`;
  tooltip.hidden = false;

  const container = $('cy').getBoundingClientRect();
  const { width, height } = tooltip.getBoundingClientRect();
  const left = Math.min(Math.max(8, position.x + 16), container.width - width - 8);
  const top = position.y + 16 + height > container.height ? position.y - height - 16 : position.y + 16;

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}

function hideTooltip() {
  $('tooltip').hidden = true;
}

// --- Selection & details -------------------------------------------------------------------

function openFile(id: string) {
  const node = nodesById.get(id);

  if (node?.path) {
    vscode.postMessage({ type: 'open', path: node.path });
  }
}

function clearSelection() {
  cy?.elements().removeClass('faded highlighted hl-in hl-out');
  cy?.elements().unselect();
  $('details').hidden = true;
}

// Makes sure a node is drawn, clearing filters that hide it.
function ensureVisible(id: string) {
  const node = nodesById.get(id);

  if (!node || !cy || cy.getElementById(id).nonempty()) {
    return;
  }

  state.hidden.delete(node.status);

  if (node.kind === 'package') {
    state.hidden.delete('package');
  }

  persist();
  render();
}

function linkList(edges: { id: string; kind: EdgeKind }[]): string {
  if (edges.length === 0) {
    return '<div class="none">None</div>';
  }

  return `<ul>${edges
    .map(({ id, kind }) => ({ node: nodesById.get(id), kind }))
    .filter((item): item is { node: GraphNode; kind: EdgeKind } => Boolean(item.node))
    .sort((a, b) => a.node.label.localeCompare(b.node.label))
    .map(({ node, kind }) => {
      const { name, dir } = splitPath(node);
      const tag = EDGE_TAG[kind];

      return `<li><button data-select="${escapeHtml(node.id)}" title="${escapeHtml(node.path ?? node.label)}">
        <span class="shape ${shapeClass(node)}"></span>
        <span class="li-name">${escapeHtml(name)}</span>
        ${tag ? `<span class="tag">${tag}</span>` : ''}
        <span class="li-dir">${escapeHtml(dir)}</span>
      </button></li>`;
    })
    .join('')}</ul>`;
}

function select(id: string) {
  const node = nodesById.get(id);

  if (!node || !graph) {
    return;
  }

  ensureVisible(id);

  if (!cy) {
    return;
  }

  const importedBy = graph.edges.filter((edge) => edge.to === id).map((edge) => ({ id: edge.from, kind: edge.kind }));
  const imports = graph.edges.filter((edge) => edge.from === id).map((edge) => ({ id: edge.to, kind: edge.kind }));
  const element = cy.getElementById(id);

  if (element.nonempty()) {
    const neighbourhood = element.closedNeighborhood();
    cy.elements().addClass('faded').removeClass('highlighted hl-in hl-out').unselect();
    neighbourhood.removeClass('faded');
    neighbourhood.ancestors().removeClass('faded');
    element.outgoers('edge').addClass('highlighted hl-out');
    element.incomers('edge').addClass('highlighted hl-in');
    element.select();
    cy.animate({ center: { eles: element }, zoom: Math.min(Math.max(cy.zoom(), 0.9), 1.3), duration: 250 });
  }

  const { name, dir } = splitPath(node);
  const kindLabel = node.kind === 'package' ? 'package' : 'file';

  const details = $('details');
  details.hidden = false;
  details.innerHTML = `
    <div class="d-head">
      <span class="shape ${shapeClass(node)}"></span>
      <div class="d-titles">
        <div class="d-name">${escapeHtml(name)}</div>
        ${dir && node.kind === 'file' ? `<div class="d-path">${escapeHtml(dir)}/</div>` : ''}
      </div>
      <button class="d-close" id="close-details" title="Close (Esc)" aria-label="Close details">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 7l4-4 1 1-4 4 4 4-1 1-4-4-4 4-1-1 4-4-4-4 1-1z"/></svg>
      </button>
    </div>
    <div class="d-body">
      <span class="pill ${node.status}">${STATUS_LABEL[node.status]}</span><span class="kind">${kindLabel}</span>
      <div class="callout ${node.status}"><div class="c-label">Why</div>${escapeHtml(node.reason)}</div>
      <div class="actions">
        ${node.kind === 'file' ? '<button class="btn primary" id="open-file">Open file</button>' : ''}
        <button class="btn secondary" id="focus-node" title="Zoom to this node and its connections">Focus</button>
      </div>
      <h3><span class="line in" title="Drawn in this color on the graph"></span>Imported by <span class="count">${importedBy.length}</span></h3>
      ${linkList(importedBy)}
      ${node.kind === 'file' ? `<h3><span class="line out" title="Drawn in this color on the graph"></span>Imports <span class="count">${imports.length}</span></h3>${linkList(imports)}` : ''}
    </div>
  `;

  $('close-details').addEventListener('click', clearSelection);
  document.getElementById('open-file')?.addEventListener('click', () => openFile(id));
  $('focus-node').addEventListener('click', () => {
    const current = cy?.getElementById(id);

    if (cy && current?.nonempty()) {
      cy.animate({ fit: { eles: current.closedNeighborhood(), padding: 80 }, duration: 250, complete: capZoom });
    }
  });

  for (const link of details.querySelectorAll<HTMLButtonElement>('[data-select]')) {
    link.addEventListener('click', () => select(link.dataset.select!));
  }
}

// --- Search -----------------------------------------------------------------------------------

function search(query: string) {
  const needle = query.trim().toLowerCase();
  cy?.nodes().removeClass('match');
  searchIndex = -1;
  searchMatches = needle && graph
    ? graph.nodes.filter((node) => (node.path ?? node.label).toLowerCase().includes(needle)).map((node) => node.id)
    : [];

  const counter = $('search-count');
  counter.textContent = needle ? (searchMatches.length === 0 ? 'no matches' : `${searchMatches.length} found`) : '';

  if (!cy || searchMatches.length === 0) {
    return;
  }

  let drawn = cy.collection();

  for (const id of searchMatches) {
    drawn = drawn.union(cy.getElementById(id));
  }

  drawn.addClass('match');

  if (drawn.length === 1) {
    cy.animate({ center: { eles: drawn }, zoom: Math.min(Math.max(cy.zoom(), 0.9), 1.3), duration: 250 });
  } else if (drawn.nonempty()) {
    cy.animate({ fit: { eles: drawn, padding: 80 }, duration: 250, complete: capZoom });
  }
}

// Enter walks through the matches, opening each one's details.
function nextMatch() {
  if (searchMatches.length === 0) {
    return;
  }

  searchIndex = (searchIndex + 1) % searchMatches.length;
  $('search-count').textContent = `${searchIndex + 1} of ${searchMatches.length}`;
  select(searchMatches[searchIndex]);
  cy?.getElementById(searchMatches[searchIndex]).addClass('match');
}

// --- Controls ---------------------------------------------------------------------------------

function bindControls() {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-layout]')) {
    button.addEventListener('click', () => {
      state.layout = button.dataset.layout as ViewState['layout'];
      persist();
      render();
      clearSelection();
    });
  }

  $('toggle-folders').addEventListener('click', () => {
    state.groupFolders = !state.groupFolders;
    persist();
    render();
    clearSelection();
  });

  $('export-ai').addEventListener('click', () => vscode.postMessage({ type: 'export' }));

  $('refresh').addEventListener('click', () => {
    $('meta').textContent = 'Rebuilding…';
    vscode.postMessage({ type: 'refresh' });
  });

  $('zoom-in').addEventListener('click', () => zoomBy(1.25));
  $('zoom-out').addEventListener('click', () => zoomBy(0.8));
  $('fit').addEventListener('click', () => fitAll());

  const input = $<HTMLInputElement>('search');
  input.addEventListener('input', () => search(input.value));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      nextMatch();
    } else if (event.key === 'Escape') {
      input.value = '';
      search('');
      input.blur();
    }
  });

  document.addEventListener('keydown', (event) => {
    const typing = event.target instanceof HTMLInputElement;

    if (typing || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (event.key === '/') {
      event.preventDefault();
      input.focus();
      input.select();
    } else if (event.key === 'Escape') {
      clearSelection();
    } else if (event.key === 'f' || event.key === 'F') {
      fitAll();
    }
  });
}

window.addEventListener('message', (event: MessageEvent<InboundMessage>) => {
  const message = event.data;

  if (message.type === 'graph') {
    graph = message.graph;
    nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

    // Big projects start on the problems (plus their context); everything is one click away.
    if (!state.hasSavedFilters && graph.nodes.length > 600) {
      state.hidden = new Set(['entry', 'used']);
    }

    $('loading').hidden = true;
    $('error').hidden = true;
    renderMeta(message.folderName);
    render();
    clearSelection();
    search($<HTMLInputElement>('search').value);
  } else if (message.type === 'focus') {
    select(message.id);
  } else if (message.type === 'error') {
    $('loading').hidden = true;
    $('error').hidden = false;
    $('error').textContent = message.message;
    $('meta').textContent = 'Build failed';
  }
});

bindControls();
syncControls();
vscode.postMessage({ type: 'ready' });
