import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildConnectionGraph, type ConnectionGraph, type NodeStatus } from '../../src/engine/graph';
import { extractImports } from '../../src/engine/imports';
import { parseJsonc } from '../../src/engine/resolver';
import { fixturesDir, makeTempProject } from './helpers';

const statuses = (graph: ConnectionGraph) =>
  Object.fromEntries(graph.nodes.map((node) => [node.id, node.status]));

const hasEdge = (graph: ConnectionGraph, from: string, to: string) =>
  graph.edges.some((edge) => edge.from === from && edge.to === to);

function expectStatuses(graph: ConnectionGraph, expected: Record<string, NodeStatus>) {
  const actual = statuses(graph);
  const summary = graph.nodes.map((n) => `${n.id} [${n.status}] ${n.reason}`).join('\n');

  for (const [id, status] of Object.entries(expected)) {
    expect(actual[id], `${id}\n${summary}`).toBe(status);
  }
}

describe('extractImports', () => {
  it('finds every static, type, require and literal dynamic import', () => {
    const { imports } = extractImports(`
      import a from 'a';
      import { b1, b2 as bb } from "b";
      import * as c from 'c';
      import 'd';
      import type { E } from 'e';
      import def, {
        f1,
        f2,
      } from 'f';
      export * from './g';
      export { h } from './h';
      export type { I } from './i';
      const j = require('j');
      const k = await import('k');
      const l = import(\`l\`);
      import m = require('m');
      require.resolve('n');
      obj.require('not-an-import');
    `);

    expect(imports).toEqual([
      { specifier: 'a', kind: 'static' },
      { specifier: 'b', kind: 'static' },
      { specifier: 'c', kind: 'static' },
      { specifier: 'd', kind: 'static' },
      { specifier: 'e', kind: 'type' },
      { specifier: 'f', kind: 'static' },
      { specifier: './g', kind: 'static' },
      { specifier: './h', kind: 'static' },
      { specifier: './i', kind: 'type' },
      { specifier: 'j', kind: 'require' },
      { specifier: 'k', kind: 'dynamic' },
      { specifier: 'l', kind: 'dynamic' },
      { specifier: 'm', kind: 'require' },
      { specifier: 'n', kind: 'require' },
    ]);
  });

  it('ignores imports in comments but keeps strings intact', () => {
    const { imports } = extractImports(`
      // import x from 'commented';
      /* require('also-commented') */
      const url = "http://example.com"; import real from 'real';
    `);

    expect(imports.map((i) => i.specifier)).toEqual(['real']);
  });

  it('reports computed paths as prefixes, not imports', () => {
    const result = extractImports("import(`./plugins/${name}.js`); require('./locales/' + lang); require(x);");

    expect(result.imports).toEqual([]);
    expect(result.dynamicPrefixes).toEqual(['./plugins/', './locales/', '']);
  });
});

describe('parseJsonc', () => {
  it('handles comments, trailing commas and slashes inside strings', () => {
    expect(parseJsonc('{ // c\n "a": "http://x", /* d */ "b": [1,], }')).toEqual({ a: 'http://x', b: [1] });
  });
});

describe('buildConnectionGraph on the fixtures', () => {
  it('node-cli: follows require() into directory index files', async () => {
    const graph = await buildConnectionGraph(join(fixturesDir, 'node-cli'));

    expectStatuses(graph, {
      'file:src/cli.js': 'entry',
      'file:src/commands/index.js': 'used',
      'file:src/commands/greet.js': 'used',
      'file:src/legacy.js': 'unused',
      'package:commander': 'used',
      'package:chalk': 'unused',
      'package:c8': 'used',
      'package:prettier': 'used',
    });
    expect(hasEdge(graph, 'file:src/cli.js', 'file:src/commands/index.js')).toBe(true);
  });

  it('next-app: Next.js conventions, config path references and the JSX runtime', async () => {
    const graph = await buildConnectionGraph(join(fixturesDir, 'next-app'));

    expectStatuses(graph, {
      'file:pages/index.jsx': 'entry',
      'file:components/Button.jsx': 'used',
      'file:components/Legacy.jsx': 'unused',
      'file:shims/legacy-shim.js': 'used',
      'package:next': 'used',
      'package:react': 'used',
      'package:left-pad': 'unused',
      'package:@types/react': 'maybe',
      'package:tailwindcss': 'maybe',
      'package:eslint-config-next': 'maybe',
    });
    expect(graph.edges).toContainEqual({ from: 'file:next.config.js', to: 'file:shims/legacy-shim.js', kind: 'config' });
  });

  it('dynamic-imports: computed paths make files "maybe", never "unused"', async () => {
    const graph = await buildConnectionGraph(join(fixturesDir, 'dynamic-imports'));

    expectStatuses(graph, {
      'file:src/index.js': 'entry',
      'file:src/i18n.js': 'used',
      'file:src/plugins/hello.js': 'maybe',
      'file:src/plugins/goodbye.js': 'maybe',
      'file:locales/de.js': 'maybe',
      'file:locales/fr.js': 'maybe',
      'file:src/unused-helper.js': 'unused',
      'package:dayjs': 'used',
    });
  });

  it('pnpm-mono: resolves workspace packages to their source', async () => {
    const graph = await buildConnectionGraph(join(fixturesDir, 'pnpm-mono'));

    expectStatuses(graph, {
      'file:packages/app/src/index.js': 'entry',
      'file:packages/utils/src/index.js': 'entry',
      'file:packages/app/src/dead.js': 'unused',
      'package:lodash': 'unused',
      'package:left-pad': 'unused',
    });
    expect(hasEdge(graph, 'file:packages/app/src/index.js', 'file:packages/utils/src/index.js')).toBe(true);
    expect(graph.nodes.some((node) => node.id === 'package:@mono/utils')).toBe(false);
  });

  it('flags every really-unused file and nothing else, on every fixture', async () => {
    const reallyUnused: Record<string, string[]> = {
      'node-cli': ['src/legacy.js'],
      'next-app': ['components/Legacy.jsx'],
      'dynamic-imports': ['src/unused-helper.js'],
      'pnpm-mono': ['packages/app/src/dead.js'],
    };

    for (const [fixture, expected] of Object.entries(reallyUnused)) {
      const graph = await buildConnectionGraph(join(fixturesDir, fixture));
      const unused = graph.nodes.filter((n) => n.kind === 'file' && n.status === 'unused').map((n) => n.path);

      expect(unused, fixture).toEqual(expected);
    }
  });
});

describe('buildConnectionGraph resolution', () => {
  it('resolves tsconfig path aliases, baseUrl and .js imports of .ts files', async () => {
    const root = makeTempProject({
      'package.json': '{"name":"app","main":"src/main.ts"}',
      'tsconfig.json': '{ // comment\n "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"], }, }, }',
      'src/main.ts': "import { a } from '@/lib/a';\nimport { b } from 'src/lib/b';\nimport { c } from './lib/c.js';\n",
      'src/lib/a.ts': 'export const a = 1;',
      'src/lib/b.ts': 'export const b = 1;',
      'src/lib/c.ts': 'export const c = 1;',
      'src/lib/dead.ts': 'export const d = 1;',
    });

    const graph = await buildConnectionGraph(root);

    expectStatuses(graph, {
      'file:src/main.ts': 'entry',
      'file:src/lib/a.ts': 'used',
      'file:src/lib/b.ts': 'used',
      'file:src/lib/c.ts': 'used',
      'file:src/lib/dead.ts': 'unused',
    });
    expect(graph.unresolved).toEqual([]);
  });

  it('explains dead chains and does not call unresolved-alias workspaces "unused"', async () => {
    const chain = await buildConnectionGraph(makeTempProject({
      'package.json': '{"name":"app"}',
      'index.js': "console.log('hi');",
      'old/a.js': "require('./b');",
      'old/b.js': 'module.exports = 1;',
    }));

    const b = chain.nodes.find((node) => node.id === 'file:old/b.js')!;
    expect(b.status).toBe('unused');
    expect(b.reason).toBe('Only imported by unused files: old/a.js');

    const aliased = await buildConnectionGraph(makeTempProject({
      'package.json': '{"name":"app"}',
      'index.js': "import x from '~/somewhere';",
      'other.js': 'export default 1;',
    }));

    expect(statuses(aliased)['file:other.js']).toBe('maybe');
  });

  it('maps build-output entries to source and follows paths named in build scripts', async () => {
    const graph = await buildConnectionGraph(makeTempProject({
      'package.json': '{"name":"ext","main":"./dist/extension.js","scripts":{"build":"node esbuild.js"}}',
      'esbuild.js': "require('esbuild').build({ entryPoints: ['src/webview/main.ts'] });",
      'src/extension.ts': "import { a } from './a';",
      'src/a.ts': 'export const a = 1;',
      'src/webview/main.ts': 'console.log(1);',
      'src/dead.ts': 'export {};',
    }));

    expectStatuses(graph, {
      'file:src/extension.ts': 'entry',
      'file:src/a.ts': 'used',
      'file:esbuild.js': 'entry',
      'file:src/webview/main.ts': 'used',
      'file:src/dead.ts': 'unused',
    });
  });

  it('treats files from the entryPoints setting and npm scripts as entries', async () => {
    const graph = await buildConnectionGraph(makeTempProject({
      'package.json': '{"name":"app","scripts":{"seed":"node scripts/seed.js"}}',
      'scripts/seed.js': "require('../lib/db');",
      'lib/db.js': 'module.exports = {};',
      'tools/gen.js': 'module.exports = {};',
    }), { entryPoints: ['tools/*.js'] });

    expectStatuses(graph, {
      'file:scripts/seed.js': 'entry',
      'file:lib/db.js': 'used',
      'file:tools/gen.js': 'entry',
    });
  });
});
