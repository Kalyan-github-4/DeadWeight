import * as vscode from 'vscode';
import type { Confidence, Finding } from '../types';

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

export class DeadweightTreeProvider
  implements vscode.TreeDataProvider<DeadweightTreeItem>
{
  private findings: Finding[] = [];

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

  setFindings(findings: Finding[]) {
    this.findings = findings;
    this.checked = new Set(
      findings
        .filter((finding) => finding.confidence === 'high' && isRemovable(finding))
        .map((finding) => finding.id),
    );
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
      if (this.findings.length === 0) {
        return [];
      }

      return GROUP_ORDER.map((kind) => {
        const findings = visible.filter((finding) => finding.kind === kind);
        const selected = findings.filter((finding) => this.checked.has(finding.id)).length;
        const hidden = this.findings.filter((finding) => finding.kind === kind).length - findings.length;

        const item = new DeadweightTreeItem(
          `${GROUP_LABELS[kind]} (${findings.length})`,
          vscode.TreeItemCollapsibleState.Expanded,
          { groupKind: kind },
        );

        const parts = [
          ...(findings.length > 0 && kind !== 'export' ? [`${selected} selected`] : []),
          ...(findings.length > 0 && kind === 'export' ? ['review by hand'] : []),
          ...(hidden > 0 ? [`${hidden} hidden below ${this.minimumConfidence}`] : []),
        ];

        item.description = parts.length > 0 ? parts.join(' · ') : undefined;

        return item;
      });
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
    node: { groupKind: FindingKind } | { finding: Finding; checked: boolean },
  ) {
    super(label, collapsibleState);

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

    this.description = [`${finding.confidence} · ${finding.score}`, location].filter(Boolean).join(' · ');
    this.tooltip = new vscode.MarkdownString()
      .appendMarkdown(`**Safe-to-delete score: ${finding.score}/100** (${finding.confidence} confidence)\n\n`)
      .appendText(finding.reason);

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
