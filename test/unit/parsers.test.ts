import { describe, expect, it } from 'vitest';
import { parseDepcheckOutput } from '../../src/engine/depcheck';
import { parseKnipOutput } from '../../src/engine/knip';

// Captured from knip 6.35.1 `--reporter json` (empty issue arrays trimmed).
const KNIP_6_SAMPLE = JSON.stringify({
  issues: [
    { file: 'src/orphan.js', dependencies: [], devDependencies: [], files: [{ name: 'src/orphan.js' }], unresolved: [] },
    { file: 'src/ünïcode-orphan.js', dependencies: [], devDependencies: [], files: [{ name: 'src/ünïcode-orphan.js' }] },
    { file: 'package.json', dependencies: [{ name: 'lodash' }], devDependencies: [{ name: 'prettier' }], files: [] },
  ],
});

describe('parseKnipOutput', () => {
  it('reads files and dependencies from the knip 6 JSON shape', () => {
    const { findings } = parseKnipOutput(KNIP_6_SAMPLE);

    expect(findings.map(({ id, kind, name, workspace }) => ({ id, kind, name, workspace }))).toEqual([
      { id: 'file:src/orphan.js', kind: 'file', name: 'src/orphan.js', workspace: undefined },
      { id: 'file:src/ünïcode-orphan.js', kind: 'file', name: 'src/ünïcode-orphan.js', workspace: undefined },
      { id: 'package:package.json:lodash', kind: 'package', name: 'lodash', workspace: undefined },
      { id: 'package:package.json:prettier', kind: 'package', name: 'prettier', workspace: undefined },
    ]);
  });

  it('keeps the same package in two workspaces apart', () => {
    const { findings } = parseKnipOutput(JSON.stringify({
      issues: [
        { file: 'packages/a/package.json', dependencies: [{ name: 'lodash' }] },
        { file: 'packages/b/package.json', dependencies: [{ name: 'lodash' }] },
      ],
    }));

    expect(findings.map((f) => [f.id, f.workspace])).toEqual([
      ['package:packages/a/package.json:lodash', 'packages/a'],
      ['package:packages/b/package.json:lodash', 'packages/b'],
    ]);
  });

  it('collects files with unresolved imports', () => {
    const { unresolvedFiles } = parseKnipOutput(JSON.stringify({
      issues: [{ file: 'src/a.ts', unresolved: [{ name: './missing' }] }],
    }));

    expect(unresolvedFiles).toEqual(['src/a.ts']);
  });

  it('fails loudly on an unknown shape instead of reporting nothing', () => {
    expect(() => parseKnipOutput(JSON.stringify({ files: ['x'], dependencies: ['y'] })))
      .toThrow(/unexpected JSON format/);
    expect(() => parseKnipOutput('not json')).toThrow(/invalid JSON/);
  });
});

describe('parseDepcheckOutput', () => {
  it('merges unused dependencies and devDependencies', () => {
    const unused = parseDepcheckOutput(JSON.stringify({
      dependencies: ['chalk'],
      devDependencies: ['c8'],
      missing: {},
      using: {},
    }));

    expect([...unused]).toEqual(['chalk', 'c8']);
  });

  it('rejects output without the expected arrays', () => {
    expect(() => parseDepcheckOutput('{}')).toThrow(/unexpected JSON format/);
    expect(() => parseDepcheckOutput('Error: boom')).toThrow(/invalid JSON/);
  });
});
