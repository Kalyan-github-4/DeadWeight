import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAdvisoryCache,
  describeAdvisories,
  formatBytes,
  measureFootprints,
  totalFootprint,
  type AdvisoryFetcher,
} from '../../src/engine/footprint';
import type { Finding } from '../../src/types';
import { makeTempProject } from './helpers';

// An installed package: its package.json plus a file of `size` bytes.
function installed(name: string, version: string, deps: Record<string, string> = {}, size = 1000) {
  return {
    'package.json': JSON.stringify({ name, version, dependencies: deps }),
    'index.js': 'x'.repeat(size),
  };
}

function place(root: string, dir: string, files: Record<string, string>) {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, dir, file)), { recursive: true });
    writeFileSync(join(root, dir, file), text);
  }
}

// npm/yarn layout: hoisted to the root node_modules, with one nested copy.
//   app -> left-pad (unused) -> only-left-pad, shared, nested@1 (nested inside left-pad)
//   app -> express (used)    -> shared
function npmProject(): string {
  const root = makeTempProject({
    'package.json': JSON.stringify({ name: 'app', dependencies: { 'left-pad': '1', express: '4' } }),
  });

  place(root, 'node_modules/left-pad', installed('left-pad', '1.3.0', { 'only-left-pad': '1', shared: '1', nested: '1' }, 2000));
  place(root, 'node_modules/left-pad/node_modules/nested', installed('nested', '1.0.0', {}, 500));
  place(root, 'node_modules/only-left-pad', installed('only-left-pad', '1.0.0', {}, 3000));
  place(root, 'node_modules/shared', installed('shared', '2.0.0'));
  place(root, 'node_modules/nested', installed('nested', '2.0.0'));
  place(root, 'node_modules/express', installed('express', '4.0.0', { shared: '2' }));

  return root;
}

const noAdvisories: AdvisoryFetcher = async () => ({});

const leftPad = { id: 'package:package.json:left-pad', manifestDir: '', name: 'left-pad' };

beforeEach(() => clearAdvisoryCache());

describe('measureFootprints', () => {
  it('counts the package and the dependencies only it needs, not shared ones', async () => {
    const result = await measureFootprints(npmProject(), [''], [leftPad], { fetchAdvisories: noAdvisories });
    const footprint = result.perRemoval.get(leftPad.id)!;

    // left-pad (2000 + its package.json), only-left-pad (3000 + ...), its nested copy of nested (500 + ...).
    expect(footprint.packages).toBe(3);
    expect(footprint.bytes).toBeGreaterThan(5500);
    expect(footprint.bytes).toBeLessThan(6000);
    expect(result.combined).toEqual(footprint);
  });

  it('counts known vulnerabilities in what goes away, matching versions', async () => {
    const requests: Record<string, string[]>[] = [];
    const fetcher: AdvisoryFetcher = async (request) => {
      requests.push(request);
      return {
        'only-left-pad': [
          { severity: 'high', title: 'Prototype pollution', url: 'https://github.com/advisories/GHSA-1', vulnerable_versions: '<2.0.0' },
          { severity: 'critical', title: 'Fixed long ago', url: 'https://github.com/advisories/GHSA-2', vulnerable_versions: '<0.5.0' },
        ],
        shared: [{ severity: 'critical', title: 'In a package that stays', url: 'https://github.com/advisories/GHSA-3', vulnerable_versions: '*' }],
      };
    };

    const result = await measureFootprints(npmProject(), [''], [leftPad], { fetchAdvisories: fetcher });

    expect(result.perRemoval.get(leftPad.id)!.advisories).toEqual([
      { package: 'only-left-pad', version: '1.0.0', severity: 'high', title: 'Prototype pollution', url: 'https://github.com/advisories/GHSA-1' },
    ]);
    // Only what goes away is sent to the registry.
    expect(Object.keys(requests[0]).sort()).toEqual(['left-pad', 'nested', 'only-left-pad']);
  });

  it('removing several packages frees what they shared too', async () => {
    const express = { id: 'package:package.json:express', manifestDir: '', name: 'express' };
    const result = await measureFootprints(npmProject(), [''], [leftPad, express], { fetchAdvisories: noAdvisories });

    expect(result.perRemoval.get(express.id)!.packages).toBe(1);
    expect(result.combined.packages).toBe(5);   // + shared, which only these two needed
  });

  it("keeps a package another workspace still declares", async () => {
    const root = npmProject();
    place(root, 'packages/web', { 'package.json': JSON.stringify({ name: 'web', dependencies: { 'left-pad': '1' } }) });

    const result = await measureFootprints(root, ['', 'packages/web'], [leftPad], { fetchAdvisories: noAdvisories });

    expect(result.perRemoval.get(leftPad.id)!.packages).toBe(0);
  });

  it('follows the pnpm store layout through symlinks', async () => {
    const root = makeTempProject({
      'package.json': JSON.stringify({ name: 'app', dependencies: { chalk: '5' } }),
    });
    const store = (id: string) => join(root, 'node_modules/.pnpm', id, 'node_modules');

    place(root, 'node_modules/.pnpm/chalk@5.0.0/node_modules/chalk', installed('chalk', '5.0.0', { 'ansi-styles': '6' }));
    place(root, 'node_modules/.pnpm/ansi-styles@6.0.0/node_modules/ansi-styles', installed('ansi-styles', '6.0.0'));
    // pnpm links each package's dependencies next to it, and the top-level ones into node_modules.
    symlinkSync(join(store('ansi-styles@6.0.0'), 'ansi-styles'), join(store('chalk@5.0.0'), 'ansi-styles'), 'junction');
    symlinkSync(join(store('chalk@5.0.0'), 'chalk'), join(root, 'node_modules/chalk'), 'junction');

    const chalk = { id: 'package:package.json:chalk', manifestDir: '', name: 'chalk' };
    const result = await measureFootprints(root, [''], [chalk], { fetchAdvisories: noAdvisories });

    expect(result.perRemoval.get(chalk.id)!.packages).toBe(2);
  });

  it('still measures sizes when the advisory lookup fails', async () => {
    const offline: AdvisoryFetcher = async () => {
      throw new Error('getaddrinfo ENOTFOUND registry.npmjs.org');
    };

    const result = await measureFootprints(npmProject(), [''], [leftPad], { fetchAdvisories: offline });

    expect(result.perRemoval.get(leftPad.id)!.packages).toBe(3);
    expect(result.warnings[0]).toMatch(/Couldn't check unused packages for known vulnerabilities \(getaddrinfo/);
  });

  it('ignores packages that are declared but not installed', async () => {
    const root = makeTempProject({ 'package.json': JSON.stringify({ dependencies: { lodash: '4' } }) });
    const lodash = { id: 'package:package.json:lodash', manifestDir: '', name: 'lodash' };

    expect((await measureFootprints(root, [''], [lodash], { fetchAdvisories: noAdvisories })).combined.packages).toBe(0);
  });
});

describe('formatting', () => {
  it('formats sizes and vulnerability counts', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(84 * 1024 * 1024)).toBe('84 MB');

    const advisory = { package: 'x', version: '1.0.0', title: 't', url: '' };
    expect(describeAdvisories([])).toBe('no known vulnerabilities');
    expect(describeAdvisories([{ ...advisory, severity: 'critical' }, { ...advisory, severity: 'high' }, { ...advisory, severity: 'high' }]))
      .toBe('3 known vulnerabilities (1 critical, 2 high)');
  });

  it('adds up findings for the review panel', () => {
    const finding = (bytes: number): Finding => ({
      id: String(bytes), kind: 'package', name: 'p', confidence: 'high', score: 90, reason: '',
      footprint: { packages: 2, bytes, advisories: [] },
    });

    expect(totalFootprint([finding(100), finding(50)])).toEqual({ packages: 4, bytes: 150, advisories: [] });
  });
});
