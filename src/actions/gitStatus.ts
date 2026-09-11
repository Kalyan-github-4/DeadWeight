import { isAbsolute, relative } from 'node:path';
import * as vscode from 'vscode';

// The slice of the built-in Git extension's API (`vscode.git`, API version 1) we use.
interface GitRepository {
  rootUri: vscode.Uri;
  state: {
    workingTreeChanges: unknown[];
    indexChanges: unknown[];
    mergeChanges: unknown[];
  };
}

interface GitExtension {
  getAPI(version: 1): { repositories: GitRepository[] };
}

function contains(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return !path.startsWith('..') && !isAbsolute(path);
}

// True/false when the folder is in a Git repository; undefined when Git isn't available.
export async function hasUncommittedChanges(folder: vscode.Uri): Promise<boolean | undefined> {
  try {
    const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');

    if (!extension) {
      return undefined;
    }

    const git = (extension.isActive ? extension.exports : await extension.activate()).getAPI(1);

    const repository = git.repositories
      .filter((repo) => contains(repo.rootUri.fsPath, folder.fsPath))
      .sort((a, b) => b.rootUri.fsPath.length - a.rootUri.fsPath.length)[0];

    if (!repository) {
      return undefined;
    }

    const { workingTreeChanges, indexChanges, mergeChanges } = repository.state;

    return workingTreeChanges.length + indexChanges.length + mergeChanges.length > 0;
  } catch {
    return undefined;
  }
}
