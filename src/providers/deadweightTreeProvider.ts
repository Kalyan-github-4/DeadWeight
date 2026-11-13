import * as vscode from 'vscode';
import { applyProvenUsed, type ProvenUsedStore } from '../actions/provenUsed';
import { describeAdvisories, formatBytes, totalFootprint } from '../engine/footprint';
import { MALWARE_ADVICE, malwareOrigin } from '../engine/malware';
import type { Confidence, Finding, Footprint, MaliciousPackage } from '../types';

type FindingKind = Finding['kind'];

const GROUP_LABELS: Record<FindingKind, string> = {
  package: 'Unused Packages',
  file: 'Unused Files',
  export: 'Unused Exports',
};

const GROUP_ORDER: readonly FindingKind[] = ['package', 'file', 'export'];

const CONFIDENCE_COLOR: Record<Confidence, string> = {
  high: 'charts.green',
  medium: 'charts.yellow',
  low: 'charts.red',
};

// Exports are shown with their score but never removed automatically: deleting code
// inside a file is a change for a human to review.
const isRemovable = (finding: Finding) => finding.kind !== 'export';

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

// "1.4 MB · ⚠ 2 vulns" for a package (or a group total).
function footprintLabel(footprint: Footprint | undefined): string | undefined {
  if (!footprint || footprint.packages === 0) {
    return undefined;
  }

  const vulnerabilities = footprint.advisories.length;

  return [
    formatBytes(footprint.bytes),
    ...(vulnerabilities > 0 ? [`⚠ ${vulnerabilities} ${vulnerabilities === 1 ? 'vuln' : 'vulns'}`] : []),
  ].join(' · ');
}

function appendFootprint(tooltip: vscode.MarkdownString, footprint: Footprint) {
  const others = footprint.packages - 1;

  tooltip.appendMarkdown(
    `\n\n**Removing it frees ${formatBytes(footprint.bytes)}**` +
    (others > 0 ? ` (it and ${others} ${others === 1 ? 'dependency' : 'dependencies'} nothing else needs)` : ''),
  );

  if (footprint.advisories.length === 0) {
    return;
  }

  tooltip.appendMarkdown(` **and ${describeAdvisories(footprint.advisories)}:**\n`);

  for (const advisory of footprint.advisories) {
    const title = advisory.title.replace(/[[\]]/g, '');
    const link = /^https:\/\//.test(advisory.url) ? `[${title}](${advisory.url})` : title;
    tooltip.appendMarkdown(`\n- **${advisory.severity}** · \`${advisory.package}@${advisory.version}\` · ${link}`);
  }
}

export class DeadweightTreeProvider
  implements vscode.TreeDataProvider<DeadweightTreeItem>
{
  private findings: Finding[] = [];

  // Known malware among the installed packages. Shown, never removed automatically.
  private malware: MaliciousPackage[] = [];

  // Ids of checked findings. Only high confidence starts checked (PRD R3.2).
  private checked = new Set<string>();

  // Findings below this level stay in the result but aren't shown or removable (R3.5).
  private minimumConfidence: Confidence = 'low';

  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<DeadweightTreeItem | undefined | null | void>();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  get findingCount(): number {
    return this.getVisibleFindings().length;
  }

  get malwareCount(): number {
    return this.malware.length;
  }

  getVisibleFindings(): Finding[] {
    return this.findings.filter(
      (finding) => RANK[finding.confidence] >= RANK[this.minimumConfidence],
    );
  }

  setMinimumConfidence(level: Confidence) {
    if (level !== this.minimumConfidence) {
      this.minimumConfidence = level;
      this._onDidChangeTreeData.fire();
    }
  }

  setFindings(findings: Finding[], malware: MaliciousPackage[] = []) {
    this.findings = findings;
    this.malware = malware;
    this.checked = new Set(
      findings
        .filter((finding) => finding.confidence === 'high' && isRemovable(finding))
        .map((finding) => finding.id),
    );
    this._onDidChangeTreeData.fire();
  }

  // Demotes findings a failed verification proved to be in use, and unchecks them.
  markProvenUsed(store: ProvenUsedStore) {
    this.findings = applyProvenUsed(this.findings, store);

    for (const id of Object.keys(store)) {
      this.checked.delete(id);
    }

    this._onDidChangeTreeData.fire();
  }

  removeFindings(ids: Set<string>) {
    this.findings = this.findings.filter((finding) => !ids.has(finding.id));

    for (const id of ids) {
      this.checked.delete(id);
    }

    this._onDidChangeTreeData.fire();
  }

  setChecked(changes: readonly (readonly [DeadweightTreeItem, vscode.TreeItemCheckboxState])[]) {
    for (const [item, state] of changes) {
      if (!item.finding) {
        continue;
      }

      if (state === vscode.TreeItemCheckboxState.Checked) {
        this.checked.add(item.finding.id);
      } else {
        this.checked.delete(item.finding.id);
      }
    }

    // Refresh so the group descriptions show the new selection counts.
    this._onDidChangeTreeData.fire();
  }

  // Hidden findings are never removed, even if they were checked before the threshold changed.
  getCheckedFindings(): Finding[] {
    return this.getVisibleFindings().filter((finding) => isRemovable(finding) && this.checked.has(finding.id));
  }

  getTreeItem(element: DeadweightTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: DeadweightTreeItem): DeadweightTreeItem[] {
    const visible = this.getVisibleFindings();

    if (!element) {
      // An empty tree lets the view's welcome content (package.json `viewsWelcome`) show.
      // Findings hidden by the threshold still render the groups, so the view never
      // claims "No deadweight found" while there is some.
      if (this.findings.length === 0 && this.malware.length === 0) {
        return [];
      }

      const malwareGroup = this.malware.length > 0
        ? [new DeadweightTreeItem(
          `Malicious Packages (${this.malware.length})`,
          vscode.TreeItemCollapsibleState.Expanded,
          { malwareGroup: true },
        )]
        : [];

      return [...malwareGroup, ...GROUP_ORDER.map((kind) => {
        const findings = visible.filter((finding) => finding.kind === kind);
        const selected = findings.filter((finding) => this.checked.has(finding.id)).length;
        const hidden = this.findings.filter((finding) => finding.kind === kind).length - findings.length;

        const item = new DeadweightTreeItem(
          `${GROUP_LABELS[kind]} (${findings.length})`,
          vscode.TreeItemCollapsibleState.Expanded,
          { groupKind: kind },
        );

        const groupFootprint = kind === 'package' ? footprintLabel(totalFootprint(findings)) : undefined;

        const parts = [
          ...(findings.length > 0 && kind !== 'export' ? [`${selected} selected`] : []),
          ...(groupFootprint ? [groupFootprint] : []),
          ...(findings.length > 0 && kind === 'export' ? ['review by hand'] : []),
          ...(hidden > 0 ? [`${hidden} hidden below ${this.minimumConfidence}`] : []),
        ];

        item.description = parts.length > 0 ? parts.join(' · ') : undefined;

        return item;
      })];
    }

    if (element.contextValue === 'malwareGroup') {
      return this.malware.map((malware) => new DeadweightTreeItem(
        `${malware.name}@${malware.version}`,
        vscode.TreeItemCollapsibleState.None,
        { malware },
      ));
    }

    if (element.groupKind) {
      return visible
        .filter((finding) => finding.kind === element.groupKind)
        .map((finding) => new DeadweightTreeItem(
          finding.name,
          vscode.TreeItemCollapsibleState.None,
          { finding, checked: this.checked.has(finding.id) },
        ));
    }

    return [];
  }

  dispose() {
    this._onDidChangeTreeData.dispose();
  }
}

export class DeadweightTreeItem extends vscode.TreeItem {
  readonly groupKind?: FindingKind;
  readonly finding?: Finding;

  constructor(
    public readonly label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    node: { groupKind: FindingKind } | { finding: Finding; checked: boolean } | { malwareGroup: true } | { malware: MaliciousPackage },
  ) {
    super(label, collapsibleState);

    if ('malwareGroup' in node) {
      this.id = 'group:malware';
      this.contextValue = 'malwareGroup';
      this.description = 'known malware · remove by hand';
      this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('errorForeground'));
      return;
    }

    if ('malware' in node) {
      const { malware } = node;

      this.id = `malware:${malware.project ?? ''}:${malware.name}@${malware.version}`;
      this.contextValue = 'malware';
      this.description = [malwareOrigin(malware), malware.project].filter(Boolean).join(' · ');
      this.iconPath = new vscode.ThemeIcon('bug', new vscode.ThemeColor('errorForeground'));
      this.tooltip = new vscode.MarkdownString()
        .appendMarkdown(`**Known malware: \`${malware.name}@${malware.version}\`** (${malwareOrigin(malware)})\n`);

      for (const report of malware.reports) {
        const title = report.title.replace(/[[\]]/g, '');
        const link = /^https:\/\//.test(report.url) ? `[${title}](${report.url})` : title;
        this.tooltip.appendMarkdown(`\n- ${link} · ${report.id}`);
      }

      this.tooltip.appendMarkdown('\n\n').appendText(MALWARE_ADVICE);
      return;
    }

    if ('groupKind' in node) {
      this.groupKind = node.groupKind;
      this.id = `group:${node.groupKind}`;
      this.contextValue = 'group';
      return;
    }

    const { finding } = node;

    this.finding = finding;
    this.id = finding.id;
    this.contextValue = 'finding';

    if (isRemovable(finding)) {
      this.checkboxState = node.checked
        ? vscode.TreeItemCheckboxState.Checked
        : vscode.TreeItemCheckboxState.Unchecked;
    }

    const location = finding.kind === 'export'
      ? `${finding.file}${finding.line ? `:${finding.line}` : ''}`
      : finding.workspace;

    this.description = [`${finding.confidence} · ${finding.score}`, footprintLabel(finding.footprint), location]
      .filter(Boolean)
      .join(' · ');
    this.tooltip = new vscode.MarkdownString()
      .appendMarkdown(`**Safe-to-delete score: ${finding.score}/100** (${finding.confidence} confidence)\n\n`)
      .appendText(finding.reason);

    if (finding.footprint && finding.footprint.packages > 0) {
      appendFootprint(this.tooltip, finding.footprint);
    }

    if (finding.kind === 'export') {
      this.tooltip.appendMarkdown('\n\n_Deadweight never edits code: open it and delete by hand if you agree._');
    }

    this.command = {
      command: 'deadweight.openFinding',
      title: 'Open',
      arguments: [finding],
    };

    this.iconPath = new vscode.ThemeIcon(
      finding.kind === 'package' ? 'package' : finding.kind === 'export' ? 'symbol-function' : 'file',
      new vscode.ThemeColor(CONFIDENCE_COLOR[finding.confidence]),
    );
  }
}
