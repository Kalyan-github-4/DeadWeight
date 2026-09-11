// Runs inside the Connection Graph webview. Bundled separately (browser, IIFE) by
// esbuild.js into dist/webview/graph.js. Talks to the extension via postMessage.
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import type { ConnectionGraph, GraphEdge, GraphNode, NodeStatus } from '../graphTypes';

// fcose lays out folder groups properly and packs unconnected pieces tightly,
// which cytoscape's built-in cose does poorly.
cytoscape.use(fcose);

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

type InboundMessage =
  | { type: 'graph'; graph: ConnectionGraph; folderName: string }
  | { type: 'focus'; id: string }
  | { type: 'error'; message: string };

const vscode = acquireVsCodeApi();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const STATUS_LABEL: Record<NodeStatus, string> = {
  entry: 'Entry point',
  used: 'Used',
  maybe: 'Maybe used',
  unused: 'Unused',
};

// Theme colors, read from VS Code's CSS variables so the graph follows the theme.
function themeColor(variable: string, fallback: string): string {
  return getComputedStyle(document.body).getPropertyValue(variable).trim() || fallback;
}

function colors() {
  return {
    entry: themeColor('--vscode-charts-blue', '#3794ff'),
    used: themeColor('--vscode-charts-green', '#89d185'),
    maybe: themeColor('--vscode-charts-yellow', '#cca700'),
    unused: themeColor('--vscode-charts-red', '#f14c4c'),
    text: themeColor('--vscode-editor-foreground', '#cccccc'),
    muted: themeColor('--vscode-descriptionForeground', '#999999'),
    edge: themeColor('--vscode-editorLineNumber-foreground', '#6e7681'),
    border: themeColor('--vscode-panel-border', '#444444'),
    folder: themeColor('--vscode-sideBar-background', '#252526'),
    selection: themeColor('--vscode-focusBorder', '#007fd4'),
  };
}

let cy: cytoscape.Core | undefined;
let graph: ConnectionGraph | undefined;
let nodesById = new Map<string, GraphNode>();

const state = {
  showPackages: true,
  groupFolders: true,
  onlyProblems: false,
  layout: 'force' as 'force' | 'tree',
};

function folderOf(node: GraphNode): string {
  if (node.kind === 'package') {
    return 'dir:(packages)';
  }

  const path = node.path ?? '';
  const slash = path.lastIndexOf('/');

  return `dir:${slash === -1 ? '.' : path.slice(0, slash)}`;
}

function visibleNodes(): GraphNode[] {
  if (!graph) {
    return [];
  }

  let nodes = graph.nodes.filter((node) => state.showPackages || node.kind === 'file');

  if (state.onlyProblems) {
    const problems = new Set(nodes.filter((n) => n.status === 'unused' || n.status === 'maybe').map((n) => n.id));
    const context = new Set(problems);

    // Keep direct neighbours, so a dead file shows what it still points at.
    for (const edge of graph.edges) {
      if (problems.has(edge.from)) {
        context.add(edge.to);
      }

      if (problems.has(edge.to)) {
        context.add(edge.from);
      }
    }

    nodes = nodes.filter((node) => context.has(node.id));
  }

  return nodes;
}

// A tree layout can't keep folder boxes apart, so it always draws ungrouped.
const grouped = () => state.groupFolders && state.layout !== 'tree';

function buildElements(): cytoscape.ElementDefinition[] {
  const nodes = visibleNodes();
  const ids = new Set(nodes.map((node) => node.id));
  const elements: cytoscape.ElementDefinition[] = [];

  if (grouped()) {
    for (const folder of new Set(nodes.map(folderOf))) {
      const label = folder === 'dir:(packages)' ? 'packages' : folder === 'dir:.' ? '(root)' : folder.slice(4);
      elements.push({ data: { id: folder, label }, classes: 'folder' });
    }
  }

  for (const node of nodes) {
    elements.push({
      data: {
        id: node.id,
        label: node.label,
        parent: grouped() ? folderOf(node) : undefined,
      },
      classes: `${node.kind} ${node.status}`,
    });
  }

  graph!.edges
    .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
    .forEach((edge: GraphEdge, index) => {
      elements.push({
        data: { id: `e${index}`, source: edge.from, target: edge.to },
        classes: `${edge.kind} ${edge.to.startsWith('package:') ? 'to-package' : ''}`,
      });
    });

  return elements;
}

function style(): cytoscape.StylesheetJson {
  const c = colors();

  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        color: c.text,
        'font-size': 11,
        'font-family': 'var(--vscode-font-family), sans-serif',
        'text-valign': 'bottom',
        'text-margin-y': 4,
        width: 18,
        height: 18,
        'border-width': 2,
        'border-color': c.border,
        'background-color': c.used,
      },
    },
    { selector: 'node.entry', style: { 'background-color': c.entry, shape: 'round-rectangle', width: 22, height: 22 } },
    { selector: 'node.used', style: { 'background-color': c.used } },
    { selector: 'node.maybe', style: { 'background-color': c.maybe, 'border-style': 'dashed', 'border-color': c.maybe } },
    { selector: 'node.unused', style: { 'background-color': c.unused, width: 22, height: 22, 'border-color': c.unused } },
    { selector: 'node.package', style: { shape: 'diamond', width: 16, height: 16, color: c.muted } },
    {
      selector: 'node.folder',
      style: {
        shape: 'round-rectangle',
        'background-color': c.folder,
        'background-opacity': 0.5,
        'border-width': 1,
        'border-color': c.border,
        color: c.muted,
        'font-size': 10,
        'text-valign': 'top',
        'text-halign': 'center',
        'text-margin-y': -4,
        padding: '14px',
      },
    },
    {
      selector: 'edge',
      style: {
        width: 1.2,
        'line-color': c.edge,
        'target-arrow-color': c.edge,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.8,
        'curve-style': 'bezier',
        opacity: 0.7,
      },
    },
    { selector: 'edge.to-package', style: { width: 0.8, opacity: 0.35 } },
    { selector: 'edge.type', style: { 'line-style': 'dashed' } },
    { selector: 'edge.config', style: { 'line-style': 'dotted', width: 1.6 } },
    { selector: 'edge.maybe', style: { 'line-style': 'dashed', 'line-color': c.maybe, 'target-arrow-color': c.maybe } },
    { selector: '.faded', style: { opacity: 0.12 } },
    { selector: 'edge.highlighted', style: { width: 2.5, opacity: 1, 'line-color': c.selection, 'target-arrow-color': c.selection } },
    { selector: 'node:selected', style: { 'border-color': c.selection, 'border-width': 4 } },
    { selector: 'node.match', style: { 'border-color': c.selection, 'border-width': 4 } },
  ];
}

function layoutOptions(): cytoscape.LayoutOptions {
  if (state.layout === 'tree') {
    const roots = graph!.nodes.filter((node) => node.status === 'entry').map((node) => `[id = "${node.id}"]`).join(',');

    return { name: 'breadthfirst', directed: true, spacingFactor: 1.1, roots: roots || undefined, animate: false } as cytoscape.LayoutOptions;
  }

  return {
    name: 'fcose',
    quality: 'proof',
    randomize: true,
    animate: false,
    fit: true,
    padding: 30,
    nodeDimensionsIncludeLabels: true,
    packComponents: true,
    nodeRepulsion: () => 5500,
    idealEdgeLength: () => 70,
    edgeElasticity: () => 0.45,
    nestingFactor: 0.1,
    gravity: 0.35,
    gravityCompound: 1.2,
    gravityRangeCompound: 1.5,
    tilingPaddingVertical: 14,
    tilingPaddingHorizontal: 14,
  } as cytoscape.LayoutOptions;
}

function render() {
  if (!graph) {
    return;
  }

  cy?.destroy();

  cy = cytoscape({
    container: $('cy'),
    elements: buildElements(),
    style: style(),
    wheelSensitivity: 0.3,
    minZoom: 0.05,
    maxZoom: 3,
  });

  cy.layout(layoutOptions()).run();
  fitAll(false);

  cy.on('tap', 'node', (event) => {
    const id = event.target.id() as string;

    if (!id.startsWith('dir:')) {
      select(id);
    }
  });

  cy.on('dbltap', 'node.file', (event) => {
    const node = nodesById.get(event.target.id());

    if (node?.path) {
      vscode.postMessage({ type: 'open', path: node.path });
    }
  });

  cy.on('tap', (event) => {
    if (event.target === cy) {
      clearSelection();
    }
  });

  $('empty').hidden = cy.nodes().length > 0;
}

// Fits the whole graph, but never zooms a small graph in so far that it looks blown up.
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

function capZoom() {
  if (cy && cy.zoom() > 1.4) {
    cy.zoom({ level: 1.4, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    cy.center();
  }
}

// Keep the graph fitted when the panel or the editor layout changes size.
let resizeTimer: number | undefined;

window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => fitAll(false), 150);
});

function clearSelection() {
  cy?.elements().removeClass('faded highlighted');
  $('details').hidden = true;
}

function linkList(ids: string[]): string {
  if (ids.length === 0) {
    return '<li class="muted">none</li>';
  }

  return ids
    .map((id) => nodesById.get(id))
    .filter((node): node is GraphNode => Boolean(node))
    .map((node) => `<li><a href="#" data-select="${escapeHtml(node.id)}"><span class="dot ${node.status}"></span>${escapeHtml(node.path ?? node.label)}</a></li>`)
    .join('');
}

function select(id: string) {
  const node = nodesById.get(id);

  if (!node || !graph || !cy) {
    return;
  }

  const importedBy = graph.edges.filter((edge) => edge.to === id).map((edge) => edge.from);
  const imports = graph.edges.filter((edge) => edge.from === id).map((edge) => edge.to);

  const element = cy.getElementById(id);

  if (element.nonempty()) {
    const neighbourhood = element.closedNeighborhood();
    cy.elements().addClass('faded');
    neighbourhood.removeClass('faded');
    neighbourhood.ancestors().removeClass('faded');
    cy.edges().removeClass('highlighted');
    element.connectedEdges().addClass('highlighted');
    cy.elements().unselect();
    element.select();
    cy.animate({ center: { eles: element }, zoom: Math.min(Math.max(cy.zoom(), 0.9), 1.4), duration: 250 });
  }

  const details = $('details');
  details.hidden = false;
  details.innerHTML = `
    <div class="details-header">
      <span class="badge ${node.status}">${STATUS_LABEL[node.status]}</span>
      <button class="icon" id="close-details" title="Close">✕</button>
    </div>
    <h2>${escapeHtml(node.path ?? node.label)}</h2>
    <p class="reason">${escapeHtml(node.reason)}</p>
    ${node.kind === 'file' ? '<button id="open-file">Open File</button>' : ''}
    <h3>${node.kind === 'package' ? 'Imported by' : 'Imported by'} (${importedBy.length})</h3>
    <ul>${linkList(importedBy)}</ul>
    ${node.kind === 'file' ? `<h3>Imports (${imports.length})</h3><ul>${linkList(imports)}</ul>` : ''}
  `;

  $('close-details').addEventListener('click', clearSelection);
  document.getElementById('open-file')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'open', path: node.path });
  });

  for (const link of details.querySelectorAll<HTMLAnchorElement>('[data-select]')) {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const target = link.dataset.select!;

      // A node hidden by the current filters can't be focused; show everything first.
      if (cy?.getElementById(target).empty()) {
        state.onlyProblems = false;
        state.showPackages = true;
        syncToggles();
        render();
      }

      select(target);
    });
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function renderStats(folderName: string) {
  const s = graph!.stats;

  $('title').textContent = `Connection Graph: ${folderName}`;
  $('stats').innerHTML = `
    <span class="chip"><span class="dot entry"></span>${s.entries} entry</span>
    <span class="chip"><span class="dot used"></span>${s.used} used</span>
    <span class="chip"><span class="dot maybe"></span>${s.maybe} maybe</span>
    <span class="chip"><span class="dot unused"></span>${s.unused} unused</span>
    <span class="chip"><span class="diamond"></span>${s.packages} packages · ${s.unusedPackages} unused</span>
    <span class="muted">${s.files} files · ${graph!.edges.length} connections · built in ${graph!.durationMs} ms</span>
  `;
}

function syncToggles() {
  $<HTMLInputElement>('show-packages').checked = state.showPackages;
  $<HTMLInputElement>('group-folders').checked = state.groupFolders;
  $<HTMLInputElement>('group-folders').disabled = state.layout === 'tree';
  $<HTMLInputElement>('only-problems').checked = state.onlyProblems;
  $<HTMLSelectElement>('layout').value = state.layout;
}

function search(query: string) {
  if (!cy) {
    return;
  }

  cy.nodes().removeClass('match');

  const needle = query.trim().toLowerCase();

  if (!needle) {
    return;
  }

  const matches = cy.nodes().filter((element) => {
    const node = nodesById.get(element.id());
    return Boolean(node) && (node!.path ?? node!.label).toLowerCase().includes(needle);
  });

  matches.addClass('match');

  if (matches.length === 1) {
    cy.animate({ center: { eles: matches }, zoom: Math.min(Math.max(cy.zoom(), 0.9), 1.4), duration: 250 });
  } else if (matches.nonempty()) {
    cy.animate({ fit: { eles: matches, padding: 80 }, duration: 250, complete: capZoom });
  }
}

function bindControls() {
  const toggle = (id: string, key: 'showPackages' | 'groupFolders' | 'onlyProblems') => {
    $<HTMLInputElement>(id).addEventListener('change', (event) => {
      state[key] = (event.target as HTMLInputElement).checked;
      render();
    });
  };

  toggle('show-packages', 'showPackages');
  toggle('group-folders', 'groupFolders');
  toggle('only-problems', 'onlyProblems');

  $<HTMLSelectElement>('layout').addEventListener('change', (event) => {
    state.layout = (event.target as HTMLSelectElement).value as typeof state.layout;
    syncToggles();
    render();
  });

  $('fit').addEventListener('click', () => fitAll());
  $('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
  $<HTMLInputElement>('search').addEventListener('input', (event) => search((event.target as HTMLInputElement).value));
  $<HTMLInputElement>('search').addEventListener('keydown', (event) => {
    const first = cy?.nodes('.match').first();

    if (event.key === 'Enter' && first?.nonempty()) {
      select(first.id());
    }
  });
}

window.addEventListener('message', (event: MessageEvent<InboundMessage>) => {
  const message = event.data;

  if (message.type === 'graph') {
    graph = message.graph;
    nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

    // Big projects start focused on the problems; the full graph is one click away.
    if (graph.nodes.length > 600) {
      state.onlyProblems = true;
    }

    $('loading').hidden = true;
    $('error').hidden = true;
    renderStats(message.folderName);
    syncToggles();
    render();
    clearSelection();
  } else if (message.type === 'focus') {
    if (cy?.getElementById(message.id).empty()) {
      state.onlyProblems = false;
      state.showPackages = true;
      syncToggles();
      render();
    }

    select(message.id);
  } else if (message.type === 'error') {
    $('loading').hidden = true;
    $('error').hidden = false;
    $('error').textContent = message.message;
  }
});

bindControls();
vscode.postMessage({ type: 'ready' });
