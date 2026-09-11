import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectPackageManagerFor, findInstallRoot } from '../../src/engine/packageManager';
import { findProjectRoots } from '../../src/engine/project';
import { prefixFinding, rebaseGlobs, scanFolder } from '../../src/engine/scan';
import type { Confidence, Finding } from '../../src/types';
import { fixturesDir, localEngines, makeTempProject } from './helpers';

describe('findProjectRoots', () => {
  it('finds nested projects when the opened folder has no package.json', async () => {
    const root = makeTempProject({
      '.gitignore': 'ignored/\n',
      'notes.md': '',
      'apps/web/package.json': '{}',
      'apps/web/packages/ui/package.json': '{}',     // a workspace of apps/web, not its own project
      'tools/deep/cli/package.json': '{}',
      'ignored/app/package.json': '{}',
      'node_modules/lodash/package.json': '{}',
      '.cache/app/package.json': '{}',
    });

    expect(await findProjectRoots(root)).toEqual(['apps/web', 'tools/deep/cli']);
  });

  it('returns the folder itself when it is a project', async () => {
    const root = makeTempProject({ 'package.json': '{}', 'examples/demo/package.json': '{}' });
    expect(await findProjectRoots(root)).toEqual(['']);
  });

  it('returns nothing for a folder without JavaScript projects', async () => {
    expect(await findProjectRoots(makeTempProject({ 'README.md': '' }))).toEqual([]);
  });

  it('finds every fixture from the fixtures folder', async () => {
    expect(await findProjectRoots(fixturesDir)).toEqual(['dynamic-imports', 'next-app', 'node-cli', 'pnpm-mono']);
  });
});

describe('rebaseGlobs', () => {
  it('rebases, keeps or drops settings globs for a nested project', () => {
    expect(rebaseGlobs(
      ['apps/web/legacy/', 'legacy/', '**/*.stories.tsx', '@types/*', 'tools/cli/scripts/*.js', './apps/web/scripts/*.js'],
      'apps/web',
    )).toEqual(['legacy/', 'legacy/', '**/*.stories.tsx', '@types/*', 'scripts/*.js']);
  });

  it('leaves globs alone for a project at the folder root', () => {
    expect(rebaseGlobs(['src/legacy/'], '')).toEqual(['src/legacy/']);
  });
});

describe('prefixFinding', () => {
  const base = { confidence: 'high' as const, score: 90, reason: '' };

  it('makes file, export and package findings relative to the opened folder', () => {
    expect(prefixFinding({ ...base, id: 'file:src/a.js', kind: 'file', name: 'src/a.js' }, 'apps/web'))
      .toMatchObject({ id: 'file:apps/web/src/a.js', name: 'apps/web/src/a.js' });

    expect(prefixFinding({ ...base, id: 'export:src/a.js:x', kind: 'export', name: 'x', file: 'src/a.js' }, 'apps/web'))
      .toMatchObject({ id: 'export:apps/web/src/a.js:x', name: 'x', file: 'apps/web/src/a.js' });

    expect(prefixFinding({ ...base, id: 'package:package.json:lodash', kind: 'package', name: 'lodash' }, 'apps/web'))
      .toMatchObject({ id: 'package:apps/web/package.json:lodash', name: 'lodash', workspace: 'apps/web' });

    expect(prefixFinding(
      { ...base, id: 'package:packages/ui/package.json:clsx', kind: 'package', name: 'clsx', workspace: 'packages/ui' },
      'apps/web',
    )).toMatchObject({ id: 'package:apps/web/packages/ui/package.json:clsx', workspace: 'apps/web/packages/ui' });
  });
});

describe('package manager for nested projects', () => {
  it('uses the nearest dir with a lockfile or packageManager field', () => {
    expect(findInstallRoot(fixturesDir, 'pnpm-mono/packages/app')).toBe('pnpm-mono');
    expect(detectPackageManagerFor(fixturesDir, 'pnpm-mono/packages/app')).toBe('pnpm');

    const root = makeTempProject({ 'shop/package.json': '{}', 'shop/yarn.lock': '' });
    expect(detectPackageManagerFor(root, 'shop')).toBe('yarn');
  });
});

describe('scanFolder', () => {
  it('explains when there is nothing to scan', async () => {
    await expect(scanFolder(makeTempProject({ 'README.md': '' }), { engines: localEngines }))
      .rejects.toThrow(/No package.json found in .* or its subfolders/);
  });

  // The fixtures folder has no package.json of its own: exactly the "opened the
  // parent folder" case. Every fixture must still pass the release gate.
  it('scans every project under a parent folder with folder-relative paths', async () => {
    const result = await scanFolder(fixturesDir, { engines: localEngines, fetchAdvisories: false });

    expect(result.projects).toEqual(['dynamic-imports', 'next-app', 'node-cli', 'pnpm-mono']);

    const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
    const keyOf = (finding: Finding) => {
      const path = finding.kind === 'export' ? finding.file! : finding.kind === 'file' ? finding.name : finding.workspace ?? '';
      return { project: path.split('/')[0], key: `${finding.kind}:${finding.kind === 'file' ? path.slice(path.indexOf('/') + 1) : finding.name}` };
    };

    for (const finding of result.findings) {
      const { project, key } = keyOf(finding);
      expect(result.projects, finding.id).toContain(project);

      const expected = JSON.parse(readFileSync(join(fixturesDir, project, 'expected.json'), 'utf8')) as {
        unused: string[];
        expectAtMost?: Record<string, Confidence>;
      };

      if (finding.confidence === 'high' && finding.kind !== 'export') {
        expect(expected.unused, `${finding.id} is a false positive at high`).toContain(key);
      }

      const ceiling = expected.expectAtMost?.[key];

      if (ceiling) {
        expect(RANK[finding.confidence], finding.id).toBeLessThanOrEqual(RANK[ceiling]);
      }
    }

    expect(result.findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining(['file:node-cli/src/legacy.js', 'package:node-cli/package.json:chalk', 'file:next-app/components/Legacy.jsx']),
    );
    expect(result.scannedFileCount).toBeGreaterThan(0);
  });
});
