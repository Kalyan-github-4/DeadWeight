import * as vscode from 'vscode';

export const PREVIEW_SCHEME = 'deadweight-preview';

// Serves in-memory "after removal" documents for `vscode.diff`, so previews
// never touch the disk.
export class PreviewDocumentProvider implements vscode.TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();

  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();

  readonly onDidChange = this._onDidChange.event;

  set(path: string, content: string): vscode.Uri {
    const uri = vscode.Uri.from({ scheme: PREVIEW_SCHEME, path: `/${path}` });

    this.contents.set(uri.toString(), content);
    this._onDidChange.fire(uri);

    return uri;
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? '';
  }

  dispose() {
    this._onDidChange.dispose();
  }
}
