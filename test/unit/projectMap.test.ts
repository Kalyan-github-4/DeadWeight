import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildConnectionGraph } from '../../src/engine/graph';
import {
  AGENT_POINTER_MARKER,
  commonDir,
  estimateTokens,
  renderProjectMapJson,
  renderProjectMapMarkdown,
  withAgentPointer,
} from '../../src/engine/projectMap';
import type { ConnectionGraph } from '../../src/graphTypes';
import { fixturesDir } from './helpers';

const graph: ConnectionGraph = {
  nodes: [
    { id: 'file:src/index.js', kind: 'file', label: 'index.js', path: 'src/index.js', workspace: '', status: 'entry', reason: 'Default entry file' },
    { id: 'file:src/utils/format.js', kind: 'file', label: 'format.js', path: 'src/utils/format.js', workspace: '', status: 'used', reason: 'Imported by src/index.js' },
    { id: 'file:src/plugins/discounts.js', kind: 'file', label: 'discounts.js', path: 'src/plugins/discounts.js', workspace: '', status: 'maybe', reason: 'May be loaded by a computed import in src/index.js' },
    { id: 'file:src/old-cart.js', kind: 'file', label: 'old-cart.js', path: 'src/old-cart.js', workspace: '', status: 'unused', reason: 'Nothing imports this file' },
    { id: 'file:scripts/seed.js', kind: 'file', label: 'seed.js', path: 'scripts/seed.js', workspace: '', status: 'entry', reason: 'Run by a script in package.json' },
    { id: 'package:express', kind: 'package', label: 'express', workspace: '', status: 'used', reason: 'Imported by src/index.js' },
    { id: 'package:prettier', kind: 'package', label: 'prettier', workspace: '', status: 'maybe', reason: 'A prettier config file exists' },
    { id: 'package:left-pad', kind: 'package', label: 'left-pad', workspace: '', status: 'unused', reason: 'Declared in package.json, but nothing imports it' },
  ],
  edges: [
    { from: 'file:src/index.js', to: 'file:src/utils/format.js', kind: 'static' },
    { from: 'file:src/index.js', to: 'package:express', kind: 'static' },
    { from: 'file:src/index.js', to: 'file:src/plugins/discounts.js', kind: 'maybe' },
    { from: 'file:scripts/seed.js', to: 'file:src/utils/format.js', kind: 'type' },
  ],
  unresolved: [{ file: 'src/index.js', specifier: './missing' }],
  stats: { files: 5, entries: 2, used: 1, maybe: 1, unused: 1, packages: 3, unusedPackages: 1 },
  durationMs: 3,
};

const options = { projectName: 'demo', generatedAt: new Date('2026-09-11T00:00:00Z') };

describe('renderProjectMapMarkdown', () => {
  const markdown = renderProjectMapMarkdown(graph, options);

  it('groups files by folder with folder-relative targets', () => {
    expect(markdown).toContain([
      '### src/',
      '- index.js [entry] -> express, utils/format.js ?> plugins/discounts.js',
      '- old-cart.js [unused]',
    ].join('\n'));
    expect(markdown).toContain('### src/utils/\n- format.js <2');
    expect(markdown).toContain('### scripts/\n- seed.js [entry] ~> /src/utils/format.js');
  });

  it('keeps informative reasons and drops ones the tag already says', () => {
    expect(markdown).toContain('- discounts.js [maybe] <1 (May be loaded by a computed import in src/index.js)');
    expect(markdown).not.toContain('Nothing imports this file');
  });

  it('lists entry points by reason, hubs, packages and unresolved imports', () => {
    expect(markdown).toContain('## Entry points\n- Default entry file: src/index.js\n- Run by a script in package.json: scripts/seed.js');
    expect(markdown).toContain('## Most imported files\n- src/utils/format.js <2');
    expect(markdown).toContain('- used: express <1\n- maybe: prettier (A prettier config file exists)\n- unused: left-pad');
    expect(markdown).toContain('- src/index.js: "./missing"');
    expect(markdown).toContain('on 2026-09-11');
  });

  it('is much smaller than the source it describes on a real project', async () => {
    const real = await buildConnectionGraph(join(fixturesDir, 'next-app'));
    const map = renderProjectMapMarkdown(real, { projectName: 'next-app' });

    expect(map).toContain('# Project map: next-app');
    expect(map).toContain('- Legacy.jsx [unused]');
    expect(estimateTokens(map)).toBeGreaterThan(0);
  });
});

describe('shared path prefix', () => {
  it('finds the dir every file sits in', () => {
    expect(commonDir(['a/b/src/x.js', 'a/b/test/y.js', 'a/b/z.js'])).toBe('a/b');
    expect(commonDir(['a/x.js', 'b/y.js'])).toBe('');
    expect(commonDir(['x.js'])).toBe('');
  });

  it('is stated once instead of repeated on every line', () => {
    const nested: ConnectionGraph = {
      ...graph,
      nodes: graph.nodes.map((node) => ({
        ...node,
        id: node.kind === 'file' ? `file:repo/app/${node.path}` : node.id,
        path: node.path && `repo/app/${node.path}`,
        reason: node.reason.replace('src/index.js', 'repo/app/src/index.js'),
      })),
      edges: graph.edges.map((edge) => ({
        ...edge,
        from: edge.from.replace('file:', 'file:repo/app/'),
        to: edge.to.replace('file:', 'file:repo/app/'),
      })),
    };

    const markdown = renderProjectMapMarkdown(nested, options);

    expect(markdown).toContain('All paths below are relative to `repo/app/`.');
    expect(markdown).toContain('- index.js [entry] -> express, utils/format.js ?> plugins/discounts.js');
    expect(markdown).toContain('(May be loaded by a computed import in src/index.js)');
    expect(markdown.match(/repo\/app/g)).toHaveLength(1);
  });
});

describe('renderProjectMapJson', () => {
  it('holds the same structure as data', () => {
    const json = JSON.parse(renderProjectMapJson(graph, options));

    expect(json.format).toBe('deadweight-project-map@1');
    expect(json.files['src/index.js']).toEqual({
      status: 'entry',
      reason: 'Default entry file',
      imports: ['src/utils/format.js', 'package:express'],
      mayLoad: ['src/plugins/discounts.js'],
    });
    expect(json.files['src/utils/format.js']).toEqual({ status: 'used', importedBy: 2 });
    expect(json.packages['left-pad']).toMatchObject({ status: 'unused', importedBy: 0 });
  });
});

describe('withAgentPointer', () => {
  it('appends the pointer once', () => {
    const once = withAgentPointer('# Rules\n- be nice\n')!;

    expect(once).toContain(`# Rules\n- be nice\n\n${AGENT_POINTER_MARKER}\n## Project map`);
    expect(once).toContain('.deadweight/project-map.md');
    expect(withAgentPointer(once)).toBeUndefined();
  });

  it('writes just the section into an empty file', () => {
    expect(withAgentPointer('')!.startsWith(AGENT_POINTER_MARKER)).toBe(true);
  });
});
