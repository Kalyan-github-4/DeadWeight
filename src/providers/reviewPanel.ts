import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { Finding } from '../types';

export interface ReviewPackageGroup {
  manifest: string;
  command: string;
  findings: Finding[];
}

export interface ReviewModel {
  packageGroups: ReviewPackageGroup[];
  files: Finding[];
  trashDir: string;
  hasUncommittedChanges: boolean | undefined;
}

type PanelMessage =
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'diff'; manifest: string };

let currentPanel: vscode.WebviewPanel | undefined;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function findingRows(findings: Finding[]): string {
  return findings
    .map((finding) => `
      <tr>
        <td class="name">${escapeHtml(finding.name)}</td>
        <td><span class="badge ${finding.confidence}">${finding.confidence} · ${finding.score}</span></td>
        <td class="reason">${escapeHtml(finding.reason)}</td>
      </tr>`)
    .join('');
}

function renderHtml(model: ReviewModel, nonce: string): string {
  const packageCount = model.packageGroups.reduce((sum, group) => sum + group.findings.length, 0);

  const dirtyBanner = model.hasUncommittedChanges
    ? `<div class="banner">You have uncommitted changes. Consider committing or stashing first, so this removal shows up as its own diff and is easy to review.</div>`
    : '';

  const packagesSection = model.packageGroups.length === 0 ? '' : `
    <h2>Uninstall ${packageCount} package${packageCount === 1 ? '' : 's'}</h2>
    ${model.packageGroups.map((group) => `
      <div class="group">
        <div class="group-header">
          <code>${escapeHtml(group.command)}</code>
          <span class="muted">in ${escapeHtml(group.manifest)}</span>
          <button class="secondary" data-diff="${escapeHtml(group.manifest)}">View package.json diff</button>
        </div>
        <table>${findingRows(group.findings)}</table>
      </div>`).join('')}
    <p class="muted">package.json and lockfiles are backed up first. Undo restores them and reinstalls the exact previous versions.</p>`;

  const filesSection = model.files.length === 0 ? '' : `
    <h2>Move ${model.files.length} file${model.files.length === 1 ? '' : 's'} to the trash</h2>
    <table>${findingRows(model.files)}</table>
    <p class="muted">Files move to <code>${escapeHtml(model.trashDir)}</code> with their paths preserved. Nothing is deleted.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Review &amp; Remove</title>
<style nonce="${nonce}">
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 0 20px 24px; max-width: 960px; }
  h1 { font-size: 1.4em; font-weight: 600; }
  h2 { font-size: 1.1em; font-weight: 600; margin-top: 28px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 4px 8px; border-top: 1px solid var(--vscode-panel-border); vertical-align: top; }
  td.name { font-family: var(--vscode-editor-font-family); white-space: nowrap; }
  td.reason { color: var(--vscode-descriptionForeground); }
  code { font-family: var(--vscode-editor-font-family); background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; }
  .muted { color: var(--vscode-descriptionForeground); }
  .group { margin-bottom: 16px; }
  .group-header { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 6px; }
  .badge { font-size: 0.85em; padding: 1px 6px; border-radius: 8px; border: 1px solid var(--vscode-panel-border); }
  .badge.high { color: var(--vscode-testing-iconPassed); }
  .badge.medium { color: var(--vscode-editorWarning-foreground); }
  .badge.low { color: var(--vscode-editorError-foreground); }
  .banner { margin: 16px 0; padding: 8px 12px; border-left: 3px solid var(--vscode-editorWarning-foreground); background: var(--vscode-inputValidation-warningBackground); }
  .actions { display: flex; gap: 8px; margin-top: 28px; }
  button { font-family: inherit; font-size: inherit; padding: 5px 14px; border: none; border-radius: 2px; cursor: pointer; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
</style>
</head>
<body>
  <h1>Review &amp; Remove</h1>
  ${dirtyBanner}
  ${packagesSection}
  ${filesSection}
  <div class="actions">
    <button id="confirm">Remove</button>
    <button id="cancel" class="secondary">Cancel</button>
  </div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  document.getElementById('confirm').addEventListener('click', () => vscode.postMessage({ type: 'confirm' }));
  document.getElementById('cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
  for (const button of document.querySelectorAll('[data-diff]')) {
    button.addEventListener('click', () => vscode.postMessage({ type: 'diff', manifest: button.dataset.diff }));
  }
</script>
</body>
</html>`;
}

// Resolves true only when the user clicks Remove; closing the panel cancels.
export function showReviewPanel(
  model: ReviewModel,
  onShowDiff: (manifest: string) => void,
): Promise<boolean> {
  currentPanel?.dispose();

  const panel = vscode.window.createWebviewPanel(
    'deadweight.review',
    'Deadweight: Review & Remove',
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [] },
  );

  currentPanel = panel;
  panel.webview.html = renderHtml(model, randomBytes(16).toString('hex'));

  return new Promise((resolve) => {
    let confirmed = false;

    panel.webview.onDidReceiveMessage((message: PanelMessage) => {
      switch (message.type) {
        case 'diff':
          onShowDiff(message.manifest);
          break;
        case 'confirm':
          confirmed = true;
          panel.dispose();
          break;
        case 'cancel':
          panel.dispose();
          break;
      }
    });

    panel.onDidDispose(() => {
      if (currentPanel === panel) {
        currentPanel = undefined;
      }

      resolve(confirmed);
    });
  });
}
