import { runProcess } from './exec';

// Pinned to the major version whose JSON output shape we parse below.
const DEPCHECK_ARGS = [
  '--yes',
  'depcheck@1',
  '--json',
  '--skip-missing',
  '--ignore-patterns=.deadweight-trash',
];

export interface DepcheckResult {
  unused: Set<string>;
  warnings: string[];
}

export function parseDepcheckOutput(stdout: string): Set<string> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error('depcheck returned invalid JSON output.');
  }

  const { dependencies, devDependencies } =
    (parsed ?? {}) as { dependencies?: unknown; devDependencies?: unknown };

  if (!Array.isArray(dependencies) || !Array.isArray(devDependencies)) {
    throw new Error('depcheck returned an unexpected JSON format.');
  }

  return new Set([...dependencies, ...devDependencies].map(String));
}

// Checks the root package.json only. Workspace packages are left to knip.
export async function runDepcheck(
  workspaceRoot: string,
  signal?: AbortSignal,
): Promise<DepcheckResult> {
  const { code, stdout, stderr } = await runProcess('npx', DEPCHECK_ARGS, {
    cwd: workspaceRoot,
    signal,
  });

  // depcheck exits non-zero both when it finds issues and when it crashes,
  // so valid JSON on stdout is the success signal.
  if (!stdout.trim()) {
    throw new Error(
      stderr.trim() || `depcheck exited with code ${code ?? 'unknown'}.`,
    );
  }

  return {
    unused: parseDepcheckOutput(stdout),
    warnings: stderr.trim() ? [stderr.trim()] : [],
  };
}
