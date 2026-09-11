import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import type { Finding } from '../types';
import { runProcess } from '../engine/exec';
import type { PackageManager } from '../engine/packageManager';
import { TRASH_DIR } from '../engine/project';

// Layout of one removal:
//   .deadweight-trash/<id>/<relative path>                  trashed files
//   .deadweight-trash/<id>/.deadweight-backup/<path>        package.json + lockfiles before uninstall
//   .deadweight-trash/<id>/.deadweight-backup/record.json   what happened, for restore

const BACKUP_DIR = '.deadweight-backup';
const RECORD_FILE = 'record.json';

const LOCKFILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
];

const UNINSTALL_VERB: Record<PackageManager, string> = {
  npm: 'uninstall',
  yarn: 'remove',
  pnpm: 'remove',
  bun: 'remove',
};

const NPM_PACKAGE_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;

export interface PackageGroup {
  manifest: string;   // workspace-relative package.json path
  names: string[];
}

export interface RemovalPlan {
  packageManager: PackageManager;
  packages: PackageGroup[];
  files: string[];
}

export interface SnapshotRecord {
  version: 1;
  id: string;
  createdAt: string;
  packageManager: PackageManager;
  files: string[];            // trashed, workspace-relative
  packages: PackageGroup[];   // successfully uninstalled
  backups: { path: string; hashAfterRemoval?: string }[];
}

export interface RemovalOutcome {
  record: SnapshotRecord;
  errors: string[];
}

export interface RestoreOutcome {
  restoredFiles: string[];
  conflicts: string[];        // files that exist again at their original path
  reinstalled: boolean;
  errors: string[];
}

export function planRemoval(
  findings: Finding[],
  packageManager: PackageManager,
): RemovalPlan {
  const groups = new Map<string, string[]>();

  for (const finding of findings) {
    if (finding.kind === 'package') {
      const manifest = posix.join(finding.workspace ?? '', 'package.json');
      groups.set(manifest, [...(groups.get(manifest) ?? []), finding.name]);
    }
  }

  return {
    packageManager,
    packages: [...groups].map(([manifest, names]) => ({ manifest, names })),
    files: findings.filter((f) => f.kind === 'file').map((f) => f.name),
  };
}

export function uninstallCommand(
  packageManager: PackageManager,
  names: string[],
): { command: string; args: string[] } {
  return { command: packageManager, args: [UNINSTALL_VERB[packageManager], ...names] };
}

// Only plain relative paths inside the workspace may be moved.
function isSafeRelativePath(path: string): boolean {
  return (
    path.length > 0 &&
    !posix.isAbsolute(path) &&
    !/^[A-Za-z]:/.test(path) &&
    !path.split(/[\\/]/).includes('..')
  );
}

function snapshotDir(root: string, id: string): string {
  return join(root, TRASH_DIR, id);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function hashFile(path: string): Promise<string | undefined> {
  try {
    return createHash('sha256').update(await readFile(path)).digest('hex');
  } catch {
    return undefined;
  }
}

async function moveFile(from: string, to: string) {
  await mkdir(dirname(to), { recursive: true });

  try {
    await rename(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') {
      throw error;
    }

    await copyFile(from, to);
    await rm(from);
  }
}

async function writeRecord(root: string, record: SnapshotRecord) {
  const path = join(snapshotDir(root, record.id), BACKUP_DIR, RECORD_FILE);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`);
}

function lastLines(text: string, count = 5): string {
  return text.trim().split(/\r?\n/).slice(-count).join('\n');
}

export async function ensureTrashIgnored(root: string) {
  const path = join(root, '.gitignore');
  let text = '';

  try {
    text = await readFile(path, 'utf8');
  } catch {
    // No .gitignore yet; create one.
  }

  const alreadyIgnored = text
    .split(/\r?\n/)
    .some((line) => /^\/?\.deadweight-trash\/?$/.test(line.trim()));

  if (alreadyIgnored) {
    return;
  }

  const separator = text && !text.endsWith('\n') ? '\n' : '';
  await writeFile(path, `${text}${separator}${TRASH_DIR}/\n`);
}

export async function executeRemoval(
  root: string,
  plan: RemovalPlan,
): Promise<RemovalOutcome> {
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = snapshotDir(root, id);
  const errors: string[] = [];

  const record: SnapshotRecord = {
    version: 1,
    id,
    createdAt: new Date().toISOString(),
    packageManager: plan.packageManager,
    files: [],
    packages: [],
    backups: [],
  };

  await ensureTrashIgnored(root);

  // Back up every manifest and lockfile an uninstall could rewrite.
  if (plan.packages.length > 0) {
    const candidates = new Set<string>();

    for (const { manifest } of plan.packages) {
      const manifestDir = posix.dirname(manifest);
      candidates.add(manifest);

      for (const lockfile of LOCKFILES) {
        candidates.add(lockfile);
        candidates.add(posix.join(manifestDir, lockfile));
      }
    }

    for (const path of candidates) {
      if (await exists(join(root, path))) {
        const target = join(dir, BACKUP_DIR, path);
        await mkdir(dirname(target), { recursive: true });
        await copyFile(join(root, path), target);
        record.backups.push({ path });
      }
    }
  }

  // Written before anything is mutated, so a crash midway still leaves a restorable record.
  await writeRecord(root, record);

  for (const file of plan.files) {
    if (!isSafeRelativePath(file)) {
      errors.push(`Skipped ${file}: not a path inside the workspace.`);
      continue;
    }

    try {
      await moveFile(join(root, file), join(dir, file));
      record.files.push(file);
    } catch (error) {
      errors.push(`Couldn't move ${file} to the trash: ${(error as Error).message}`);
    }
  }

  await writeRecord(root, record);

  for (const group of plan.packages) {
    const invalid = group.names.filter((name) => !NPM_PACKAGE_NAME.test(name));

    if (invalid.length > 0) {
      errors.push(`Skipped invalid package name(s): ${invalid.join(', ')}`);
      continue;
    }

    const { command, args } = uninstallCommand(plan.packageManager, group.names);
    const cwd = join(root, posix.dirname(group.manifest));

    try {
      const result = await runProcess(command, args, { cwd });

      if (result.code === 0) {
        record.packages.push(group);
      } else {
        errors.push(
          `\`${command} ${args.join(' ')}\` failed in ${posix.dirname(group.manifest)}:\n${lastLines(result.stderr || result.stdout)}`,
        );
      }
    } catch (error) {
      errors.push(`Couldn't run ${command}: ${(error as Error).message}`);
    }
  }

  for (const backup of record.backups) {
    backup.hashAfterRemoval = await hashFile(join(root, backup.path));
  }

  await writeRecord(root, record);

  return { record, errors };
}

export async function listSnapshots(root: string): Promise<SnapshotRecord[]> {
  let ids: string[];

  try {
    ids = await readdir(join(root, TRASH_DIR));
  } catch {
    return [];
  }

  const records: SnapshotRecord[] = [];

  for (const id of ids) {
    try {
      const record = JSON.parse(
        await readFile(join(snapshotDir(root, id), BACKUP_DIR, RECORD_FILE), 'utf8'),
      ) as SnapshotRecord;

      if (record.version === 1 && record.id === id) {
        records.push(record);
      }
    } catch {
      // Not a snapshot we wrote.
    }
  }

  return records.sort((a, b) => b.id.localeCompare(a.id));
}

// Backed-up files that were edited after the removal; restoring overwrites those edits.
export async function findChangedManifests(
  root: string,
  record: SnapshotRecord,
): Promise<string[]> {
  if (record.packages.length === 0) {
    return [];
  }

  const changed: string[] = [];

  for (const { path, hashAfterRemoval } of record.backups) {
    if (hashAfterRemoval !== undefined && (await hashFile(join(root, path))) !== hashAfterRemoval) {
      changed.push(path);
    }
  }

  return changed;
}

export async function restoreSnapshot(
  root: string,
  record: SnapshotRecord,
): Promise<RestoreOutcome> {
  const dir = snapshotDir(root, record.id);
  const outcome: RestoreOutcome = { restoredFiles: [], conflicts: [], reinstalled: false, errors: [] };

  for (const file of record.files) {
    if (!isSafeRelativePath(file)) {
      continue;
    }

    const target = join(root, file);

    if (await exists(target)) {
      outcome.conflicts.push(file);
      continue;
    }

    try {
      await moveFile(join(dir, file), target);
      outcome.restoredFiles.push(file);
    } catch (error) {
      outcome.errors.push(`Couldn't restore ${file}: ${(error as Error).message}`);
    }
  }

  const needsReinstall = record.packages.length > 0;

  if (needsReinstall) {
    for (const { path } of record.backups) {
      await copyFile(join(dir, BACKUP_DIR, path), join(root, path));
    }

    try {
      const result = await runProcess(record.packageManager, ['install'], { cwd: root });

      if (result.code === 0) {
        outcome.reinstalled = true;
      } else {
        outcome.errors.push(
          `package.json was restored, but \`${record.packageManager} install\` failed. Run it yourself to reinstall:\n${lastLines(result.stderr || result.stdout)}`,
        );
      }
    } catch (error) {
      outcome.errors.push(
        `package.json was restored, but ${record.packageManager} couldn't run: ${(error as Error).message}`,
      );
    }
  }

  const leftovers = [
    ...outcome.conflicts,
    ...record.files.filter(
      (file) => !outcome.restoredFiles.includes(file) && !outcome.conflicts.includes(file),
    ),
  ];

  if (leftovers.length === 0) {
    await rm(dir, { recursive: true, force: true });
  } else {
    // Keep the snapshot for whatever couldn't go back. Manifests are already restored.
    await writeRecord(root, { ...record, files: leftovers, packages: [], backups: [] });
  }

  return outcome;
}
