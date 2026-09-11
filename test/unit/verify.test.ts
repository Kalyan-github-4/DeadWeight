import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyProvenUsed, withProvenUsed } from '../../src/actions/provenUsed';
import { executeRemoval, planRemoval, restoreSnapshot } from '../../src/actions/trash';
import { affectedProjects, detectChecks, likelyCulprits, projectForDir, runCheck } from '../../src/actions/verify';
import type { Finding } from '../../src/types';
import { makeTempProject } from './helpers';

const npm = () => 'npm' as const;

function file(name: string): Finding {
  return { id: `file:${name}`, kind: 'file', name, confidence: 'high', score: 90, reason: 'No import found.' };
}

function pkg(name: string, workspace?: string): Finding {
  return { id: `package:${workspace ? `${workspace}/` : ''}package.json:${name}`, kind: 'package', name, confidence: 'high', score: 90, reason: '', workspace };
}

describe('detectChecks', () => {
  it('finds the type check, build and test scripts, skipping placeholders and watchers', () => {
    const root = makeTempProject({
      'package.json': JSON.stringify({
        scripts: {
          'check-types': 'tsc --noEmit',
          build: 'node build.js',
          test: 'echo "Error: no test specified" && exit 1',
          dev: 'vite --watch',
        },
      }),
    });

    expect(detectChecks(root, [''], npm).map(({ id, label, command, args }) => ({ id, label, command, args }))).toEqual([
      { id: '#check-types', label: 'Type check', command: 'npm', args: ['run', 'check-types'] },
      { id: '#build', label: 'Build', command: 'npm', args: ['run', 'build'] },
    ]);
  });

  it('falls back to the TypeScript compiler when there is no type-check script', () => {
    const root = makeTempProject({
      'app/package.json': JSON.stringify({ scripts: { test: 'vitest' } }),
      'app/tsconfig.json': '{}',
      'app/node_modules/typescript/package.json': '{}',
    });

    expect(detectChecks(root, ['app'], () => 'pnpm').map(({ label, command, args }) => [label, command, ...args])).toEqual([
      ['Type check (app)', 'npx', '--no', 'tsc', '--noEmit'],
      ['Tests (app)', 'pnpm', 'run', 'test'],
    ]);
  });
});

describe('affectedProjects', () => {
  it('checks a workspace package from its monorepo root', () => {
    const root = makeTempProject({
      'mono/package.json': '{}',
      'mono/pnpm-lock.yaml': '',
      'mono/packages/ui/package.json': '{}',
      'solo/package.json': '{}',
    });

    expect(projectForDir(root, 'mono/packages/ui/src')).toBe('mono');
    expect(projectForDir(root, 'solo/src')).toBe('solo');
    expect(affectedProjects(root, [file('solo/src/old.js'), pkg('clsx', 'mono/packages/ui')])).toEqual(['mono', 'solo']);
  });
});

describe('likelyCulprits', () => {
  const removed = [pkg('lodash'), pkg('left-pad'), file('src/old-cart.js'), file('src/utils/money.ts')];

  it('reads missing modules from TypeScript, bundler and Node errors', () => {
    expect(likelyCulprits("src/index.ts(1,20): error TS2307: Cannot find module 'lodash' or its corresponding type declarations.", removed))
      .toEqual([removed[0]]);
    expect(likelyCulprits('✘ [ERROR] Could not resolve "./old-cart"\n    src/index.js:3:21:', removed))
      .toEqual([removed[2]]);
    expect(likelyCulprits("Error: Cannot find module '../utils/money'\nRequire stack:", removed))
      .toEqual([removed[3]]);
    expect(likelyCulprits("Module not found: Error: Can't resolve 'lodash/fp' in '/app/src'", removed))
      .toEqual([removed[0]]);
  });

  it('points at nothing when the output mentions nothing removed', () => {
    expect(likelyCulprits('error TS2322: Type "string" is not assignable to type "number".', removed)).toEqual([]);
  });
});

describe('proven-used findings', () => {
  it('stay at the bottom of the score after later scans', () => {
    const store = withProvenUsed({}, [pkg('lodash')], 'Removing it broke the build (npm run build)', new Date('2026-09-12T10:00:00Z'));
    const [demoted, untouched] = applyProvenUsed([{ ...pkg('lodash'), reason: 'No import found.' }, pkg('chalk')], store);

    expect(demoted).toMatchObject({
      confidence: 'low',
      score: 1,
      reason: "Removing it broke the build (npm run build) on 2026-09-12, so it's in use. No import found.",
    });
    expect(untouched).toEqual(pkg('chalk'));
  });
});

describe('verified removal, end to end', () => {
  // A build that loads a file only through a computed path: static analysis can't
  // see it, but removing the file breaks the build.
  const project = () => makeTempProject({
    'package.json': JSON.stringify({
      name: 'verify-e2e',
      scripts: { build: 'node build.js' },
    }),
    'build.js': "const name = 'old'; require('./src/' + name + '.js'); console.log('built');",
    'src/old.js': 'module.exports = 1;',
    'src/really-unused.js': 'module.exports = 2;',
  });

  it('undoes a removal that breaks the build and names the cause', async () => {
    const root = project();
    const [build] = detectChecks(root, [''], npm);

    expect((await runCheck(root, build, { timeoutMs: 60_000 })).ok).toBe(true);

    const removed = [file('src/old.js')];
    const { record } = await executeRemoval(root, planRemoval(removed, 'npm'));
    expect(existsSync(join(root, 'src/old.js'))).toBe(false);

    const after = await runCheck(root, build, { timeoutMs: 60_000 });
    expect(after.ok).toBe(false);
    expect(likelyCulprits(after.output, removed)).toEqual(removed);

    await restoreSnapshot(root, record);
    expect(existsSync(join(root, 'src/old.js'))).toBe(true);
    expect((await runCheck(root, build, { timeoutMs: 60_000 })).ok).toBe(true);
  });

  it('keeps a removal the build still passes with', async () => {
    const root = project();
    const [build] = detectChecks(root, [''], npm);

    await executeRemoval(root, planRemoval([file('src/really-unused.js')], 'npm'));

    expect((await runCheck(root, build, { timeoutMs: 60_000 })).ok).toBe(true);
  });

  it('counts a check that runs past its timeout as failed', async () => {
    const root = makeTempProject({
      'package.json': JSON.stringify({ scripts: { build: 'node hang.js' } }),
      'hang.js': 'setTimeout(() => {}, 60000);',
    });
    const [build] = detectChecks(root, [''], npm);
    const result = await runCheck(root, build, { timeoutMs: 1500 });

    expect(result).toMatchObject({ ok: false, timedOut: true });
  });
});
