import ignore from 'ignore';
import type { Finding } from '../types';

// Tests a workspace-relative posix path (or a package name) against glob patterns
// in .gitignore syntax, e.g. `legacy/`, `**/*.stories.tsx`, `@types/*`.
export function createMatcher(patterns: string[]): (path: string) => boolean {
  const cleaned = patterns
    .map((pattern) => pattern.trim().replace(/\\/g, '/').replace(/^\.\//, ''))
    .filter(Boolean);

  if (cleaned.length === 0) {
    return () => false;
  }

  const rules = ignore().add(cleaned);

  return (path) => {
    try {
      return rules.ignores(path);
    } catch {
      // `ignore` throws on paths it considers invalid (absolute, `..`); treat as no match.
      return false;
    }
  };
}

export interface FindingFilter {
  exclude?: string[];         // leave matching files and packages out of the results
  entryPoints?: string[];     // files matching these are used by definition
}

// Only hides results. Excluded files are still read when looking for references,
// so excluding a file can never make something else look unused.
export function filterFindings(findings: Finding[], { exclude = [], entryPoints = [] }: FindingFilter): Finding[] {
  const isExcluded = createMatcher(exclude);
  const isEntryPoint = createMatcher(entryPoints);

  // Exports are matched by their file, so excluding a file hides its exports too.
  return findings.filter((finding) => {
    const path = finding.kind === 'export' ? finding.file ?? '' : finding.name;
    return !isExcluded(path) && !(finding.kind === 'file' && isEntryPoint(path));
  });
}
