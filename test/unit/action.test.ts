import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../../src/action/main';
import { annotation, COMMENT_MARKER, diffFindings, renderReport, shouldFail, summarize } from '../../src/action/report';
import type { Finding } from '../../src/types';
import { localEngines, makeTempProject } from './helpers';

function finding(id: string, overrides: Partial<Finding> = {}): Finding {
  const [kind, ...rest] = id.split(':') as [Finding['kind'], ...string[]];
  return { id, kind, name: rest.at(-1)!, confidence: 'high', score: 92, reason: 'Nothing imports this file.', ...overrides };
}

describe('diffFindings', () => {
  it('splits into added, removed and existing by id', () => {
    const base = [finding('file:src/a.js'), finding('file:src/b.js')];
    const head = [finding('file:src/b.js', { score: 50 }), finding('file:src/c.js')];

    const diff = diffFindings(base, head);

    expect(diff.added.map((f) => f.id)).toEqual(['file:src/c.js']);
    expect(diff.removed.map((f) => f.id)).toEqual(['file:src/a.js']);
    expect(diff.existing.map((f) => f.id)).toEqual(['file:src/b.js']);
  });
});

describe('renderReport', () => {
  const added = [
    finding('package:package.json:left-pad', { reason: 'No import found | anywhere', footprint: { packages: 1, bytes: 12_288, advisories: [{ package: 'left-pad', version: '1.0.0', severity: 'high', title: 't', url: '' }] } }),
    finding('file:src/old-cart.js', { confidence: 'medium', score: 61 }),
    finding('export:src/utils.ts:formatMoney', { file: 'src/utils.ts', line: 12 }),
  ];

  it('leads with what the PR adds, warns about vulnerabilities and escapes table cells', () => {
    const report = renderReport({ added, removed: [finding('file:src/legacy.js')], existing: [] }, { compared: true, runUrl: 'https://github.com/o/r/actions/runs/1' });

    expect(report.startsWith(COMMENT_MARKER)).toBe(true);
    expect(report).toContain('**This pull request adds 1 unused package, 1 unused file and 1 unused export.**');
    expect(report).toContain('> The unused packages carry 1 known vulnerability (1 high).');
    expect(report).toContain('| 📦 | `left-pad` | 92 high | No import found \\| anywhere · 12 KB · ⚠️ 1 known vulnerability (1 high) |');
    expect(report).toContain('| 🔣 | `formatMoney` in `src/utils.ts:12` | 92 high |');
    expect(report).toContain('🎉 It also removes 1 unused file that was already there.');
    expect(report).toContain('[Run details](https://github.com/o/r/actions/runs/1)');
  });

  it('says so when the PR is clean, and folds existing findings away', () => {
    const report = renderReport({ added: [], removed: [], existing: [finding('file:src/b.js')] }, { compared: true });

    expect(report).toContain('✅ **This pull request adds no unused code.**');
    expect(report).toContain('<details><summary>1 unused file already on the base branch</summary>');
  });
});

describe('shouldFail and summarize', () => {
  const medium = finding('file:src/x.js', { confidence: 'medium' });

  it('fails only as configured', () => {
    expect(shouldFail({ added: [medium], removed: [], existing: [] }, 'none')).toBe(false);
    expect(shouldFail({ added: [medium], removed: [], existing: [] }, 'new-high')).toBe(false);
    expect(shouldFail({ added: [medium], removed: [], existing: [] }, 'new')).toBe(true);
  });

  it('counts by kind', () => {
    expect(summarize([finding('file:a'), finding('file:b'), finding('package:package.json:x')])).toBe('1 unused package and 2 unused files');
  });
});

describe('annotation', () => {
  it('escapes workflow command properties and data', () => {
    expect(annotation('warning', 'line one\nline 2: 100%', { file: 'src/a,b.js', line: 3, title: 'Deadweight: Unused file' }))
      .toBe('::warning file=src/a%2Cb.js,line=3,title=Deadweight%3A Unused file::line one%0Aline 2: 100%25');
  });
});

// --- The whole action against real projects, with a fake GitHub API -----------------------

interface ApiCall {
  method: string;
  url: string;
  body?: { body: string };
}

function fakeGitHub(existingComments: { id: number; body: string }[]) {
  const calls: ApiCall[] = [];

  const fetch = (async (url: string, init?: { method?: string; body?: string }) => {
    const call: ApiCall = { method: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const json = call.method === 'GET' ? existingComments : { id: 1 };
    return { ok: true, status: 200, json: async () => json, text: async () => '' };
  }) as unknown as typeof globalThis.fetch;

  return { fetch, calls };
}

function baseProject() {
  return makeTempProject({
    'package.json': JSON.stringify({ name: 'shop', main: 'src/index.js', dependencies: { commander: '12' } }),
    'src/index.js': "const { program } = require('commander');\nprogram.parse();",
    'src/legacy.js': 'module.exports = 1;',
  });
}

function prProject() {
  return makeTempProject({
    'package.json': JSON.stringify({ name: 'shop', main: 'src/index.js', dependencies: { commander: '12', 'left-pad': '1' } }),
    'src/index.js': "const { program } = require('commander');\nprogram.parse();",
    'src/old-cart.js': 'module.exports = 2;',
  });
}

function actionEnv(workspace: string, inputs: Record<string, string>) {
  const scratch = makeTempProject({ 'event.json': JSON.stringify({ pull_request: { number: 7, base: { sha: 'abc123' } } }), 'summary.md': '', 'output.txt': '' });

  return {
    scratch,
    env: {
      GITHUB_WORKSPACE: workspace,
      GITHUB_EVENT_PATH: join(scratch, 'event.json'),
      GITHUB_STEP_SUMMARY: join(scratch, 'summary.md'),
      GITHUB_OUTPUT: join(scratch, 'output.txt'),
      GITHUB_REPOSITORY: 'kalyan/shop',
      GITHUB_API_URL: 'https://api.github.test',
      'INPUT_GITHUB-TOKEN': 'token',
      ...Object.fromEntries(Object.entries(inputs).map(([key, value]) => [`INPUT_${key.toUpperCase()}`, value])),
    },
  };
}

describe('PR guard action', () => {
  it('reports only what the pull request adds, comments once, annotates and fails as configured', async () => {
    const base = baseProject();
    const head = prProject();
    const { scratch, env } = actionEnv(head, { 'fail-on': 'new' });
    const github = fakeGitHub([]);
    const lines: string[] = [];

    const result = await run({
      env,
      engines: localEngines,
      fetchAdvisories: false,
      checkoutBase: async () => ({ dir: base, cleanup: async () => {} }),
      fetch: github.fetch,
      write: (line) => lines.push(line),
    });

    expect(result.diff.added.map((f) => f.id).sort()).toEqual(['file:src/old-cart.js', 'package:package.json:left-pad']);
    expect(result.diff.removed.map((f) => f.id)).toEqual(['file:src/legacy.js']);
    expect(result.failed).toBe(true);

    // One new comment, on PR #7.
    expect(github.calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'GET https://api.github.test/repos/kalyan/shop/issues/7/comments?per_page=100&page=1',
      'POST https://api.github.test/repos/kalyan/shop/issues/7/comments',
    ]);
    expect(github.calls[1].body!.body).toContain('**This pull request adds 1 unused package and 1 unused file.**');
    expect(github.calls[1].body!.body).toContain('🎉 It also removes 1 unused file that was already there.');

    // Inline annotations, outputs and the job summary.
    expect(lines).toContainEqual(expect.stringMatching(/^::(warning|notice) file=src\/old-cart\.js,line=1,title=Deadweight%3A Unused file::/));
    expect(lines).toContainEqual(expect.stringMatching(/^::(warning|notice) file=package\.json,line=1,title=Deadweight%3A Unused package left-pad::/));
    expect(lines).toContainEqual(expect.stringContaining('::error title=Deadweight::This pull request adds'));
    expect(readFileSync(join(scratch, 'output.txt'), 'utf8')).toContain('added=2\nremoved=1\nexisting=0\n');
    expect(readFileSync(join(scratch, 'summary.md'), 'utf8')).toContain('This pull request adds');
  });

  it('updates its earlier comment instead of adding another, and stays quiet on clean PRs', async () => {
    const base = baseProject();
    const options = (github: ReturnType<typeof fakeGitHub>) => ({
      env: actionEnv(base, {}).env,
      engines: localEngines,
      fetchAdvisories: false as const,
      checkoutBase: async () => ({ dir: base, cleanup: async () => {} }),
      fetch: github.fetch,
      write: () => {},
    });

    const withEarlier = fakeGitHub([{ id: 55, body: `${COMMENT_MARKER}\nold report` }]);
    const updated = await run(options(withEarlier));

    expect(updated.failed).toBe(false);
    expect(withEarlier.calls.map((call) => `${call.method} ${call.url}`)).toContain('PATCH https://api.github.test/repos/kalyan/shop/issues/comments/55');
    expect(withEarlier.calls.at(-1)!.body!.body).toContain('✅ **This pull request adds no unused code.**');

    const withoutEarlier = fakeGitHub([]);
    await run(options(withoutEarlier));
    expect(withoutEarlier.calls.map((call) => call.method)).toEqual(['GET']);
  });

  it('still reports when the base branch cannot be checked out', async () => {
    const head = prProject();
    const lines: string[] = [];

    const result = await run({
      env: { ...actionEnv(head, { comment: 'false' }).env },
      engines: localEngines,
      fetchAdvisories: false,
      checkoutBase: async () => {
        throw new Error('no base');
      },
      write: (line) => lines.push(line),
    });

    expect(result.diff.added.length).toBeGreaterThan(0);
    expect(lines).toContainEqual(expect.stringContaining("Couldn't scan the base branch"));
  });
});
