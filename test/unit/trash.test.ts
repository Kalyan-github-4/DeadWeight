import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ensureTrashIgnored,
  executeRemoval,
  findChangedManifests,
  listSnapshots,
  planRemoval,
  restoreSnapshot,
} from '../../src/actions/trash';
import type { Finding } from '../../src/types';
import { makeTempProject } from './helpers';

function file(name: string): Finding {
  return { id: `file:${name}`, kind: 'file', name, confidence: 'high', score: 0, reason: '' };
}

describe('planRemoval', () => {
  it('groups packages by the manifest that declares them', () => {
    const plan = planRemoval(
      [
        { id: 'a', kind: 'package', name: 'lodash', confidence: 'high', score: 0, reason: '' },
        { id: 'b', kind: 'package', name: 'chalk', confidence: 'high', score: 0, reason: '' },
        { id: 'c', kind: 'package', name: 'left-pad', confidence: 'high', score: 0, reason: '', workspace: 'packages/utils' },
        file('src/old.js'),
      ],
      'pnpm',
    );

    expect(plan).toEqual({
      packageManager: 'pnpm',
      packages: [
        { manifest: 'package.json', names: ['lodash', 'chalk'] },
        { manifest: 'packages/utils/package.json', names: ['left-pad'] },
      ],
      files: ['src/old.js'],
    });
  });
});

describe('ensureTrashIgnored', () => {
  it('appends the trash dir once', async () => {
    const root = makeTempProject({ '.gitignore': 'node_modules' });

    await ensureTrashIgnored(root);
    await ensureTrashIgnored(root);

    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe('node_modules\n.deadweight-trash/\n');
  });

  it('creates .gitignore when missing', async () => {
    const root = makeTempProject({ 'package.json': '{}' });
    await ensureTrashIgnored(root);
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe('.deadweight-trash/\n');
  });
});

describe('file removal and restore', () => {
  it('moves files into a timestamped snapshot and back', async () => {
    const root = makeTempProject({
      'package.json': '{}',
      'src/keep.js': 'keep',
      'src/old/legacy.js': 'legacy',
    });

    const { record, errors } = await executeRemoval(root, planRemoval([file('src/old/legacy.js')], 'npm'));

    expect(errors).toEqual([]);
    expect(record.files).toEqual(['src/old/legacy.js']);
    expect(existsSync(join(root, 'src/old/legacy.js'))).toBe(false);
    expect(readFileSync(join(root, '.deadweight-trash', record.id, 'src/old/legacy.js'), 'utf8')).toBe('legacy');
    expect(await listSnapshots(root)).toEqual([record]);

    const outcome = await restoreSnapshot(root, record);

    expect(outcome).toMatchObject({ restoredFiles: ['src/old/legacy.js'], conflicts: [], errors: [] });
    expect(readFileSync(join(root, 'src/old/legacy.js'), 'utf8')).toBe('legacy');
    expect(existsSync(join(root, '.deadweight-trash', record.id))).toBe(false);
  });

  it('never overwrites a file that came back, and keeps it in the trash', async () => {
    const root = makeTempProject({ 'package.json': '{}', 'src/a.js': 'original' });

    const { record } = await executeRemoval(root, planRemoval([file('src/a.js')], 'npm'));
    writeFileSync(join(root, 'src/a.js'), 'rewritten');

    const outcome = await restoreSnapshot(root, record);

    expect(outcome.conflicts).toEqual(['src/a.js']);
    expect(readFileSync(join(root, 'src/a.js'), 'utf8')).toBe('rewritten');
    expect((await listSnapshots(root))[0].files).toEqual(['src/a.js']);
  });

  it('refuses paths that leave the workspace', async () => {
    const root = makeTempProject({ 'package.json': '{}' });
    const { record, errors } = await executeRemoval(root, planRemoval([file('../outside.js')], 'npm'));

    expect(record.files).toEqual([]);
    expect(errors[0]).toMatch(/not a path inside the workspace/);
  });
});

describe('findChangedManifests', () => {
  it('flags backups edited after the removal', async () => {
    const root = makeTempProject({ 'package.json': '{ "a": 1 }' });
    const record = {
      version: 1 as const,
      id: 'x',
      createdAt: '',
      packageManager: 'npm' as const,
      files: [],
      packages: [{ manifest: 'package.json', names: ['lodash'] }],
      backups: [{ path: 'package.json', hashAfterRemoval: 'not-the-current-hash' }],
    };

    expect(await findChangedManifests(root, record)).toEqual(['package.json']);
  });
});
