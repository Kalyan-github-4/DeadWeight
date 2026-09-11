import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanWorkspace } from '../../src/engine/scan';
import type { Confidence, Finding } from '../../src/types';
import { fixturesDir, localEngines } from './helpers';

// Release gate (PRD §9): zero false positives at high confidence on every fixture.

interface Expectations {
  unused: string[];                             // ground truth: really unused
  expectHigh: string[];                         // should be confidently flagged
  expectAtMost: Record<string, Confidence>;     // traps: if reported, no higher than this
}

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

const key = (finding: Finding) => `${finding.kind}:${finding.name}`;

const fixtures = readdirSync(fixturesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

describe.each(fixtures)('fixture %s', (name) => {
  const root = join(fixturesDir, name);
  const expected = JSON.parse(readFileSync(join(root, 'expected.json'), 'utf8')) as Expectations;

  it('has no false positives at high confidence and flags the known dead code', async () => {
    const result = await scanWorkspace(root, { engines: localEngines, fetchAdvisories: false });
    const byKey = new Map(result.findings.map((finding) => [key(finding), finding]));
    const summary = result.findings.map((f) => `${key(f)} [${f.confidence}] ${f.reason}`).join('\n');

    const falsePositives = result.findings
      .filter((finding) => finding.confidence === 'high' && !expected.unused.includes(key(finding)))
      .map(key);

    expect(falsePositives, summary).toEqual([]);

    for (const item of expected.expectHigh) {
      expect(byKey.get(item)?.confidence, `${item} should be high\n${summary}`).toBe('high');
    }

    for (const [item, ceiling] of Object.entries(expected.expectAtMost)) {
      const finding = byKey.get(item);

      if (finding) {
        expect(RANK[finding.confidence], `${item} must be at most ${ceiling}\n${summary}`)
          .toBeLessThanOrEqual(RANK[ceiling]);
      }
    }

    expect(result.scannedFileCount).toBeGreaterThan(0);
  });
});
