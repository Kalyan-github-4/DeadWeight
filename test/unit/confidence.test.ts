import { describe, expect, it } from 'vitest';
import { scoreFindings, type ScoringInput } from '../../src/engine/confidence';
import type { ProjectContext } from '../../src/engine/project';
import type { GraphNode } from '../../src/graphTypes';
import type { Finding } from '../../src/types';

function packageFinding(name: string, workspace?: string): Finding {
  const manifest = workspace ? `${workspace}/package.json` : 'package.json';
  return { id: `package:${manifest}:${name}`, kind: 'package', name, confidence: 'medium', score: 0, reason: '', workspace };
}

function fileFinding(name: string): Finding {
  return { id: `file:${name}`, kind: 'file', name, confidence: 'medium', score: 0, reason: '' };
}

function input(overrides: Partial<ProjectContext> = {}, extra: Partial<ScoringInput> = {}): ScoringInput {
  return {
    context: {
      sourceFileCount: 148,
      workspaceDirs: [''],
      dynamicImports: [],
      scripts: [],
      ci: [],
      configs: [],
      ...overrides,
    },
    unresolvedFiles: [],
    depcheckUnused: new Set(),
    packageInfo: new Map(),
    ...extra,
  };
}

function scoreOne(finding: Finding, scoring: ScoringInput): Finding {
  const [result] = scoreFindings([finding], scoring);
  return result;
}

describe('package confidence', () => {
  it('is high only when depcheck agrees', () => {
    const agreed = scoreOne(packageFinding('chalk'), input({}, { depcheckUnused: new Set(['chalk']) }));
    expect(agreed.confidence).toBe('high');
    expect(agreed.reason).toBe('No import found across 148 scanned files; depcheck agrees.');

    expect(scoreOne(packageFinding('chalk'), input()).confidence).toBe('low');
    expect(scoreOne(packageFinding('chalk'), input({}, { depcheckUnused: undefined })).confidence).toBe('medium');
  });

  const agreeing = (name: string) => ({ depcheckUnused: new Set([name]) });

  it('never trusts @types packages', () => {
    expect(scoreOne(packageFinding('@types/node'), input({}, agreeing('@types/node'))).confidence).toBe('low');
  });

  it('caps plugins, script, CI and config references at medium', () => {
    expect(scoreOne(packageFinding('eslint-plugin-react'), input({}, agreeing('eslint-plugin-react'))).confidence)
      .toBe('medium');

    const inScripts = scoreOne(
      packageFinding('typescript'),
      input(
        { scripts: [{ source: 'package.json', text: 'tsc --noEmit' }] },
        {
          ...agreeing('typescript'),
          packageInfo: new Map([['package:package.json:typescript', { bins: ['tsc', 'tsserver'] }]]),
        },
      ),
    );
    expect(inScripts.confidence).toBe('medium');
    expect(inScripts.reason).toContain('Used in the scripts of package.json');

    const inCi = scoreOne(
      packageFinding('c8'),
      input({ ci: [{ source: '.github/workflows/ci.yml', text: '- run: npx c8 node --test' }] }, agreeing('c8')),
    );
    expect(inCi.confidence).toBe('medium');

    const inConfig = scoreOne(
      packageFinding('autoprefixer'),
      input({ configs: [{ source: 'postcss.config.js', text: 'plugins: { autoprefixer: {} }' }] }, agreeing('autoprefixer')),
    );
    expect(inConfig.confidence).toBe('medium');
  });

  it('drops peer dependencies of installed packages to low', () => {
    const result = scoreOne(
      packageFinding('react-dom'),
      input({}, {
        ...agreeing('react-dom'),
        packageInfo: new Map([['package:package.json:react-dom', { bins: [], peerOf: 'next' }]]),
      }),
    );

    expect(result.confidence).toBe('low');
    expect(result.reason).toContain('Peer dependency of next');
  });

  it('caps a tool at medium when its config file exists', () => {
    const scoring = input({ configs: [{ source: '.eslintrc.json', text: '{ "extends": "next" }' }] }, agreeing('eslint'));
    const result = scoreOne(packageFinding('eslint'), scoring);

    expect(result.confidence).toBe('medium');
    expect(result.reason).toContain('.eslintrc.json exists');
  });

  it('caps monorepo workspace packages at medium', () => {
    const result = scoreOne(packageFinding('lodash', 'packages/a'), input({}, agreeing('lodash')));
    expect(result.confidence).toBe('medium');
  });

  it('drops to low when a computed import could load the package', () => {
    const bare = input({ dynamicImports: [{ file: 'src/i18n.js', prefix: 'dayjs/locale/' }] }, agreeing('dayjs'));
    expect(scoreOne(packageFinding('dayjs'), bare).confidence).toBe('low');

    const unrelated = input({ dynamicImports: [{ file: 'src/i18n.js', prefix: './locales/' }] }, agreeing('chalk'));
    expect(scoreOne(packageFinding('chalk'), unrelated).confidence).toBe('high');

    const fullyComputed = input({ dynamicImports: [{ file: 'src/load.js', prefix: '' }] }, agreeing('chalk'));
    expect(scoreOne(packageFinding('chalk'), fullyComputed).confidence).toBe('low');
  });

  it('drops to low when knip had unresolved imports in the workspace', () => {
    const result = scoreOne(packageFinding('chalk'), input({}, { ...agreeing('chalk'), unresolvedFiles: ['src/a.js'] }));
    expect(result.confidence).toBe('low');
  });
});

describe('file confidence', () => {
  it('starts high with the scanned-file count as the reason', () => {
    const result = scoreOne(fileFinding('src/legacy.js'), input({ sourceFileCount: 1 }));
    expect(result).toMatchObject({ confidence: 'high', score: 90, reason: 'No import found across 1 scanned file.' });
  });

  it('caps barrels at medium', () => {
    expect(scoreOne(fileFinding('src/components/index.ts'), input()).confidence).toBe('medium');
  });

  it('drops to low when a config references the path', () => {
    const scoring = input({
      configs: [{ source: 'next.config.js', text: "path.join(__dirname, 'shims/legacy-shim.js')" }],
    });
    const result = scoreOne(fileFinding('shims/legacy-shim.js'), scoring);

    expect(result.confidence).toBe('low');
    expect(result.reason).toContain('Referenced from next.config.js');
  });

  it('drops to low only for files under a computed import prefix', () => {
    const scoring = input({ dynamicImports: [{ file: 'src/index.js', prefix: './plugins/' }] });

    expect(scoreOne(fileFinding('src/plugins/hello.js'), scoring).confidence).toBe('low');
    expect(scoreOne(fileFinding('src/unused.js'), scoring).confidence).toBe('high');
  });

  it('resolves ../ prefixes relative to the importing file', () => {
    const scoring = input({ dynamicImports: [{ file: 'src/i18n.js', prefix: '../locales/' }] });
    expect(scoreOne(fileFinding('locales/fr.js'), scoring).confidence).toBe('low');
  });

  it('treats alias prefixes as unresolvable', () => {
    const scoring = input({ dynamicImports: [{ file: 'src/a.ts', prefix: '@/views/' }] });
    expect(scoreOne(fileFinding('src/other.ts'), scoring).confidence).toBe('low');
  });

  it('caps files inside a workspace package at medium', () => {
    const scoring = input({ workspaceDirs: ['', 'packages/app'] });
    expect(scoreOne(fileFinding('packages/app/src/dead.js'), scoring).confidence).toBe('medium');
  });

  it('drops anything inside the trash', () => {
    expect(scoreFindings([fileFinding('.deadweight-trash/2026/src/a.js')], input())).toEqual([]);
  });
});

function graphNode(id: string, status: GraphNode['status'], reason: string): [string, GraphNode] {
  return [id, { id, kind: id.startsWith('file:') ? 'file' : 'package', label: id, workspace: '', status, reason }];
}

describe('safe-to-delete score', () => {
  it('rises when Deadweight\'s graph agrees and drops to low when it disagrees', () => {
    const agrees = scoreOne(fileFinding('src/old.js'), input({}, {
      graph: new Map([graphNode('file:src/old.js', 'unused', 'Nothing imports this file')]),
    }));
    expect(agrees).toMatchObject({ confidence: 'high', score: 98 });
    expect(agrees.reason).toContain("Deadweight's graph agrees: nothing imports this file");

    const disagrees = scoreOne(fileFinding('src/old.js'), input({}, {
      graph: new Map([graphNode('file:src/old.js', 'used', 'Imported by src/index.js')]),
    }));
    expect(disagrees.confidence).toBe('low');
    expect(disagrees.reason).toContain('found it in use: imported by src/index.js');
  });

  it('never lets agreement lift a finding above the band its risks allow', () => {
    const result = scoreOne(fileFinding('src/components/index.ts'), input({}, {
      graph: new Map([graphNode('file:src/components/index.ts', 'unused', 'Nothing imports this file')]),
    }));

    expect(result.confidence).toBe('medium');
    expect(result.score).toBeLessThan(80);
  });

  it('confirms packages with the graph and depcheck together', () => {
    const result = scoreOne(packageFinding('chalk'), input({}, {
      depcheckUnused: new Set(['chalk']),
      graph: new Map([graphNode('package:chalk', 'unused', 'Declared in package.json, but nothing imports it')]),
    }));

    expect(result).toMatchObject({ confidence: 'high', score: 98 });
  });
});

describe('export confidence', () => {
  const exportFinding = (name: string, file = 'src/lib.js'): Finding => ({
    id: `export:${file}:${name}`, kind: 'export', name, file, line: 3, column: 17, confidence: 'medium', score: 0, reason: '',
  });

  it('is high when the name appears in no other file', () => {
    const result = scoreOne(exportFinding('neverCalled'), input({ identifierFileCounts: new Map([['neverCalled', 1]]) }));

    expect(result).toMatchObject({ confidence: 'high', score: 98 });
    expect(result.reason).toContain('"neverCalled" is exported from src/lib.js, but no file imports it');
  });

  it('drops to medium when the name shows up elsewhere', () => {
    const result = scoreOne(exportFinding('format'), input({ identifierFileCounts: new Map([['format', 4]]) }));

    expect(result.confidence).toBe('medium');
    expect(result.reason).toContain('also appears in 3 other files');
  });

  it('drops to low when the file is loaded by a computed import', () => {
    const result = scoreOne(exportFinding('run', 'src/plugins/a.js'), input(
      { identifierFileCounts: new Map([['run', 1]]) },
      { graph: new Map([graphNode('file:src/plugins/a.js', 'maybe', 'May be loaded by a computed import in src/index.js')]) },
    ));

    expect(result.confidence).toBe('low');
  });

  it('is dropped when its whole file is already reported unused', () => {
    const results = scoreFindings([fileFinding('src/lib.js'), exportFinding('neverCalled')], input());
    expect(results.map((f) => f.kind)).toEqual(['file']);
  });
});
