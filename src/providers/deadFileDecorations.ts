import * as vscode from 'vscode';
import type { Finding } from '../types';

// PRD R3.4: flagged files are dimmed in the explorer and tabs, and get a gutter
// marker plus a short note on their first line when open in an editor.

function key(uri: vscode.Uri): string {
  return process.platform === 'win32' ? uri.fsPath.toLowerCase() : uri.fsPath;
}

export class DeadFileDecorations implements vscode.FileDecorationProvider, vscode.Disposable {
  private flagged = new Map<string, Finding>();
  private exportsByFile = new Map<string, Finding[]>();

  private readonly _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri[]>();

  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  private readonly editorDecoration: vscode.TextEditorDecorationType;

  private readonly disposables: vscode.Disposable[] = [];

  constructor(extensionUri: vscode.Uri) {
    this.editorDecoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.joinPath(extensionUri, 'resources', 'unused-file.svg'),
      gutterIconSize: 'contain',
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.infoForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      after: {
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
        margin: '0 0 0 2em',
      },
    });

    this.disposables.push(
      this.editorDecoration,
      this._onDidChangeFileDecorations,
      vscode.window.onDidChangeVisibleTextEditors(() => this.decorateEditors()),
    );
  }

  // Replaces the flagged set with the file findings in `findings`.
  update(folder: vscode.WorkspaceFolder, findings: Finding[]) {
    const previous = [...this.flagged.values()].map((finding) => vscode.Uri.joinPath(folder.uri, finding.name));

    this.flagged = new Map(
      findings
        .filter((finding) => finding.kind === 'file')
        .map((finding) => [key(vscode.Uri.joinPath(folder.uri, finding.name)), finding]),
    );

    this.exportsByFile = new Map();

    for (const finding of findings.filter((f) => f.kind === 'export' && f.file && f.line)) {
      const fileKey = key(vscode.Uri.joinPath(folder.uri, finding.file!));
      this.exportsByFile.set(fileKey, [...(this.exportsByFile.get(fileKey) ?? []), finding]);
    }

    const current = [...this.flagged.values()].map((finding) => vscode.Uri.joinPath(folder.uri, finding.name));

    this._onDidChangeFileDecorations.fire([...previous, ...current]);
    this.decorateEditors();
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const finding = this.flagged.get(key(uri));

    if (!finding) {
      return undefined;
    }

    return {
      badge: '∅',
      tooltip: `Deadweight: unused file (${finding.confidence} confidence)`,
      color: new vscode.ThemeColor('disabledForeground'),
    };
  }

  private decorateEditors() {
    for (const editor of vscode.window.visibleTextEditors) {
      const finding = this.flagged.get(key(editor.document.uri));
      const unusedExports = this.exportsByFile.get(key(editor.document.uri)) ?? [];

      if (!finding) {
        // Unused exports: a note at the end of each declaration's line.
        editor.setDecorations(this.editorDecoration, unusedExports
          .filter((f) => f.line! <= editor.document.lineCount)
          .map((f) => {
            const line = editor.document.lineAt(f.line! - 1).range;
            const label = `Deadweight: unused export · ${f.confidence} ${f.score}`;

            return {
              range: new vscode.Range(line.end, line.end),
              hoverMessage: new vscode.MarkdownString()
                .appendMarkdown(`**${label}**\n\n`)
                .appendText(f.reason),
              renderOptions: { after: { contentText: label } },
            };
          }));
        continue;
      }

      const firstLine = editor.document.lineAt(0).range;
      const hover = new vscode.MarkdownString()
        .appendMarkdown(`**Deadweight: unused file (${finding.confidence} confidence)**\n\n`)
        .appendText(finding.reason);

      editor.setDecorations(this.editorDecoration, [{
        range: new vscode.Range(firstLine.end, firstLine.end),
        hoverMessage: hover,
        renderOptions: {
          after: { contentText: `Deadweight: unused file · ${finding.confidence} ${finding.score}` },
        },
      }]);
    }
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
