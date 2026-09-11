// Deadweight PR guard: a GitHub Action (see action.yml) that comments on pull
// requests which add unused packages, files or exports. Bundled to
// dist/action/index.js. No dependencies: GitHub's workflow commands and REST API
// are used directly.

import { appendFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, resolve } from 'node:path';
import { runProcess } from '../engine/exec';
import type { AdvisoryFetcher } from '../engine/footprint';
import { scanFolder, type ScanEngines } from '../engine/scan';
import type { Finding, ScanResult } from '../types';
import { annotation, COMMENT_MARKER, diffFindings, renderReport, shouldFail, summarize, type FailOn, type FindingDiff } from './report';

type Env = Record<string, string | undefined>;

export interface BaseCheckout {
  dir: string;
  cleanup: () => Promise<void>;
}

export interface RunOptions {
  env: Env;
  engines?: ScanEngines;                                   // tests: local knip/depcheck
  fetchAdvisories?: AdvisoryFetcher | false;
  checkoutBase?: (repoDir: string, sha: string) => Promise<BaseCheckout>;
  fetch?: typeof fetch;                                    // tests: fake GitHub API
  write?: (line: string) => void;                          // stdout (logs and workflow commands)
}

export interface RunResult {
  diff: FindingDiff;
  report: string;
  failed: boolean;
}

// Action inputs arrive as INPUT_<NAME> environment variables (name upper-cased).
function input(env: Env, name: string, fallback = ''): string {
  return (env[`INPUT_${name.toUpperCase()}`] ?? '').trim() || fallback;
}

function listInput(env: Env, name: string): string[] {
  return input(env, name).split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

// Checks out the base commit next to the repo, without touching the PR checkout.
// actions/checkout fetches only the PR commit by default, so the base is fetched
// first when it's missing.
export async function checkoutBaseWithGit(repoDir: string, sha: string): Promise<BaseCheckout> {
  const git = (args: string[]) => runProcess('git', args, { cwd: repoDir });

  if ((await git(['cat-file', '-e', `${sha}^{commit}`])).code !== 0) {
    const fetched = await git(['fetch', '--no-tags', '--depth=1', 'origin', sha]);

    if (fetched.code !== 0) {
      throw new Error(`Couldn't fetch the base commit ${sha}: ${fetched.stderr.trim()}`);
    }
  }

  const dir = join(mkdtempSync(join(tmpdir(), 'deadweight-base-')), 'repo');
  const added = await git(['worktree', 'add', '--detach', dir, sha]);

  if (added.code !== 0) {
    throw new Error(`Couldn't check out the base commit ${sha}: ${added.stderr.trim()}`);
  }

  return {
    dir,
    cleanup: async () => {
      await git(['worktree', 'remove', '--force', dir]);
    },
  };
}

// --- GitHub REST API --------------------------------------------------------------------

async function upsertComment(
  { env, fetch: fetchImpl = fetch }: RunOptions,
  token: string,
  prNumber: number,
  body: string,
  onlyIfExists: boolean,
): Promise<'created' | 'updated' | 'skipped'> {
  const api = env.GITHUB_API_URL ?? 'https://api.github.com';
  const repo = env.GITHUB_REPOSITORY;

  if (!repo) {
    throw new Error('GITHUB_REPOSITORY is not set.');
  }

  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'deadweight-pr-guard',
    'content-type': 'application/json',
  };

  const call = async (method: string, path: string, payload?: unknown) => {
    const response = await fetchImpl(`${api}${path}`, { method, headers, body: payload ? JSON.stringify(payload) : undefined });

    if (!response.ok) {
      throw new Error(`GitHub API ${method} ${path} answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }

    return response.json() as Promise<unknown>;
  };

  // Our earlier comment on this PR, so each push updates it instead of adding one.
  let existing: { id: number } | undefined;

  for (let page = 1; page <= 10 && !existing; page++) {
    const comments = await call('GET', `/repos/${repo}/issues/${prNumber}/comments?per_page=100&page=${page}`) as { id: number; body?: string }[];
    existing = comments.find((comment) => comment.body?.includes(COMMENT_MARKER));

    if (comments.length < 100) {
      break;
    }
  }

  if (existing) {
    await call('PATCH', `/repos/${repo}/issues/comments/${existing.id}`, { body });
    return 'updated';
  }

  if (onlyIfExists) {
    return 'skipped';
  }

  await call('POST', `/repos/${repo}/issues/${prNumber}/comments`, { body });
  return 'created';
}

// --- Annotations ------------------------------------------------------------------------

// Where a finding lives, relative to the repo root, for inline annotations.
function locate(finding: Finding, projectDir: string, repoPrefix: string): { file: string; line?: number } {
  const inRepo = (path: string) => (repoPrefix ? posix.join(repoPrefix, path) : path);

  if (finding.kind === 'export') {
    return { file: inRepo(finding.file ?? ''), line: finding.line };
  }

  if (finding.kind === 'file') {
    return { file: inRepo(finding.name), line: 1 };
  }

  const manifest = posix.join(finding.workspace ?? '', 'package.json');
  let line: number | undefined;

  try {
    const index = readFileSync(join(projectDir, manifest), 'utf8').split(/\r?\n/).findIndex((text) => text.includes(JSON.stringify(finding.name)));
    line = index >= 0 ? index + 1 : undefined;
  } catch {
    // No line then; the annotation still points at the file.
  }

  return { file: inRepo(manifest), line };
}

// --- Run ----------------------------------------------------------------------------------

export async function run(options: RunOptions): Promise<RunResult> {
  const { env, engines, fetchAdvisories } = options;
  const write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));

  const repoDir = resolve(env.GITHUB_WORKSPACE ?? process.cwd());
  const relativePath = input(env, 'path', '.').replace(/\\/g, '/').replace(/^\.\/?/, '').replace(/\/$/, '');
  const projectDir = relativePath ? join(repoDir, relativePath) : repoDir;
  const failOnInput = input(env, 'fail-on', 'none');
  const failOn: FailOn = failOnInput === 'new' || failOnInput === 'new-high' ? failOnInput : 'none';
  const scanOptions = {
    engines,
    exclude: listInput(env, 'exclude'),
    entryPoints: listInput(env, 'entry-points'),
  };

  const event = env.GITHUB_EVENT_PATH
    ? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) as { pull_request?: { number: number; base: { sha: string } } }
    : {};
  const pullRequest = event.pull_request;

  const scan = async (dir: string, label: string, advisories: AdvisoryFetcher | false | undefined): Promise<ScanResult> => {
    write(`::group::Scanning ${label}`);

    try {
      return await scanFolder(dir, {
        ...scanOptions,
        fetchAdvisories: advisories,
        onProject: (project, index, total) => write(`Project ${index + 1}/${total}: ${project || '.'}`),
      });
    } finally {
      write('::endgroup::');
    }
  };

  const vulnerabilityLookup = input(env, 'check-vulnerabilities', 'true') === 'false' ? false : fetchAdvisories;
  const head = await scan(projectDir, pullRequest ? 'the pull request' : 'the project', vulnerabilityLookup);

  let diff: FindingDiff = { added: head.findings, removed: [], existing: [] };
  let compared = false;

  if (pullRequest) {
    const checkout = options.checkoutBase ?? checkoutBaseWithGit;

    try {
      const base = await checkout(repoDir, pullRequest.base.sha);

      try {
        // Only for comparing: no vulnerability lookup needed on the base.
        const baseResult = await scan(relativePath ? join(base.dir, relativePath) : base.dir, 'the base branch', false);
        diff = diffFindings(baseResult.findings, head.findings);
        compared = true;
      } finally {
        await base.cleanup();
      }
    } catch (error) {
      write(annotation('warning', `Couldn't scan the base branch, so every unused item is reported, not only new ones: ${(error as Error).message}`, { title: 'Deadweight' }));
    }
  }

  const runUrl = env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
    ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
    : undefined;
  const report = renderReport(diff, { compared, runUrl });

  // Inline warnings on the PR's diff for what it adds.
  for (const finding of diff.added) {
    const location = locate(finding, projectDir, relativePath);
    const what = finding.kind === 'package' ? `Unused package ${finding.name}` : finding.kind === 'export' ? `Unused export ${finding.name}` : 'Unused file';
    write(annotation(finding.confidence === 'high' ? 'warning' : 'notice', `${finding.reason} (safe-to-delete score ${finding.score})`, { ...location, title: `Deadweight: ${what}` }));
  }

  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, report.replace(COMMENT_MARKER, ''));
  }

  if (env.GITHUB_OUTPUT) {
    appendFileSync(env.GITHUB_OUTPUT, [
      `added=${diff.added.length}`,
      `removed=${diff.removed.length}`,
      `existing=${diff.existing.length}`,
      `vulnerabilities=${diff.added.reduce((sum, finding) => sum + (finding.footprint?.advisories.length ?? 0), 0)}`,
      '',
    ].join('\n'));
  }

  const token = input(env, 'github-token');

  if (pullRequest && input(env, 'comment', 'true') !== 'false' && token) {
    try {
      // A clean PR only gets a comment when there's an earlier one to update.
      const outcome = await upsertComment(options, token, pullRequest.number, report, diff.added.length === 0);
      write(`PR comment: ${outcome}`);
    } catch (error) {
      // Pull requests from forks get a read-only token; the summary still has the report.
      write(annotation('warning', `Couldn't comment on the pull request (${(error as Error).message}). The report is in the job summary.`, { title: 'Deadweight' }));
    }
  }

  const failed = shouldFail(diff, failOn);

  write(diff.added.length > 0
    ? `Deadweight: ${compared ? 'this pull request adds' : 'found'} ${summarize(diff.added)}.`
    : 'Deadweight: no new unused code.');

  if (failed) {
    write(`::error title=Deadweight::This pull request adds ${summarize(diff.added)} (fail-on: ${failOn}).`);
  }

  return { diff, report, failed };
}

// Entry point when GitHub runs the action (not when a test imports this file).
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  run({ env: process.env }).then(
    ({ failed }) => process.exit(failed ? 1 : 0),
    (error: unknown) => {
      process.stdout.write(`::error title=Deadweight::${(error as Error).message.replace(/\r?\n/g, '%0A')}\n`);
      process.exit(1);
    },
  );
}
