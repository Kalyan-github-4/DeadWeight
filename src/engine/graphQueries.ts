import type { ConnectionGraph, EdgeKind, GraphEdge, GraphNode } from '../graphTypes';

// Questions about the connection graph: what a file imports and what imports it,
// what a change can break (blast radius), how two files connect, and what's dead.
// Shared by the VS Code commands and the MCP server for AI agents.

export class GraphIndex {
  readonly nodes = new Map<string, GraphNode>();
  readonly outgoing = new Map<string, GraphEdge[]>();
  readonly incoming = new Map<string, GraphEdge[]>();

  constructor(readonly graph: ConnectionGraph) {
    for (const node of graph.nodes) {
      this.nodes.set(node.id, node);
    }

    for (const edge of graph.edges) {
      this.outgoing.set(edge.from, [...(this.outgoing.get(edge.from) ?? []), edge]);
      this.incoming.set(edge.to, [...(this.incoming.get(edge.to) ?? []), edge]);
    }
  }

  // Finds a node from what a person or agent typed: an exact path, `./`-prefixed,
  // backslashes, a unique path suffix (`utils/format.js`, `format.js`), a path
  // without extension, or a package name.
  resolve(input: string): { node: GraphNode } | { error: string; candidates: string[] } {
    const query = input.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');

    if (!query) {
      return { error: 'No file or package given.', candidates: [] };
    }

    const exact = this.nodes.get(`file:${query}`) ?? this.nodes.get(`package:${query}`) ?? this.nodes.get(query);

    if (exact) {
      return { node: exact };
    }

    const files = this.graph.nodes.filter((node) => node.kind === 'file' && node.path);
    const bySuffix = files.filter((node) => node.path === query || node.path!.endsWith(`/${query}`));
    const withoutExtension = bySuffix.length > 0
      ? bySuffix
      : files.filter((node) => {
        const bare = node.path!.replace(/\.[^./]+$/, '');
        return bare === query || bare.endsWith(`/${query}`);
      });

    if (withoutExtension.length === 1) {
      return { node: withoutExtension[0] };
    }

    if (withoutExtension.length > 1) {
      return {
        error: `"${input}" matches ${withoutExtension.length} files; give more of the path.`,
        candidates: withoutExtension.map((node) => node.path!).slice(0, 20),
      };
    }

    const lower = query.toLowerCase();
    const similar = this.graph.nodes
      .filter((node) => (node.path ?? node.label).toLowerCase().includes(lower))
      .map((node) => node.path ?? node.label)
      .slice(0, 10);

    return { error: `No file or package matches "${input}".`, candidates: similar };
  }

  importsOf(id: string): { node: GraphNode; kind: EdgeKind }[] {
    return (this.outgoing.get(id) ?? [])
      .map((edge) => ({ node: this.nodes.get(edge.to)!, kind: edge.kind }))
      .filter((item) => item.node);
  }

  importersOf(id: string): { node: GraphNode; kind: EdgeKind }[] {
    return (this.incoming.get(id) ?? [])
      .map((edge) => ({ node: this.nodes.get(edge.from)!, kind: edge.kind }))
      .filter((item) => item.node);
  }
}

export interface BlastRadius {
  target: GraphNode;
  direct: GraphNode[];                  // files importing the target
  indirect: { node: GraphNode; depth: number; via: string }[];  // files reaching it through others
  entries: GraphNode[];                 // entry points among all of them (or the target itself)
}

// Everything that depends on `id`, directly or through other files. Every edge kind
// counts: a type-only import still breaks the build when the type changes, and a
// computed import may load the file at runtime.
export function blastRadius(index: GraphIndex, id: string): BlastRadius | undefined {
  const target = index.nodes.get(id);

  if (!target) {
    return undefined;
  }

  const depth = new Map<string, number>([[id, 0]]);
  const via = new Map<string, string>();
  const queue = [id];

  for (let next = 0; next < queue.length; next++) {
    const current = queue[next];

    for (const edge of index.incoming.get(current) ?? []) {
      if (!depth.has(edge.from) && edge.from.startsWith('file:')) {
        depth.set(edge.from, depth.get(current)! + 1);
        via.set(edge.from, current);
        queue.push(edge.from);
      }
    }
  }

  const byPath = (a: GraphNode, b: GraphNode) => (a.path ?? a.label).localeCompare(b.path ?? b.label);
  const dependents = queue.slice(1).map((dependent) => index.nodes.get(dependent)!).filter(Boolean);
  const direct = dependents.filter((node) => depth.get(node.id) === 1).sort(byPath);
  const indirect = dependents
    .filter((node) => depth.get(node.id)! > 1)
    .map((node) => ({ node, depth: depth.get(node.id)!, via: index.nodes.get(via.get(node.id)!)?.path ?? '' }))
    .sort((a, b) => a.depth - b.depth || byPath(a.node, b.node));
  const entries = [target, ...dependents].filter((node) => node.status === 'entry').sort(byPath);

  return { target, direct, indirect, entries };
}

// The shortest import chain from `fromId` to `toId`, or undefined when none exists.
export function importPath(index: GraphIndex, fromId: string, toId: string): { node: GraphNode; kind?: EdgeKind }[] | undefined {
  const previous = new Map<string, GraphEdge | null>([[fromId, null]]);
  const queue = [fromId];

  for (let next = 0; next < queue.length && !previous.has(toId); next++) {
    for (const edge of index.outgoing.get(queue[next]) ?? []) {
      if (!previous.has(edge.to)) {
        previous.set(edge.to, edge);
        queue.push(edge.to);
      }
    }
  }

  if (!previous.has(toId)) {
    return undefined;
  }

  const chain: { node: GraphNode; kind?: EdgeKind }[] = [];

  for (let id: string | undefined = toId; id !== undefined;) {
    const edge: GraphEdge | null | undefined = previous.get(id);
    chain.unshift({ node: index.nodes.get(id)!, kind: edge?.kind });
    id = edge ? edge.from : undefined;
  }

  return chain;
}

// The part of the graph under `folder`: its files, what they import, and the edges
// between them. Stats are recomputed so a project map of it reads correctly.
export function subgraph(graph: ConnectionGraph, folder: string): ConnectionGraph {
  const prefix = `${folder.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/$/, '')}/`;
  const inside = new Set(graph.nodes.filter((node) => node.path?.startsWith(prefix)).map((node) => node.id));
  const edges = graph.edges.filter((edge) => inside.has(edge.from));
  const kept = new Set([...inside, ...edges.map((edge) => edge.to)]);
  const nodes = graph.nodes.filter((node) => kept.has(node.id));
  const files = nodes.filter((node) => node.kind === 'file');
  const packages = nodes.filter((node) => node.kind === 'package');

  return {
    ...graph,
    nodes,
    edges,
    unresolved: graph.unresolved.filter(({ file }) => file.startsWith(prefix)),
    stats: {
      files: files.length,
      entries: files.filter((node) => node.status === 'entry').length,
      used: files.filter((node) => node.status === 'used').length,
      maybe: files.filter((node) => node.status === 'maybe').length,
      unused: files.filter((node) => node.status === 'unused').length,
      packages: packages.length,
      unusedPackages: packages.filter((node) => node.status === 'unused').length,
    },
  };
}

// --- Plain-text renderings, compact for AI agents and quick picks ---------------------

const KIND_NOTE: Partial<Record<EdgeKind, string>> = {
  type: 'type-only',
  dynamic: 'dynamic import',
  maybe: 'computed path',
  config: 'named in a config',
};

function label(node: GraphNode): string {
  return node.path ?? node.label;
}

function withKind({ node, kind }: { node: GraphNode; kind?: EdgeKind }): string {
  const note = kind ? KIND_NOTE[kind] : undefined;
  return note ? `${label(node)} (${note})` : label(node);
}

function list(items: string[], empty = 'none'): string {
  return items.length === 0 ? `  ${empty}` : items.map((item) => `  - ${item}`).join('\n');
}

export function describeNode(index: GraphIndex, node: GraphNode): string {
  const imports = index.importsOf(node.id);
  const importers = index.importersOf(node.id);
  const radius = blastRadius(index, node.id)!;

  return [
    `${label(node)} (${node.kind}) — ${node.status}`,
    `Why: ${node.reason}`,
    ...(node.workspace ? [`Workspace: ${node.workspace}`] : []),
    `Imported by (${importers.length}):`,
    list(importers.map(withKind)),
    ...(node.kind === 'file' ? [`Imports (${imports.length}):`, list(imports.map(withKind))] : []),
    `Blast radius: ${radius.direct.length} direct and ${radius.indirect.length} indirect dependents, ${radius.entries.length} entry point(s) affected.`,
  ].join('\n');
}

export function describeBlastRadius(radius: BlastRadius, limit = 200): string {
  const { target, direct, indirect, entries } = radius;
  const total = direct.length + indirect.length;

  if (total === 0) {
    return `Nothing imports ${label(target)}, so changing it affects no other file${target.status === 'entry' ? ' (it is an entry point itself)' : ''}.`;
  }

  const shownIndirect = indirect.slice(0, Math.max(0, limit - direct.length));

  return [
    `Changing ${label(target)} can affect ${total} file(s): ${direct.length} direct, ${indirect.length} indirect.`,
    `Entry points affected (${entries.length}):`,
    list(entries.map(label)),
    `Direct importers (${direct.length}):`,
    list(direct.slice(0, limit).map(label)),
    `Indirect (depth, via):`,
    list(shownIndirect.map(({ node, depth, via }) => `${label(node)} (depth ${depth}, via ${via})`)),
    ...(shownIndirect.length < indirect.length ? [`  …and ${indirect.length - shownIndirect.length} more`] : []),
  ].join('\n');
}

export function describeUnused(graph: ConnectionGraph, kind: 'files' | 'packages' | 'all' = 'all'): string {
  const pick = (nodeKind: GraphNode['kind'], status: GraphNode['status']) => graph.nodes
    .filter((node) => node.kind === nodeKind && node.status === status)
    .map((node) => `${label(node)} — ${node.reason}`)
    .sort();

  const sections: string[] = [];

  if (kind !== 'packages') {
    sections.push(`Unused files:\n${list(pick('file', 'unused'))}`, `Files that may be unused (can't be proven either way):\n${list(pick('file', 'maybe'))}`);
  }

  if (kind !== 'files') {
    sections.push(`Unused packages:\n${list(pick('package', 'unused'))}`, `Packages that may be unused:\n${list(pick('package', 'maybe'))}`);
  }

  return `${sections.join('\n')}\n\nThese come from Deadweight's static graph. Before deleting, confirm with the Deadweight scan in VS Code, which adds knip, depcheck and a verified build.`;
}
