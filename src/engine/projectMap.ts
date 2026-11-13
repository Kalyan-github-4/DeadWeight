import { posix } from 'node:path';
import type { ConnectionGraph, EdgeKind, GraphEdge, GraphNode } from '../graphTypes';

// The connection graph as a compact document for AI agents. An agent that reads
// this first knows every file, what it imports and what's dead, instead of spending
// tokens opening files to discover the structure. Written for token economy:
// files grouped under folder headings with paths relative to them, one-character
// arrows for import kinds, and reasons only where they add information.

export const PROJECT_MAP_DIR = '.deadweight';
export const PROJECT_MAP_MARKDOWN = `${PROJECT_MAP_DIR}/project-map.md`;
export const PROJECT_MAP_JSON = `${PROJECT_MAP_DIR}/project-map.json`;

export interface ProjectMapOptions {
  projectName: string;
  generatedAt?: Date;
}

const ARROW: Record<EdgeKind, string> = {
  static: '->',
  require: '->',
  type: '~>',
  dynamic: '=>',
  maybe: '?>',
  config: '#>',
};

// Arrow order within a line, most important first.
const ARROW_ORDER = ['->', '~>', '=>', '?>', '#>'];

// Reasons that only restate the status tag.
const OBVIOUS_REASONS = new Set(['Nothing imports this file']);

const MAX_HUBS = 10;
const MAX_UNRESOLVED = 30;

// Rough token count (≈4 characters per token for code-like English).
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function dirOf(path: string): string {
  const dir = posix.dirname(path);
  return dir === '.' ? '' : dir;
}

interface Indexed {
  files: GraphNode[];
  packages: GraphNode[];
  outgoing: Map<string, GraphEdge[]>;
  importerCount: Map<string, number>;
}

function index(graph: ConnectionGraph): Indexed {
  const outgoing = new Map<string, GraphEdge[]>();
  const importerCount = new Map<string, number>();

  for (const edge of graph.edges) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);

    if (edge.from.startsWith('file:')) {
      importerCount.set(edge.to, (importerCount.get(edge.to) ?? 0) + 1);
    }
  }

  const byPath = (a: GraphNode, b: GraphNode) => (a.path ?? a.label).localeCompare(b.path ?? b.label);

  return {
    files: graph.nodes.filter((node) => node.kind === 'file' && node.path).sort(byPath),
    packages: graph.nodes.filter((node) => node.kind === 'package').sort(byPath),
    outgoing,
    importerCount,
  };
}

// A target as written under the `### dir/` heading: relative when it's inside that
// dir, `/`-rooted otherwise, and a bare name for packages.
function targetLabel(id: string, dir: string): string {
  if (id.startsWith('package:')) {
    return id.slice('package:'.length);
  }

  const path = id.slice('file:'.length);

  if (!dir) {
    return path;
  }

  return path.startsWith(`${dir}/`) ? path.slice(dir.length + 1) : `/${path}`;
}

function fileLine(node: GraphNode, dir: string, data: Indexed): string {
  const path = node.path!;
  const parts = [dir ? path.slice(dir.length + 1) : path];

  if (node.status !== 'used') {
    parts.push(`[${node.status}]`);
  }

  const importers = data.importerCount.get(node.id) ?? 0;

  if (importers > 0) {
    parts.push(`<${importers}`);
  }

  const byArrow = new Map<string, string[]>();

  for (const edge of data.outgoing.get(node.id) ?? []) {
    const arrow = ARROW[edge.kind];
    byArrow.set(arrow, [...(byArrow.get(arrow) ?? []), targetLabel(edge.to, dir)]);
  }

  for (const arrow of ARROW_ORDER) {
    const targets = byArrow.get(arrow);

    if (targets) {
      parts.push(`${arrow} ${targets.sort().join(', ')}`);
    }
  }

  // Entry reasons are grouped in their own section; `used` is implied by importers.
  if ((node.status === 'maybe' || node.status === 'unused') && !OBVIOUS_REASONS.has(node.reason)) {
    parts.push(`(${node.reason})`);
  }

  return `- ${parts.join(' ')}`;
}

// The deepest dir that contains every file, e.g. `Deadweight/deadweight` when the
// opened folder is a parent of one project. '' when files share no dir.
export function commonDir(paths: string[]): string {
  if (paths.length === 0) {
    return '';
  }

  let common = dirOf(paths[0]).split('/').filter(Boolean);

  for (const path of paths.slice(1)) {
    const segments = dirOf(path).split('/');
    let shared = 0;

    while (shared < common.length && common[shared] === segments[shared]) {
      shared++;
    }

    common = common.slice(0, shared);
  }

  return common.join('/');
}

// The graph with `base/` removed from every path, so the map doesn't repeat it on
// every line. Reasons mention paths too, so they're rewritten as well.
function rebaseGraph(graph: ConnectionGraph, base: string): ConnectionGraph {
  if (!base) {
    return graph;
  }

  const prefix = `${base}/`;
  const strip = (text: string) => text.split(prefix).join('');
  const stripId = (id: string) => (id.startsWith(`file:${prefix}`) ? `file:${id.slice(5 + prefix.length)}` : id);

  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      id: stripId(node.id),
      path: node.path?.startsWith(prefix) ? node.path.slice(prefix.length) : node.path,
      workspace: node.workspace === base ? '' : strip(node.workspace),
      reason: strip(node.reason),
    })),
    edges: graph.edges.map((edge) => ({ ...edge, from: stripId(edge.from), to: stripId(edge.to) })),
    unresolved: graph.unresolved.map(({ file, specifier }) => ({ file: strip(file), specifier })),
  };
}

export function renderProjectMapMarkdown(fullGraph: ConnectionGraph, options: ProjectMapOptions): string {
  const base = commonDir(fullGraph.nodes.flatMap((node) => (node.kind === 'file' && node.path ? [node.path] : [])));
  const graph = rebaseGraph(fullGraph, base);
  const data = index(graph);
  const { stats } = graph;
  const date = (options.generatedAt ?? new Date()).toISOString().slice(0, 10);
  const lines: string[] = [];

  lines.push(
    `# Project map: ${options.projectName}`,
    '',
    `Generated by Deadweight from static analysis on ${date}; it may lag behind recent edits. Read this before exploring files: it lists every source file, what each imports, the entry points and the unused code, so you only need to open the files your task touches.`,
    '',
    ...(base ? [`All paths below are relative to \`${base}/\`.`, ''] : []),
    `${stats.files} files · ${stats.packages} packages · ${graph.edges.length} imports · ${stats.entries} entry points · ${stats.unused} unused files · ${stats.unusedPackages} unused packages`,
    '',
    '## Legend',
    '- `->` imports, `~>` type-only import, `=>` dynamic import(), `?>` may load (computed path), `#>` path named in a config',
    '- `[entry]` entry point, `[maybe]` usage unproven, `[unused]` nothing reachable uses it; untagged files are used',
    '- `<N` imported by N files',
    '- Under a `### dir/` heading, paths are relative to that dir; `/`-prefixed paths are from the project root; names without a file extension are npm packages',
  );

  const workspaces = [...new Set(graph.nodes.map((node) => node.workspace).filter(Boolean))].sort();

  if (workspaces.length > 0) {
    lines.push('', '## Workspaces', ...workspaces.map((workspace) => `- ${workspace}/`));
  }

  const entriesByReason = new Map<string, string[]>();

  for (const node of data.files.filter((file) => file.status === 'entry')) {
    entriesByReason.set(node.reason, [...(entriesByReason.get(node.reason) ?? []), node.path!]);
  }

  if (entriesByReason.size > 0) {
    lines.push('', '## Entry points');

    const biggestFirst = [...entriesByReason].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

    for (const [reason, paths] of biggestFirst) {
      lines.push(`- ${reason}: ${paths.join(', ')}`);
    }
  }

  const hubs = data.files
    .map((node) => ({ path: node.path!, count: data.importerCount.get(node.id) ?? 0 }))
    .filter(({ count }) => count >= 2)
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
    .slice(0, MAX_HUBS);

  if (hubs.length > 0) {
    lines.push('', '## Most imported files', ...hubs.map(({ path, count }) => `- ${path} <${count}`));
  }

  lines.push('', '## Files');

  const byDir = new Map<string, GraphNode[]>();

  for (const node of data.files) {
    const dir = dirOf(node.path!);
    byDir.set(dir, [...(byDir.get(dir) ?? []), node]);
  }

  for (const dir of [...byDir.keys()].sort()) {
    lines.push(`### ${dir ? `${dir}/` : '(root)'}`);
    lines.push(...byDir.get(dir)!.map((node) => fileLine(node, dir, data)));
  }

  if (data.packages.length > 0) {
    lines.push('', '## Packages');

    for (const status of ['used', 'maybe', 'unused'] as const) {
      const packages = data.packages.filter((node) => node.status === status);

      if (packages.length === 0) {
        continue;
      }

      const items = packages.map((node) => {
        const importers = data.importerCount.get(node.id) ?? 0;

        if (status === 'maybe') {
          return `${node.label} (${node.reason})`;
        }

        return importers > 0 ? `${node.label} <${importers}` : node.label;
      });

      lines.push(`- ${status}: ${items.join(', ')}`);
    }
  }

  if (graph.unresolved.length > 0) {
    lines.push('', "## Imports that couldn't be resolved");
    lines.push(...graph.unresolved.slice(0, MAX_UNRESOLVED).map(({ file, specifier }) => `- ${file}: "${specifier}"`));

    if (graph.unresolved.length > MAX_UNRESOLVED) {
      lines.push(`- …and ${graph.unresolved.length - MAX_UNRESOLVED} more`);
    }
  }

  return `${lines.join('\n')}\n`;
}

const JSON_KEY: Record<EdgeKind, string> = {
  static: 'imports',
  require: 'imports',
  type: 'typeImports',
  dynamic: 'dynamicImports',
  maybe: 'mayLoad',
  config: 'configPaths',
};

// The same content as structured data, for scripts and custom agents.
export function renderProjectMapJson(graph: ConnectionGraph, options: ProjectMapOptions): string {
  const data = index(graph);

  const files: Record<string, Record<string, unknown>> = {};

  for (const node of data.files) {
    const entry: Record<string, unknown> = { status: node.status };

    if (node.status !== 'used') {
      entry.reason = node.reason;
    }

    const importers = data.importerCount.get(node.id) ?? 0;

    if (importers > 0) {
      entry.importedBy = importers;
    }

    for (const edge of data.outgoing.get(node.id) ?? []) {
      const key = JSON_KEY[edge.kind];
      const target = edge.to.startsWith('package:') ? edge.to : edge.to.slice('file:'.length);
      entry[key] = [...((entry[key] as string[] | undefined) ?? []), target];
    }

    files[node.path!] = entry;
  }

  const packages: Record<string, Record<string, unknown>> = {};

  for (const node of data.packages) {
    packages[node.label] = {
      status: node.status,
      ...(node.status !== 'used' ? { reason: node.reason } : {}),
      importedBy: data.importerCount.get(node.id) ?? 0,
    };
  }

  return `${JSON.stringify({
    format: 'deadweight-project-map@1',
    project: options.projectName,
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
    notes: 'Paths are relative to the project root. Package targets are prefixed "package:". status: entry | used | maybe (usage unproven) | unused.',
    stats: { ...graph.stats, imports: graph.edges.length },
    files,
    packages,
    unresolved: graph.unresolved,
  })}\n`;
}

// --- Pointers from agent instruction files ------------------------------------------

// Files that coding agents read automatically at the start of a session.
export const AGENT_INSTRUCTION_FILES = [
  'AGENTS.md',                          // Codex, Cursor, Copilot, Gemini CLI, and others
  'CLAUDE.md',                          // Claude Code
  'GEMINI.md',                          // Gemini CLI
  '.github/copilot-instructions.md',    // GitHub Copilot
  '.cursorrules',                       // Cursor (legacy)
  '.windsurfrules',                     // Windsurf
];

export const AGENT_POINTER_MARKER = '<!-- deadweight:project-map -->';

export function agentPointerSection(): string {
  return [
    AGENT_POINTER_MARKER,
    '## Project map',
    `Before exploring this codebase, read \`${PROJECT_MAP_MARKDOWN}\`. It is a generated map of every source file, what each one imports, the entry points and the unused code, so you can go straight to the files a task needs instead of opening files to learn the structure. Regenerate it with the "Deadweight: Export Project Map for AI Agents" command.`,
    '',
  ].join('\n');
}

// `existing` plus the pointer section, or undefined when the pointer is already there.
export function withAgentPointer(existing: string): string | undefined {
  if (existing.includes(AGENT_POINTER_MARKER) || existing.includes(PROJECT_MAP_MARKDOWN)) {
    return undefined;
  }

  const separator = existing === '' ? '' : existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  return `${existing}${separator}${agentPointerSection()}`;
}
