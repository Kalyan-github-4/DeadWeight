import { describeAdvisories, formatBytes } from '../engine/footprint';
import type { Finding } from '../types';

// The PR guard's verdict: which unused code a pull request adds (compared with its
// base branch) and removes, rendered as one PR comment and a job summary.

export const COMMENT_MARKER = '<!-- deadweight-pr-guard -->';

export interface FindingDiff {
  added: Finding[];       // unused in the PR, not on the base branch
  removed: Finding[];     // unused on the base branch, gone in the PR
  existing: Finding[];    // unused in both
}

// Findings are matched by id: the path (or package.json and name, or file and
// export name), so a moved line or a changed score doesn't count as new.
export function diffFindings(base: Finding[], head: Finding[]): FindingDiff {
  const baseIds = new Set(base.map((finding) => finding.id));
  const headIds = new Set(head.map((finding) => finding.id));

  return {
    added: head.filter((finding) => !baseIds.has(finding.id)),
    removed: base.filter((finding) => !headIds.has(finding.id)),
    existing: head.filter((finding) => baseIds.has(finding.id)),
  };
}

export type FailOn = 'none' | 'new' | 'new-high';

export function shouldFail(diff: FindingDiff, failOn: FailOn): boolean {
  return failOn === 'new'
    ? diff.added.length > 0
    : failOn === 'new-high'
      ? diff.added.some((finding) => finding.confidence === 'high')
      : false;
}

const KIND: Record<Finding['kind'], { icon: string; one: string; many: string }> = {
  file: { icon: '📄', one: 'unused file', many: 'unused files' },
  package: { icon: '📦', one: 'unused package', many: 'unused packages' },
  export: { icon: '🔣', one: 'unused export', many: 'unused exports' },
};

const KIND_ORDER: Finding['kind'][] = ['package', 'file', 'export'];

function count(findings: Finding[], kind: Finding['kind']): string {
  const n = findings.filter((finding) => finding.kind === kind).length;
  return `${n} ${n === 1 ? KIND[kind].one : KIND[kind].many}`;
}

// "2 unused files, 1 unused package and 3 unused exports".
export function summarize(findings: Finding[]): string {
  const parts = KIND_ORDER
    .filter((kind) => findings.some((finding) => finding.kind === kind))
    .map((kind) => count(findings, kind));

  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

// Markdown table cells: no pipes or line breaks, and a length a reviewer will read.
function cell(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function itemLabel(finding: Finding): string {
  if (finding.kind === 'export') {
    return `\`${finding.name}\` in \`${finding.file}${finding.line ? `:${finding.line}` : ''}\``;
  }

  return finding.kind === 'package' && finding.workspace
    ? `\`${finding.name}\` (${finding.workspace})`
    : `\`${finding.name}\``;
}

function gainLabel(finding: Finding): string {
  const footprint = finding.footprint;

  if (!footprint || footprint.packages === 0) {
    return '';
  }

  const vulnerabilities = footprint.advisories.length > 0 ? ` · ⚠️ ${describeAdvisories(footprint.advisories)}` : '';
  return ` · ${formatBytes(footprint.bytes)}${vulnerabilities}`;
}

function table(findings: Finding[]): string {
  const rows = [...findings]
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.score - a.score)
    .map((finding) => `| ${KIND[finding.kind].icon} | ${itemLabel(finding)} | ${finding.score} ${finding.confidence} | ${cell(finding.reason)}${gainLabel(finding)} |`);

  return ['| | Unused | Score | Why |', '|---|---|---|---|', ...rows].join('\n');
}

export interface ReportOptions {
  compared: boolean;          // false when there was no base branch to compare with
  runUrl?: string;            // link to the workflow run
}

export function renderReport(diff: FindingDiff, { compared, runUrl }: ReportOptions): string {
  const lines = [COMMENT_MARKER, '### 💀 Deadweight', ''];

  if (!compared) {
    lines.push(
      diff.added.length > 0
        ? `**This project has ${summarize(diff.added)}.**`
        : '✅ **No unused packages, files or exports found.**',
    );
  } else if (diff.added.length > 0) {
    lines.push(`**This pull request adds ${summarize(diff.added)}.**`);
  } else {
    lines.push('✅ **This pull request adds no unused code.**');
  }

  if (diff.added.length > 0) {
    const vulnerable = diff.added.flatMap((finding) => finding.footprint?.advisories ?? []);

    if (vulnerable.length > 0) {
      lines.push('', `> [!WARNING]\n> The unused packages carry ${describeAdvisories(vulnerable)}. Removing them removes the risk.`);
    }

    lines.push('', table(diff.added));
  }

  if (diff.removed.length > 0) {
    lines.push('', `🎉 It also removes ${summarize(diff.removed)} that ${diff.removed.length === 1 ? 'was' : 'were'} already there.`);
  }

  if (compared && diff.existing.length > 0) {
    lines.push(
      '',
      `<details><summary>${summarize(diff.existing)} already on the base branch</summary>`,
      '',
      table(diff.existing),
      '',
      '</details>',
    );
  }

  lines.push(
    '',
    `<sub>Score = how safe it is to delete (0–100). Clean up safely with the [Deadweight VS Code extension](https://marketplace.visualstudio.com/items?itemName=kalyanmanna.deadweight): every removal is verified with your build and tests, and undoable.${runUrl ? ` · [Run details](${runUrl})` : ''}</sub>`,
  );

  return `${lines.join('\n')}\n`;
}

// A GitHub workflow command, e.g. a warning shown on a line of the PR diff.
// https://docs.github.com/actions/reference/workflow-commands-for-github-actions
export function annotation(
  level: 'warning' | 'notice',
  message: string,
  { file, line, title }: { file?: string; line?: number; title?: string },
): string {
  const escapeData = (text: string) => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  const escapeProperty = (text: string) => escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');
  const properties = [
    ...(file ? [`file=${escapeProperty(file)}`] : []),
    ...(line ? [`line=${line}`] : []),
    ...(title ? [`title=${escapeProperty(title)}`] : []),
  ];

  return `::${level}${properties.length > 0 ? ` ${properties.join(',')}` : ''}::${escapeData(message)}`;
}
