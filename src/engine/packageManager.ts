import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
