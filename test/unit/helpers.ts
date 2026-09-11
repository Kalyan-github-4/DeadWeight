import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDepcheckOutput } from '../../src/engine/depcheck';
import { KNIP_ENV, parseKnipOutput, withKnipConfig } from '../../src/engine/knip';
import type { ScanEngines } from '../../src/engine/scan';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

export const fixturesDir = join(projectRoot, 'fixtures');

// Creates a temporary directory holding `files` (relative path -> contents).
export function makeTempProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'deadweight-test-'));

  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }

  return root;
}

function runLocalBin(bin: string, args: string[], cwd: string) {
  const result = spawnSync(process.execPath, [join(projectRoot, 'node_modules', bin), ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...KNIP_ENV },
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

// Runs the knip and depcheck installed in this repo instead of `npx`, so tests
// work offline and against the exact versions in package-lock.json.
export const localEngines: ScanEngines = {
  runKnip: async (cwd, { entryPoints }) => {
    const { result, warnings } = await withKnipConfig(cwd, entryPoints, async (args) =>
      runLocalBin('knip/bin/knip.js', ['--reporter', 'json', ...args], cwd),
    );
    const { status, stdout, stderr } = result;

    if (status !== 0 && status !== 1) {
      throw new Error(`knip exited with ${status}: ${stderr}`);
    }

    return { ...parseKnipOutput(stdout), warnings };
  },
  runDepcheck: async (cwd) => {
    const { stdout } = runLocalBin(
      'depcheck/bin/depcheck.js',
      ['--json', '--skip-missing', '--ignore-patterns=.deadweight-trash'],
      cwd,
    );

    return { unused: parseDepcheckOutput(stdout), warnings: [] };
  },
};
