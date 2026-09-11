// Deadweight's MCP server: gives AI agents (Claude Code, Cursor, Copilot, …) the
// project's connection graph as tools, so they can ask "what imports this?" or
// "what breaks if I change it?" instead of reading files to find out.
//
// Standalone Node script, bundled to dist/mcp.js. Speaks MCP (JSON-RPC 2.0) over
// stdio: one JSON message per line. Stdout carries only protocol messages; logs go
// to stderr. Runs offline: no knip, no network, just Deadweight's own graph.
//
//   node dist/mcp.js [--root <project dir>] [--entry <glob>]...

import { existsSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { buildConnectionGraph } from '../engine/graph';
import {
  blastRadius,
  describeBlastRadius,
  describeNode,
  describeUnused,
  GraphIndex,
  importPath,
  subgraph,
} from '../engine/graphQueries';
import { renderProjectMapMarkdown } from '../engine/projectMap';
import type { ConnectionGraph } from '../graphTypes';

declare const DEADWEIGHT_VERSION: string;

const SERVER_VERSION = typeof DEADWEIGHT_VERSION === 'string' ? DEADWEIGHT_VERSION : '0.0.0-dev';

// Newest first. The client's version is echoed when supported.
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

// Rebuild the graph when the cached one is older than this, so answers follow edits.
const GRAPH_MAX_AGE_MS = 5_000;

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

const INVALID_PARAMS = -32602;
const METHOD_NOT_FOUND = -32601;
const INTERNAL_ERROR = -32603;

// --- Arguments ------------------------------------------------------------------------

function parseArgs(argv: string[]): { root?: string; entryPoints: string[] } {
  const entryPoints: string[] = [];
  let root: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root' && argv[i + 1]) {
      root = resolve(argv[++i]);
    } else if (argv[i] === '--entry' && argv[i + 1]) {
      entryPoints.push(argv[++i]);
    }
  }

  return { root: root ?? (process.env.DEADWEIGHT_ROOT ? resolve(process.env.DEADWEIGHT_ROOT) : undefined), entryPoints };
}

const args = parseArgs(process.argv.slice(2));

// --- Transport --------------------------------------------------------------------------

function send(message: JsonRpcMessage) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function log(text: string) {
  process.stderr.write(`[deadweight-mcp] ${text}\n`);
}

let nextRequestId = 1;
const pending = new Map<string | number, (message: JsonRpcMessage) => void>();

// Asks the client something (e.g. its workspace roots) and waits for the answer.
function request(method: string, params?: Record<string, unknown>, timeoutMs = 3_000): Promise<JsonRpcMessage> {
  const id = `deadweight-${nextRequestId++}`;

  return new Promise((resolveResponse, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, timeoutMs);

    pending.set(id, (message) => {
      clearTimeout(timer);
      resolveResponse(message);
    });

    send({ jsonrpc: '2.0', id, method, params });
  });
}

// --- Project root and graph ---------------------------------------------------------------

let clientSupportsRoots = false;
let rootFromClient: string | undefined;
let rootsFetched = false;

async function projectRoot(): Promise<string> {
  if (args.root) {
    return args.root;
  }

  // The workspace the agent has open, when it tells us.
  if (clientSupportsRoots && !rootsFetched) {
    rootsFetched = true;

    try {
      const response = await request('roots/list');
      const roots = (response.result as { roots?: { uri?: string }[] } | undefined)?.roots ?? [];
      const uri = roots.map((root) => root.uri).find((candidate) => candidate?.startsWith('file:'));
      rootFromClient = uri ? fileURLToPath(uri) : undefined;
    } catch (error) {
      log(`Couldn't get the client's roots: ${(error as Error).message}`);
    }
  }

  return rootFromClient ?? process.cwd();
}

let cache: { root: string; graph: ConnectionGraph; index: GraphIndex; builtAt: number } | undefined;

async function currentGraph(): Promise<{ root: string; graph: ConnectionGraph; index: GraphIndex }> {
  const root = await projectRoot();

  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`Project folder not found: ${root}`);
  }

  if (!cache || cache.root !== root || Date.now() - cache.builtAt > GRAPH_MAX_AGE_MS) {
    const graph = await buildConnectionGraph(root, { entryPoints: args.entryPoints });
    cache = { root, graph, index: new GraphIndex(graph), builtAt: Date.now() };
  }

  return cache;
}

// --- Tools ---------------------------------------------------------------------------------

interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (input: Record<string, unknown>) => Promise<string>;
}

class ToolInputError extends Error {}

function stringArg(input: Record<string, unknown>, key: string, required: true): string;
function stringArg(input: Record<string, unknown>, key: string, required?: false): string | undefined;
function stringArg(input: Record<string, unknown>, key: string, required = false): string | undefined {
  const value = input[key];

  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (required) {
    throw new ToolInputError(`"${key}" is required.`);
  }

  return undefined;
}

async function findNode(input: string) {
  const { index } = await currentGraph();
  const found = index.resolve(input);

  if ('error' in found) {
    const hint = found.candidates.length > 0 ? `\nDid you mean:\n${found.candidates.map((c) => `  - ${c}`).join('\n')}` : '';
    throw new ToolInputError(`${found.error}${hint}`);
  }

  return { index, node: found.node };
}

const PATH_PROPERTY = {
  type: 'string',
  description: 'A file path relative to the project root (a unique end of the path such as "utils/format.ts" also works), or an npm package name.',
};

const TOOLS: Tool[] = [
  {
    name: 'project_map',
    title: 'Project map',
    description: 'Compact map of the whole JavaScript/TypeScript project: every source file grouped by folder, what each one imports, entry points, the most-imported files, npm packages, and unused code. Call this first to learn the structure instead of listing and opening files. Pass "folder" to map one part of a large project.',
    inputSchema: {
      type: 'object',
      properties: { folder: { type: 'string', description: 'Optional folder, relative to the project root, to limit the map to (e.g. "src/api").' } },
    },
    run: async (input) => {
      const { root, graph } = await currentGraph();
      const folder = stringArg(input, 'folder');
      const scoped = folder ? subgraph(graph, folder) : graph;

      if (folder && scoped.nodes.length === 0) {
        throw new ToolInputError(`No source files under "${folder}".`);
      }

      return renderProjectMapMarkdown(scoped, { projectName: folder ? `${basename(root)}/${folder}` : basename(root) });
    },
  },
  {
    name: 'file_info',
    title: 'File info',
    description: 'What one file imports and which files import it, whether it is an entry point, used, maybe used or unused (and why), and the size of its blast radius. Use it before editing or moving a file.',
    inputSchema: { type: 'object', properties: { path: PATH_PROPERTY }, required: ['path'] },
    run: async (input) => {
      const { index, node } = await findNode(stringArg(input, 'path', true));
      return describeNode(index, node);
    },
  },
  {
    name: 'blast_radius',
    title: 'Blast radius',
    description: 'Every file that depends on a file or package, directly or through other files, and the entry points affected. Use it to see what a change, rename or deletion can break, and which files and tests to check afterwards.',
    inputSchema: { type: 'object', properties: { path: PATH_PROPERTY }, required: ['path'] },
    run: async (input) => {
      const { index, node } = await findNode(stringArg(input, 'path', true));
      return describeBlastRadius(blastRadius(index, node.id)!);
    },
  },
  {
    name: 'import_path',
    title: 'Import path',
    description: 'The shortest chain of imports from one file to another file or package, e.g. to explain why a module ends up in a bundle or how a page reaches a helper.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { ...PATH_PROPERTY, description: 'The file the chain starts at.' },
        to: { ...PATH_PROPERTY, description: 'The file or package the chain should reach.' },
      },
      required: ['from', 'to'],
    },
    run: async (input) => {
      const { index, node: from } = await findNode(stringArg(input, 'from', true));
      const { node: to } = await findNode(stringArg(input, 'to', true));
      const chain = importPath(index, from.id, to.id);

      if (!chain) {
        return `${from.path ?? from.label} does not reach ${to.path ?? to.label} through imports.`;
      }

      return chain.map(({ node, kind }, step) => `${step === 0 ? '' : `${'  '.repeat(step - 1)}└─ `}${node.path ?? node.label}${kind && kind !== 'static' && kind !== 'require' ? ` (${kind})` : ''}`).join('\n');
    },
  },
  {
    name: 'find_unused',
    title: 'Find unused code',
    description: 'Files and npm packages that nothing reachable uses, plus ones that may be unused, each with the reason. Useful for cleanup tasks and to avoid editing dead code.',
    inputSchema: {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['files', 'packages', 'all'], description: 'What to list. Defaults to all.' } },
    },
    run: async (input) => {
      const { graph } = await currentGraph();
      const kind = stringArg(input, 'kind');
      return describeUnused(graph, kind === 'files' || kind === 'packages' ? kind : 'all');
    },
  },
];

// --- Dispatch ------------------------------------------------------------------------------

async function handleRequest(message: JsonRpcMessage): Promise<unknown> {
  const params = message.params ?? {};

  switch (message.method) {
    case 'initialize': {
      const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
      clientSupportsRoots = Boolean((params.capabilities as { roots?: unknown } | undefined)?.roots);

      return {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'deadweight', title: 'Deadweight', version: SERVER_VERSION },
        instructions: 'Deadweight knows how every file in this JavaScript/TypeScript project connects. Call project_map first to learn the structure, file_info before editing a file, and blast_radius before changing, renaming or deleting one. These are cheaper than reading files to find out.',
      };
    }
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS.map(({ name, title, description, inputSchema }) => ({ name, title, description, inputSchema })) };
    case 'tools/call': {
      const tool = TOOLS.find((candidate) => candidate.name === params.name);

      if (!tool) {
        throw Object.assign(new Error(`Unknown tool: ${String(params.name)}`), { code: INVALID_PARAMS });
      }

      try {
        const text = await tool.run((params.arguments ?? {}) as Record<string, unknown>);
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        // Tool failures go back to the model as a result it can act on, not a protocol error.
        return { content: [{ type: 'text', text: (error as Error).message }], isError: true };
      }
    }
    default:
      throw Object.assign(new Error(`Method not found: ${message.method}`), { code: METHOD_NOT_FOUND });
  }
}

function handleNotification(message: JsonRpcMessage) {
  if (message.method === 'notifications/roots/list_changed') {
    rootsFetched = false;
    rootFromClient = undefined;
    cache = undefined;
  }
}

async function handle(line: string) {
  let message: JsonRpcMessage;

  try {
    message = JSON.parse(line) as JsonRpcMessage;
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }

  // A response to one of our own requests.
  if (message.method === undefined && message.id !== undefined && message.id !== null) {
    pending.get(message.id)?.(message);
    pending.delete(message.id);
    return;
  }

  if (message.id === undefined || message.id === null) {
    handleNotification(message);
    return;
  }

  try {
    send({ jsonrpc: '2.0', id: message.id, result: await handleRequest(message) });
  } catch (error) {
    const code = (error as { code?: number }).code ?? INTERNAL_ERROR;
    send({ jsonrpc: '2.0', id: message.id, error: { code, message: (error as Error).message } });
  }
}

createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', (line) => {
  if (line.trim()) {
    void handle(line);
  }
});

process.stdin.on('end', () => process.exit(0));

log(`ready (v${SERVER_VERSION}${args.root ? `, root ${args.root}` : ''})`);
