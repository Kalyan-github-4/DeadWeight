import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMatcher, filterFindings } from '../../src/engine/filters';
import { GENERATED_KNIP_CONFIG, planKnipConfig } from '../../src/engine/knip';
import { scanWorkspace } from '../../src/engine/scan';
import type { Finding } from '../../src/types';
import { localEngines, makeTempProject } from './helpers';

const file = (name: string): Finding => ({
  id: `file:${name}`,
  kind: 'file',
  name,
  confidence: 'high',
  score: 0,
  reason: '',
});

const pkg = (name: string): Finding => ({
  id: `package:package.json:${name}`,
  kind: 'package',
  name,
  confidence: 'high',
  score: 0,
  reason: '',
});

describe('createMatcher', () => {
  it('uses .gitignore semantics for paths and package names', () => {
    const matches = createMatcher(['legacy/', '**/*.stories.tsx', '@types/*', ' ./tools/x.js ']);

    expect(matches('legacy/old.js')).toBe(true);
    expect(matches('src/legacy/old.js')).toBe(true);
    expect(matches('src/Button.stories.tsx')).toBe(true);
    expect(matches('@types/node')).toBe(true);
    expect(matches('tools/x.js')).toBe(true);
    expect(matches('src/Button.tsx')).toBe(false);
    expect(matches('react')).toBe(false);
  });

  it('matches nothing without patterns', () => {
    expect(createMatcher([' ', ''])('anything.js')).toBe(false);
  });
});

describe('filterFindings', () => {
  it('drops excluded findings and files that are entry points', () => {
    const findings = [file('src/a.js'), file('scripts/seed.js'), file('legacy/b.js'), pkg('@types/node'), pkg('left-pad')];

    const kept = filterFindings(findings, {
      exclude: ['legacy/', '@types/*'],
      entryPoints: ['scripts/*.js'],
    });

    expect(kept.map((finding) => finding.name)).toEqual(['src/a.js', 'left-pad']);
  });

  it('only applies entry points to files', () => {
    expect(filterFindings([pkg('scripts')], { entryPoints: ['scripts'] })).toHaveLength(1);
  });
});

describe('planKnipConfig', () => {
  it('does nothing without entry points', () => {
    const root = makeTempProject({ 'package.json': '{}' });

    expect(planKnipConfig(root, [' '])).toEqual({ args: [], warnings: [] });
  });

  it('keeps knip defaults and assigns globs to the workspace that owns them', () => {
    const root = makeTempProject({
      'package.json': '{"workspaces":["packages/*"]}',
      'packages/app/package.json': '{"name":"app"}',
    });

    const plan = planKnipConfig(root, ['scripts/*.js', './packages/app/tools/**/*.ts', 'packages/*/bin.js']);
    const workspaces = (plan.config as { workspaces: Record<string, { entry: string[] }> }).workspaces;

    expect(plan.args).toEqual(['--config', GENERATED_KNIP_CONFIG, '--no-config-hints']);
    expect(Object.keys(workspaces).sort()).toEqual(['.', 'packages/app']);
    expect(workspaces['.'].entry.slice(-2)).toEqual(['scripts/*.js', 'packages/*/bin.js']);
    expect(workspaces['packages/app'].entry.at(-1)).toBe('tools/**/*.ts');
    expect(workspaces['.'].entry[0]).toMatch(/^\{index,cli,main\}\./);
  });

  it("leaves a project's own knip config alone and says so", () => {
    const root = makeTempProject({ 'package.json': '{}', 'knip.json': '{}' });
    const plan = planKnipConfig(root, ['scripts/*.js']);

    expect(plan.config).toBeUndefined();
    expect(plan.args).toEqual([]);
    expect(plan.warnings[0]).toContain('knip.json');
  });

  it('treats package.json#knip as a project config', () => {
    const root = makeTempProject({ 'package.json': '{"knip":{"entry":["x.js"]}}' });

    expect(planKnipConfig(root, ['scripts/*.js']).warnings[0]).toContain('package.json#knip');
  });
});

describe('scan settings', () => {
  const project = () => makeTempProject({
    'package.json': '{"name":"cli","version":"1.0.0"}',
    'index.js': "console.log('main');\n",
    'scripts/seed.js': "require('../lib/db');\n",
    'lib/db.js': 'module.exports = {};\n',
    'lib/dead.js': 'module.exports = {};\n',
  });

  const fileNames = (findings: Finding[]) =>
    findings.filter((finding) => finding.kind === 'file').map((finding) => finding.name).sort();

  it('passes entry points to knip, so their imports count as used', async () => {
    const root = project();

    const before = await scanWorkspace(root, { engines: localEngines });
    expect(fileNames(before.findings)).toEqual(['lib/db.js', 'lib/dead.js', 'scripts/seed.js']);

    const after = await scanWorkspace(root, { engines: localEngines, entryPoints: ['scripts/*.js'] });
    expect(fileNames(after.findings)).toEqual(['lib/dead.js']);
    expect(existsSync(join(root, GENERATED_KNIP_CONFIG))).toBe(false);
  });

  it('routes entry points inside a monorepo workspace to that workspace', async () => {
    const root = makeTempProject({
      'package.json': '{"name":"mono","private":true,"workspaces":["packages/*"]}',
      'packages/app/package.json': '{"name":"app","version":"1.0.0"}',
      'packages/app/index.js': "console.log('app');\n",
      'packages/app/tools/build.js': "require('../lib/util');\n",
      'packages/app/lib/util.js': 'module.exports = {};\n',
      'packages/app/lib/dead.js': 'module.exports = {};\n',
    });

    const result = await scanWorkspace(root, {
      engines: localEngines,
      entryPoints: ['packages/app/tools/*.js'],
    });

    expect(fileNames(result.findings)).toEqual(['packages/app/lib/dead.js']);
  });

  it('hides excluded findings and applies the package-manager override', async () => {
    const root = project();

    const result = await scanWorkspace(root, {
      engines: localEngines,
      exclude: ['lib/dead.js'],
      packageManager: 'pnpm',
    });

    expect(fileNames(result.findings)).toEqual(['lib/db.js', 'scripts/seed.js']);
    expect(result.packageManager).toBe('pnpm');
  });
});
