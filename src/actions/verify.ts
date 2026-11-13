import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import type { Finding } from '../types';
import { CancelledError, runProcess } from '../engine/exec';
import { findInstallRoot, selfAndAncestors, type PackageManager } from '../engine/packageManager';

// Verified removal: the project's own type check, build and tests run before and
// after a removal. A check that passed before and fails after means something
// removed was in use, so the removal is undone. Checks that already fail before
// the removal can't tell anything and are left out.

export interface VerifyCheck {
  id: string;               // stable across runs: `<project>#<script>`
  project: string;          // folder-relative dir the check runs in ('' is the folder)
  label: string;            // "build", "type check", "tests"
  command: string;
  args: string[];
}

export interface CheckResult {
  check: VerifyCheck;
  ok: boolean;
  timedOut: boolean;
  output: string;           // tail of stdout + stderr
  durationMs: number;
}

// Script names that type-check without emitting, in order of preference.
const TYPECHECK_SCRIPTS = ['typecheck', 'type-check', 'check-types', 'check:types', 'types:check', 'tsc'];

// Scripts that would never exit or can't prove anything.
const WATCH_SCRIPT = /(?:^|\s)(?:--watch|-w)(?:\s|$)|\bwatch\b/;
const PLACEHOLDER_TEST = /no test specified/i;

// Test runners go into single-run mode, and output stays free of color codes.
const CHECK_ENV = { CI: '1', FORCE_COLOR: '0', NO_COLOR: '1' };

const OUTPUT_TAIL_LINES = 40;

function readScripts(root: string, project: string): Record<string, string> {
  try {
    const manifest = JSON.parse(readFileSync(join(root, project, 'package.json'), 'utf8')) as { scripts?: unknown };
    const scripts = manifest.scripts && typeof manifest.scripts === 'object' ? manifest.scripts as Record<string, unknown> : {};

    return Object.fromEntries(
      Object.entries(scripts).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  } catch {
    return {};
  }
}

// The project dir whose checks cover `dir`: the nearest dir with a package.json, or
// for a monorepo workspace package, the monorepo root, whose scripts build and
// test every package.
export function projectForDir(root: string, dir: string): string {
  const nearest = selfAndAncestors(dir).find((candidate) => existsSync(join(root, candidate, 'package.json'))) ?? '';
  const installRoot = findInstallRoot(root, dir);
  const contains = installRoot === '' || nearest === installRoot || nearest.startsWith(`${installRoot}/`);

  return contains && existsSync(join(root, installRoot, 'package.json')) ? installRoot : nearest;
}

// Projects touched by removing `findings`, folder-relative.
export function affectedProjects(root: string, findings: Finding[]): string[] {
  const dirs = findings.map((finding) => {
    const path = finding.kind === 'package'
      ? posix.join(finding.workspace ?? '', 'package.json')
      : finding.kind === 'export' ? finding.file ?? '' : finding.name;
    const dir = posix.dirname(path);
    return dir === '.' ? '' : dir;
  });

  return [...new Set(dirs.map((dir) => projectForDir(root, dir)))].sort();
}

export function detectChecks(
  root: string,
  projects: string[],
  packageManagerFor: (project: string) => PackageManager,
): VerifyCheck[] {
  const checks: VerifyCheck[] = [];

  for (const project of projects) {
    const scripts = readScripts(root, project);
    const manager = packageManagerFor(project);
    const where = project ? ` (${project})` : '';

    const script = (name: string, label: string) => {
      checks.push({
        id: `${project}#${name}`,
        project,
        label: `${label}${where}`,
        command: manager,
        args: ['run', name],   // the same verb for npm, yarn, pnpm and bun
      });
    };

    const typecheck = TYPECHECK_SCRIPTS.find((name) => scripts[name] && !WATCH_SCRIPT.test(scripts[name]));
    const hasTypeScript = [project, ''].some((dir) => existsSync(join(root, dir, 'node_modules', 'typescript', 'package.json')));

    if (typecheck) {
      script(typecheck, 'Type check');
    } else if (existsSync(join(root, project, 'tsconfig.json')) && hasTypeScript) {
      // No script for it, but the project is TypeScript: the compiler catches imports
      // of removed files and packages. `--no` never downloads it.
      checks.push({
        id: `${project}#tsc`,
        project,
        label: `Type check${where}`,
        command: 'npx',
        args: ['--no', 'tsc', '--noEmit'],
      });
    }

    if (scripts.build && !WATCH_SCRIPT.test(scripts.build)) {
      script('build', 'Build');
    }

    if (scripts.test && !WATCH_SCRIPT.test(scripts.test) && !PLACEHOLDER_TEST.test(scripts.test)) {
      script('test', 'Tests');
    }
  }

  return checks;
}

export function describeCheck(check: VerifyCheck): string {
  return `${check.command} ${check.args.join(' ')}`;
}

function tail(text: string): string {
  return text.trim().split(/\r?\n/).slice(-OUTPUT_TAIL_LINES).join('\n');
}

export async function runCheck(
  root: string,
  check: VerifyCheck,
  { signal, timeoutMs }: { signal?: AbortSignal; timeoutMs: number },
): Promise<CheckResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const result = await runProcess(check.command, check.args, {
      cwd: join(root, check.project),
      signal: controller.signal,
      env: CHECK_ENV,
    });

    return {
      check,
      ok: result.code === 0,
      timedOut: false,
      output: tail(`${result.stdout}\n${result.stderr}`),
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    // The user's cancel propagates; our own timeout is a failed check.
    if (error instanceof CancelledError && !timedOut) {
      throw error;
    }

    return {
      check,
      ok: false,
      timedOut,
      output: timedOut ? `Timed out after ${Math.round(timeoutMs / 1000)} s.` : (error as Error).message,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Removed findings the failing output points at: a missing module named after a
// removed package, or an import of a removed file.
export function likelyCulprits(output: string, removed: Finding[]): Finding[] {
  return removed.filter((finding) => {
    if (finding.kind === 'package') {
      return new RegExp(`['"\`]${escapeRegExp(finding.name)}(?:/[^'"\`]*)?['"\`]|\\b${escapeRegExp(finding.name)}\\b(?=.*(?:not found|cannot find|can't resolve|could not resolve|failed to resolve))`, 'i')
        .test(output);
    }

    const path = finding.name;
    const withoutExtension = path.replace(/\.[^./]+$/, '');
    const base = posix.basename(withoutExtension);

    // Paths in output are relative to any dir, so match the tail: `old-cart`, `src/old-cart.js`.
    return [path, withoutExtension, base]
      .filter((token) => token.length >= 3)
      .some((token) => new RegExp(`(?:^|[\\s'"\`/\\\\(])${escapeRegExp(token)}(?:\\.[cm]?[jt]sx?)?(?:$|[\\s'"\`:),])`, 'm').test(output));
  });
}
