import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import {
  blastRadius,
  describeBlastRadius,
  GraphIndex,
  importPath,
  subgraph,
} from '../../src/engine/graphQueries';
import type { ConnectionGraph, GraphNode } from '../../src/graphTypes';
import { makeTempProject } from './helpers';

function file(path: string, status: GraphNode['status'] = 'used'): GraphNode {
  return { id: `file:${path}`, kind: 'file', label: path.split('/').pop()!, path, workspace: '', status, reason: status === 'entry' ? 'Default entry file' : '' };
}

// main.ts -> app.ts -> utils/format.ts <- api/client.ts (type-only)   test/app.test.ts -> app.ts
const graph: ConnectionGraph = {
  nodes: [
    file('src/main.ts', 'entry'),
    file('src/app.ts'),
    file('src/utils/format.ts'),
    file('src/api/client.ts'),
    file('src/api/format.ts'),
    file('test/app.test.ts', 'entry'),
    file('src/old.ts', 'unused'),
    { id: 'package:lodash', kind: 'package', label: 'lodash', workspace: '', status: 'used', reason: '' },
  ],
  edges: [
    { from: 'file:src/main.ts', to: 'file:src/app.ts', kind: 'static' },
    { from: 'file:src/app.ts', to: 'file:src/utils/format.ts', kind: 'static' },
    { from: 'file:src/api/client.ts', to: 'file:src/utils/format.ts', kind: 'type' },
    { from: 'file:src/app.ts', to: 'file:src/api/client.ts', kind: 'static' },
    { from: 'file:test/app.test.ts', to: 'file:src/app.ts', kind: 'static' },
    { from: 'file:src/utils/format.ts', to: 'package:lodash', kind: 'static' },
  ],
  unresolved: [],
  stats: { files: 7, entries: 2, used: 4, maybe: 0, unused: 1, packages: 1, unusedPackages: 0 },
  durationMs: 1,
};

const index = new GraphIndex(graph);

describe('GraphIndex.resolve', () => {
  it('accepts the ways people and agents write paths', () => {
    for (const input of ['src/app.ts', './src/app.ts', 'src\\app.ts', '/src/app.ts', 'app.ts', 'app', 'src/app']) {
      expect(index.resolve(input), input).toMatchObject({ node: { id: 'file:src/app.ts' } });
    }

    expect(index.resolve('lodash')).toMatchObject({ node: { id: 'package:lodash' } });
  });

  it('asks for more of the path when a name is ambiguous', () => {
    expect(index.resolve('format.ts')).toEqual({
      error: '"format.ts" matches 2 files; give more of the path.',
      candidates: ['src/utils/format.ts', 'src/api/format.ts'],
    });
    expect(index.resolve('utils/format.ts')).toMatchObject({ node: { id: 'file:src/utils/format.ts' } });
  });

  it('suggests similar names when nothing matches', () => {
    expect(index.resolve('clien')).toMatchObject({ error: 'No file or package matches "clien".', candidates: ['src/api/client.ts'] });
  });
});

describe('blastRadius', () => {
  it('finds direct and indirect dependents and the entry points they reach', () => {
    const radius = blastRadius(index, 'file:src/utils/format.ts')!;

    expect(radius.direct.map((node) => node.path)).toEqual(['src/api/client.ts', 'src/app.ts']);
    expect(radius.indirect.map(({ node, depth, via }) => [node.path, depth, via])).toEqual([
      ['src/main.ts', 2, 'src/app.ts'],
      ['test/app.test.ts', 2, 'src/app.ts'],
    ]);
    expect(radius.entries.map((node) => node.path)).toEqual(['src/main.ts', 'test/app.test.ts']);
  });

  it('works for packages and says so when nothing depends on a file', () => {
    expect(blastRadius(index, 'package:lodash')!.direct.map((node) => node.path)).toEqual(['src/utils/format.ts']);
    expect(describeBlastRadius(blastRadius(index, 'file:src/old.ts')!)).toBe('Nothing imports src/old.ts, so changing it affects no other file.');
  });
});

describe('importPath', () => {
  it('finds the shortest chain', () => {
    expect(importPath(index, 'file:src/main.ts', 'package:lodash')!.map(({ node }) => node.label))
      .toEqual(['main.ts', 'app.ts', 'format.ts', 'lodash']);
    expect(importPath(index, 'file:src/old.ts', 'package:lodash')).toBeUndefined();
  });
});

describe('subgraph', () => {
  it('keeps a folder, what it imports, and correct stats', () => {
    const api = subgraph(graph, 'src/api');

    expect(api.nodes.map((node) => node.id)).toEqual(['file:src/utils/format.ts', 'file:src/api/client.ts', 'file:src/api/format.ts']);
    expect(api.stats.files).toBe(3);
  });
});

// --- The MCP server over stdio, as an agent would use it ----------------------------------

const serverSource = fileURLToPath(new URL('../../src/mcp/server.ts', import.meta.url));

async function startServer(root: string) {
  const outfile = join(mkdtempSync(join(tmpdir(), 'deadweight-mcp-')), 'mcp.js');
  await build({ entryPoints: [serverSource], bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent' });

  const child = spawn(process.execPath, [outfile, '--root', root], { stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map<number, (message: Record<string, unknown>) => void>();
  let buffer = '';
  let id = 0;

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;

    for (let newline = buffer.indexOf('\n'); newline !== -1; newline = buffer.indexOf('\n')) {
      const message = JSON.parse(buffer.slice(0, newline)) as Record<string, unknown>;
      buffer = buffer.slice(newline + 1);
      waiting.get(message.id as number)?.(message);
    }
  });

  const call = (method: string, params: Record<string, unknown> = {}) => new Promise<Record<string, unknown>>((resolve) => {
    const requestId = ++id;
    waiting.set(requestId, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params })}\n`);
  });

  const tool = async (name: string, args: Record<string, unknown>) => {
    const response = await call('tools/call', { name, arguments: args });
    const result = response.result as { content: { text: string }[]; isError?: boolean };
    return { text: result.content[0].text, isError: result.isError ?? false };
  };

  return { call, tool, stop: () => child.stdin.end() };
}

describe('MCP server', () => {
  it('answers initialize, lists its tools and runs them against a real project', async () => {
    const root = makeTempProject({
      'package.json': JSON.stringify({ name: 'demo', main: 'src/index.js', dependencies: { lodash: '4' } }),
      'src/index.js': "const { total } = require('./cart');\nconsole.log(total([1, 2]));",
      'src/cart.js': "const sum = require('lodash/sum');\nexports.total = (items) => sum(items);",
      'src/old.js': 'module.exports = 1;',
    });
    const server = await startServer(root);

    try {
      const init = await server.call('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
      expect(init.result).toMatchObject({ protocolVersion: '2025-03-26', serverInfo: { name: 'deadweight' }, capabilities: { tools: {} } });

      const list = await server.call('tools/list');
      expect((list.result as { tools: { name: string }[] }).tools.map((tool) => tool.name))
        .toEqual(['project_map', 'file_info', 'blast_radius', 'import_path', 'find_unused']);

      expect((await server.tool('project_map', {})).text).toContain('- old.js [unused]');
      expect((await server.tool('blast_radius', { path: 'cart.js' })).text)
        .toContain('Changing src/cart.js can affect 1 file(s): 1 direct, 0 indirect.');
      expect((await server.tool('import_path', { from: 'src/index.js', to: 'lodash' })).text)
        .toBe('src/index.js\n└─ src/cart.js\n  └─ lodash');
      expect((await server.tool('find_unused', { kind: 'files' })).text).toContain('src/old.js — Nothing imports this file');

      const missing = await server.tool('file_info', { path: 'nope.js' });
      expect(missing).toMatchObject({ isError: true, text: 'No file or package matches "nope.js".' });

      const unknown = await server.call('resources/list');
      expect(unknown.error).toMatchObject({ code: -32601 });
    } finally {
      server.stop();
    }
  });
});
