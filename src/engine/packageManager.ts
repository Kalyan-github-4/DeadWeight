import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import type { ScanResult } from '../types';

export type PackageManager = ScanResult['packageManager'];

const PACKAGE_MANAGERS: readonly PackageManager[] = ['npm', 'yarn', 'pnpm', 'bun'];

// Corepack's `"packageManager": "pnpm@9.1.0"` field is the most explicit signal.
function fromPackageJsonField(workspaceRoot: string): PackageManager | undefined {
  try {
    const manifest = JSON.parse(
      readFileSync(join(workspaceRoot, 'package.json'), 'utf8'),
    ) as { packageManager?: unknown };

    if (typeof manifest.packageManager !== 'string') {
      return undefined;
    }

    const name = manifest.packageManager.split('@')[0];

    return PACKAGE_MANAGERS.find((manager) => manager === name);
  } catch {
    return undefined;
  }
}

const LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'];

// `dir` and each parent up to the root, as root-relative posix paths ('' is the root).
export function selfAndAncestors(dir: string): string[] {
  const dirs: string[] = [];
  let current = dir === '.' ? '' : dir;

  for (;;) {
    dirs.push(current);

    if (!current) {
      return dirs;
    }

    const parent = posix.dirname(current);
    current = parent === '.' ? '' : parent;
  }
}

// The dir that owns `dir`'s installs: the nearest one (itself or a parent inside
// `root`) with a lockfile or a `packageManager` field. A monorepo workspace package
// resolves to the monorepo root; a standalone project to itself.
export function findInstallRoot(root: string, dir: string): string {
  return selfAndAncestors(dir).find((candidate) =>
    LOCKFILES.some((lockfile) => existsSync(join(root, candidate, lockfile))) ||
    fromPackageJsonField(join(root, candidate)) !== undefined,
  ) ?? (dir === '.' ? '' : dir);
}

// The package manager for a project anywhere under `root`, e.g. a nested
// `apps/web/package.json` when the opened folder is the parent of several projects.
export function detectPackageManagerFor(root: string, dir: string): PackageManager {
  return detectPackageManager(join(root, findInstallRoot(root, dir)));
}

export function detectPackageManager(
  workspaceRoot: string,
): PackageManager {
  const declared = fromPackageJsonField(workspaceRoot);

  if (declared) {
    return declared;
  }

  if (existsSync(join(workspaceRoot, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }

  if (existsSync(join(workspaceRoot, 'yarn.lock'))) {
    return 'yarn';
  }

  if (
    existsSync(join(workspaceRoot, 'bun.lock')) ||
    existsSync(join(workspaceRoot, 'bun.lockb'))
  ) {
    return 'bun';
  }

  return 'npm';
}
