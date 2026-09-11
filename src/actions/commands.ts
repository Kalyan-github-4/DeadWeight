import { readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import * as vscode from 'vscode';
import type { Finding } from '../types';
import type { PackageManager } from '../engine/packageManager';
import { TRASH_DIR } from '../engine/project';
import type { PreviewDocumentProvider } from '../providers/previewDocumentProvider';
import { showReviewPanel } from '../providers/reviewPanel';
import { hasUncommittedChanges } from './gitStatus';
import { previewManifestAfterRemoval } from './manifest';
import {
  executeRemoval,
  findChangedManifests,
  listSnapshots,
  planRemoval,
  restoreSnapshot,
  uninstallCommand,
  type SnapshotRecord,
} from './trash';

export interface RemovalContext {
  folder: vscode.WorkspaceFolder;
  output: vscode.OutputChannel;
  previews: PreviewDocumentProvider;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function logErrors(output: vscode.OutputChannel, heading: string, errors: string[]) {
  output.appendLine(`[${new Date().toLocaleString()}] ${heading}`);

  for (const error of errors) {
    output.appendLine(`  ${error.replace(/\n/g, '\n    ')}`);
  }
}

export async function openFinding(folder: vscode.WorkspaceFolder, finding: Finding) {
  if (finding.kind === 'export' && finding.file) {
    const position = new vscode.Position(Math.max((finding.line ?? 1) - 1, 0), Math.max((finding.column ?? 1) - 1, 0));
    const end = position.translate(0, finding.name === 'default' ? 0 : finding.name.length);

    await vscode.window.showTextDocument(vscode.Uri.joinPath(folder.uri, finding.file), {
      selection: new vscode.Range(position, end),
    });
    return;
  }

  if (finding.kind === 'file') {
    await vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.joinPath(folder.uri, finding.name),
    );
    return;
  }

  // For a package, open the package.json that declares it, at its entry.
  const manifest = vscode.Uri.joinPath(
    folder.uri,
    posix.join(finding.workspace ?? '', 'package.json'),
  );
  const document = await vscode.workspace.openTextDocument(manifest);
  const line = document
    .getText()
    .split(/\r?\n/)
    .findIndex((text) => text.includes(JSON.stringify(finding.name)));
  const position = new vscode.Position(Math.max(line, 0), 0);

  await vscode.window.showTextDocument(document, {
    selection: new vscode.Range(position, position),
  });
}

export interface RemovalCallbacks {
  onRemoved: (ids: Set<string>) => void;
  onUndo: (record: SnapshotRecord) => void;
}

// Returns once the removal is done. The Undo notification is not awaited, since it
// can stay open indefinitely; clicking it calls `onUndo`.
export async function reviewAndRemove(
  context: RemovalContext,
  selected: Finding[],
  packageManager: PackageManager,
  { onRemoved, onUndo }: RemovalCallbacks,
): Promise<void> {
  const { folder, output, previews } = context;
  const root = folder.uri.fsPath;

  if (selected.length === 0) {
    vscode.window.showInformationMessage(
      'Deadweight: Check the findings you want to remove first.',
    );
    return;
  }

  const plan = planRemoval(selected, packageManager);
  const previewUris = new Map<string, vscode.Uri>();

  try {
    for (const { manifest, names } of plan.packages) {
      const text = await readFile(join(root, manifest), 'utf8');
      previewUris.set(manifest, previews.set(manifest, previewManifestAfterRemoval(text, names)));
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Deadweight: Couldn't read package.json to build the preview: ${(error as Error).message}`,
    );
    return;
  }

  const confirmed = await showReviewPanel(
    {
      packageGroups: plan.packages.map(({ manifest, names }) => {
        const { command, args } = uninstallCommand(packageManager, names);
        return {
          manifest,
          command: `${command} ${args.join(' ')}`,
          findings: selected.filter(
            (f) => f.kind === 'package' && posix.join(f.workspace ?? '', 'package.json') === manifest,
          ),
        };
      }),
      files: selected.filter((finding) => finding.kind === 'file'),
      trashDir: `${TRASH_DIR}/<timestamp>/`,
      hasUncommittedChanges: await hasUncommittedChanges(folder.uri),
    },
    (manifest) => {
      const previewUri = previewUris.get(manifest);

      // The webview can only ask for manifests that are part of this plan.
      if (!previewUri) {
        return;
      }

      vscode.commands.executeCommand(
        'vscode.diff',
        vscode.Uri.joinPath(folder.uri, manifest),
        previewUri,
        `${manifest} ↔ after removal`,
        { viewColumn: vscode.ViewColumn.Beside, preview: true },
      );
    },
  );

  if (!confirmed) {
    return;
  }

  const { record, errors } = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Deadweight: Removing...',
    },
    () => executeRemoval(root, plan),
  );

  const removedPackages = new Set(
    record.packages.flatMap(({ manifest, names }) => names.map((name) => `${manifest}:${name}`)),
  );
  const removedFiles = new Set(record.files);

  const removedIds = new Set(
    selected
      .filter((finding) =>
        finding.kind === 'file'
          ? removedFiles.has(finding.name)
          : removedPackages.has(`${posix.join(finding.workspace ?? '', 'package.json')}:${finding.name}`),
      )
      .map((finding) => finding.id),
  );

  onRemoved(removedIds);

  const packageCount = record.packages.reduce((sum, group) => sum + group.names.length, 0);
  const summary = `Deadweight: Uninstalled ${plural(packageCount, 'package')} and moved ${plural(record.files.length, 'file')} to ${TRASH_DIR}.`;

  const undo = 'Undo';
  const showDetails = 'Show Details';

  const handleChoice = (choice: string | undefined) => {
    if (choice === showDetails) {
      output.show();
    } else if (choice === undo) {
      onUndo(record);
    }
  };

  if (errors.length > 0) {
    logErrors(output, 'Removal finished with errors:', errors);
    vscode.window
      .showWarningMessage(`${summary} ${plural(errors.length, 'step')} failed.`, showDetails, undo)
      .then(handleChoice);
  } else if (removedIds.size > 0) {
    vscode.window.showInformationMessage(summary, undo).then(handleChoice);
  }
}

export async function restoreRecord(context: RemovalContext, record: SnapshotRecord) {
  const { folder, output } = context;
  const root = folder.uri.fsPath;

  const changed = await findChangedManifests(root, record);

  if (changed.length > 0) {
    const overwrite = 'Restore Anyway';
    const choice = await vscode.window.showWarningMessage(
      `Deadweight: ${changed.join(', ')} changed since the removal. Restoring puts back the backed-up version and overwrites those changes.`,
      { modal: true },
      overwrite,
    );

    if (choice !== overwrite) {
      return;
    }
  }

  const outcome = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Deadweight: Restoring...',
    },
    () => restoreSnapshot(root, record),
  );

  const parts = [`restored ${plural(outcome.restoredFiles.length, 'file')}`];

  if (outcome.reinstalled) {
    const count = record.packages.reduce((sum, group) => sum + group.names.length, 0);
    parts.push(`reinstalled ${plural(count, 'package')}`);
  }

  if (outcome.conflicts.length > 0) {
    logErrors(output, 'Files left in the trash because a file already exists at their path:', outcome.conflicts);
  }

  if (outcome.errors.length > 0) {
    logErrors(output, 'Restore finished with errors:', outcome.errors);
  }

  const problems = outcome.conflicts.length + outcome.errors.length;
  const message = `Deadweight: ${parts.join(' and ')}.`;
  const scanAgain = 'Scan Again';
  const showDetails = 'Show Details';

  // Not awaited: "Scan Again" must run after this restore has released its lock.
  const notification = problems > 0
    ? vscode.window.showWarningMessage(
      `${message} ${plural(problems, 'item')} need attention.`,
      showDetails,
    )
    : vscode.window.showInformationMessage(message, scanAgain);

  notification.then((choice) => {
    if (choice === showDetails) {
      output.show();
    } else if (choice === scanAgain) {
      vscode.commands.executeCommand('deadweight.scan');
    }
  });
}

export async function restoreFromTrash(context: RemovalContext) {
  const snapshots = await listSnapshots(context.folder.uri.fsPath);

  if (snapshots.length === 0) {
    vscode.window.showInformationMessage('Deadweight: The trash is empty.');
    return;
  }

  const picked = await vscode.window.showQuickPick(
    snapshots.map((record) => {
      const names = [
        ...record.packages.flatMap((group) => group.names),
        ...record.files,
      ];
      const packageCount = record.packages.reduce((sum, group) => sum + group.names.length, 0);

      return {
        label: new Date(record.createdAt).toLocaleString(),
        description: `${plural(packageCount, 'package')}, ${plural(record.files.length, 'file')}`,
        detail: names.slice(0, 6).join(', ') + (names.length > 6 ? ', ...' : ''),
        record,
      };
    }),
    { placeHolder: 'Choose a removal to restore (newest first)' },
  );

  if (picked) {
    await restoreRecord(context, picked.record);
  }
}
