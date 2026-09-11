import { describe, expect, it } from 'vitest';
import { detectPackageManager } from '../../src/engine/packageManager';
import { makeTempProject } from './helpers';

describe('detectPackageManager', () => {
  it('reads the lockfile', () => {
    expect(detectPackageManager(makeTempProject({ 'package.json': '{}', 'pnpm-lock.yaml': '' }))).toBe('pnpm');
    expect(detectPackageManager(makeTempProject({ 'package.json': '{}', 'yarn.lock': '' }))).toBe('yarn');
    expect(detectPackageManager(makeTempProject({ 'package.json': '{}', 'bun.lock': '' }))).toBe('bun');
    expect(detectPackageManager(makeTempProject({ 'package.json': '{}', 'bun.lockb': '' }))).toBe('bun');
    expect(detectPackageManager(makeTempProject({ 'package.json': '{}' }))).toBe('npm');
  });

  it('prefers the packageManager field over lockfiles', () => {
    const root = makeTempProject({
      'package.json': '{ "packageManager": "pnpm@9.1.0" }',
      'yarn.lock': '',
    });

    expect(detectPackageManager(root)).toBe('pnpm');
  });

  it('ignores an unknown packageManager value', () => {
    const root = makeTempProject({ 'package.json': '{ "packageManager": "cargo@1" }', 'yarn.lock': '' });
    expect(detectPackageManager(root)).toBe('yarn');
  });
});
