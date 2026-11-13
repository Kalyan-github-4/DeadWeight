import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import type { Finding } from '../types';
import { runProcess } from './exec';

// Pinned to the major version whose JSON reporter shape we parse below.
const KNIP_ARGS = ['--yes', 'knip@6', '--reporter', 'json'];

// Knip's parser (oxc) otherwise reserves a multi-GB ArrayBuffer per process. When
// memory is tight that either crashes knip ("Array buffer allocation failed") or,
// worse, silently drops a file's imports so the files it imports look unused.
export const KNIP_ENV = { KNIP_DISABLE_RAW_TRANSFER: '1' };

// Where knip looks for a project config (knip 6, `KNIP_CONFIG_LOCATIONS`), besides package.json#knip.
const KNIP_CONFIG_FILES = [
  'knip.json',
  'knip.jsonc',
  '.knip.json',
  '.knip.jsonc',
  'knip.ts',
  'knip.js',
  'knip.config.ts',
  'knip.config.js',
];

// Knip's default entry patterns. Setting `entry` replaces them, so a generated
// config repeats them. Spelled exactly as knip does, so it doesn't hint about them.
const KNIP_DEFAULT_EXTENSIONS = 'js,mjs,cjs,jsx,ts,tsx,mts,cts';
const KNIP_DEFAULT_ENTRY = [
  `{index,cli,main}.{${KNIP_DEFAULT_EXTENSIONS}}!`,
  `src/{index,cli,main}.{${KNIP_DEFAULT_EXTENSIONS}}!`,
];

// Relative to the workspace root, so it passes the Windows shell-argument check,
// and inside node_modules, which projects already ignore.
export const GENERATED_KNIP_CONFIG = 'node_modules/.cache/deadweight/knip.json';

export interface KnipOptions {
  signal?: AbortSignal;
  entryPoints?: string[];     // extra entry globs, relative to the workspace root
}

export interface KnipConfigPlan {
  args: string[];                       // extra knip arguments
  config?: Record<string, unknown>;     // written to GENERATED_KNIP_CONFIG when set
  warnings: string[];
}

function findProjectKnipConfig(workspaceRoot: string): string | undefined {
  const file = KNIP_CONFIG_FILES.find((name) => existsSync(join(workspaceRoot, name)));

  if (file) {
    return file;
  }

  try {
    const manifest = JSON.parse(readFileSync(join(workspaceRoot, 'package.json'), 'utf8')) as { knip?: unknown };
    return manifest.knip ? 'package.json#knip' : undefined;
  } catch {
    return undefined;
  }
}

// Knip reads entry patterns per workspace, relative to that workspace's directory.
// Files the root workspace doesn't own (those inside a nested workspace) never
// match a root pattern, so each glob goes to the deepest dir with a package.json.
function workspaceForGlob(workspaceRoot: string, glob: string): { workspace: string; pattern: string } {
  const segments = glob.split('/');
  const staticSegments = segments.slice(0, -1);
  const firstDynamic = staticSegments.findIndex((segment) => /[*?{}[\]!]/.test(segment));

  if (firstDynamic !== -1) {
    staticSegments.length = firstDynamic;
  }

  for (let depth = staticSegments.length; depth > 0; depth--) {
    const dir = staticSegments.slice(0, depth).join('/');

    if (existsSync(join(workspaceRoot, dir, 'package.json'))) {
      return { workspace: dir, pattern: segments.slice(depth).join('/') };
    }
  }

  return { workspace: '.', pattern: glob };
}

export function planKnipConfig(workspaceRoot: string, entryPoints: string[] = []): KnipConfigPlan {
  const globs = entryPoints
    .map((glob) => glob.trim().replace(/\\/g, '/').replace(/^\.\//, ''))
    .filter(Boolean);

  if (globs.length === 0) {
    return { args: [], warnings: [] };
  }

  const existing = findProjectKnipConfig(workspaceRoot);

  if (existing) {
    return {
      args: [],
      warnings: [
        `The deadweight.entryPoints setting was not passed to knip because this project has its own knip config (${existing}). Add the entry points to its "entry" list instead.`,
      ],
    };
  }

  const workspaces: Record<string, { entry: string[] }> = {};

  for (const glob of globs) {
    const { workspace, pattern } = workspaceForGlob(workspaceRoot, glob);
    workspaces[workspace] ??= { entry: [...KNIP_DEFAULT_ENTRY] };
    workspaces[workspace].entry.push(pattern);
  }

  return {
    // Hints would point at the generated file, which the user never sees.
    args: ['--config', GENERATED_KNIP_CONFIG, '--no-config-hints'],
    config: { workspaces },
    warnings: [],
  };
}

// Writes the generated config (if any), runs `task` with the extra knip arguments,
// and removes the config again.
export async function withKnipConfig<T>(
  workspaceRoot: string,
  entryPoints: string[] | undefined,
  task: (args: string[]) => Promise<T>,
): Promise<{ result: T; warnings: string[] }> {
  const plan = planKnipConfig(workspaceRoot, entryPoints);

  if (!plan.config) {
    return { result: await task(plan.args), warnings: plan.warnings };
  }

  const configPath = join(workspaceRoot, GENERATED_KNIP_CONFIG);

  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(plan.config, null, 2));

  try {
    return { result: await task(plan.args), warnings: plan.warnings };
  } finally {
    await rm(configPath, { force: true });
  }
}

interface KnipIssueItem {
  name: string;
  line?: number;
  col?: number;
}

// One row per file in knip's JSON reporter output: `{ issues: KnipIssueRow[] }`.
interface KnipIssueRow {
  file: string;
  files?: KnipIssueItem[];
  dependencies?: KnipIssueItem[];
  devDependencies?: KnipIssueItem[];
  unresolved?: KnipIssueItem[];
  exports?: KnipIssueItem[];
  types?: KnipIssueItem[];
}

export interface ParsedKnipOutput {
  findings: Finding[];
  // Files with imports knip could not resolve. Their workspaces get lower confidence.
  unresolvedFiles: string[];
}

export interface KnipScanResult extends ParsedKnipOutput {
  warnings: string[];
}

export function parseKnipOutput(stdout: string): ParsedKnipOutput {
  let parsed: unknown;

  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error('Knip returned invalid JSON output.');
  }

  const issues = (parsed as { issues?: unknown } | null)?.issues;

  if (!Array.isArray(issues)) {
    throw new Error(
      'Knip returned an unexpected JSON format. The knip version in use may be unsupported.',
    );
  }

  const findings: Finding[] = [];
  const unresolvedFiles: string[] = [];

  for (const row of issues as KnipIssueRow[]) {
    if (row.unresolved?.length) {
      unresolvedFiles.push(row.file);
    }

    if (row.files?.length) {
      findings.push({
        id: `file:${row.file}`,
        kind: 'file',
        name: row.file,
        confidence: 'medium',
        score: 0,
        reason: 'Knip reported this file as unused.',
      });
    }

    // Exported functions, classes, constants and types that nothing imports.
    const exportIssues = [
      ...(row.exports ?? []).map((item) => ({ item, type: false })),
      ...(row.types ?? []).map((item) => ({ item, type: true })),
    ];

    for (const { item, type } of exportIssues) {
      findings.push({
        id: `export:${row.file}:${item.name}`,
        kind: 'export',
        name: item.name,
        confidence: 'medium',
        score: 0,
        reason: type ? 'Knip reported this exported type as unused.' : 'Knip reported this export as unused.',
        file: row.file,
        line: item.line,
        column: item.col,
      });
    }

    // Dependency issues are reported against the package.json that declares them.
    const workspaceDir = posix.dirname(row.file);
    const workspace = workspaceDir === '.' ? undefined : workspaceDir;

    const packageIssues = [
      ...(row.dependencies ?? []).map((item) => ({ item, dev: false })),
      ...(row.devDependencies ?? []).map((item) => ({ item, dev: true })),
    ];

    for (const { item, dev } of packageIssues) {
      findings.push({
        id: `package:${row.file}:${item.name}`,
        kind: 'package',
        name: item.name,
        confidence: 'medium',
        score: 0,
        reason: dev
          ? 'Knip reported this development dependency as unused.'
          : 'Knip reported this package as unused.',
        workspace,
      });
    }
  }

  return { findings, unresolvedFiles };
}

export async function runKnip(
  workspaceRoot: string,
  { signal, entryPoints }: KnipOptions = {},
): Promise<KnipScanResult> {
  const { result, warnings } = await withKnipConfig(workspaceRoot, entryPoints, (args) =>
    runProcess('npx', [...KNIP_ARGS, ...args], {
      cwd: workspaceRoot,
      signal,
      env: KNIP_ENV,
    }),
  );
  const { code, stdout, stderr } = result;

  // Knip exits 0 when clean and 1 when it found issues; anything else is a crash.
  if ((code !== 0 && code !== 1) || !stdout.trim()) {
    throw new Error(
      stderr.trim() || `Knip exited with code ${code ?? 'unknown'}.`,
    );
  }

  return {
    ...parseKnipOutput(stdout),
    warnings: [...warnings, ...(stderr.trim() ? [stderr.trim()] : [])],
  };
}
