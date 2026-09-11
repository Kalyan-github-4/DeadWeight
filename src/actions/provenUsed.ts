import type { Finding } from '../types';

// Findings whose removal broke a verified check. They're in use, whatever static
// analysis says, so later scans keep them at the bottom of the score and unchecked.

export const PROVEN_USED_KEY = 'deadweight.provenUsed';

export const PROVEN_USED_SCORE = 1;

export interface ProvenUsedRecord {
  reason: string;     // e.g. "Removing it broke the build (npm run build)"
  at: string;         // ISO date
}

export type ProvenUsedStore = Record<string, ProvenUsedRecord>;

export function withProvenUsed(
  store: ProvenUsedStore,
  findings: Finding[],
  reason: string,
  at = new Date(),
): ProvenUsedStore {
  const next = { ...store };

  for (const finding of findings) {
    next[finding.id] = { reason, at: at.toISOString() };
  }

  return next;
}

export function applyProvenUsed(findings: Finding[], store: ProvenUsedStore): Finding[] {
  return findings.map((finding) => {
    const record = store[finding.id];

    if (!record) {
      return finding;
    }

    const date = record.at.slice(0, 10);

    return {
      ...finding,
      confidence: 'low',
      score: PROVEN_USED_SCORE,
      reason: `${record.reason} on ${date}, so it's in use. ${finding.reason}`,
    };
  });
}
