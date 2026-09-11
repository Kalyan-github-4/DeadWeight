import { readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import * as vscode from 'vscode';
import type { Finding } from '../types';
import { CancelledError } from '../engine/exec';
import { describeAdvisories, formatBytes, totalFootprint } from '../engine/footprint';
import type { PackageManager } from '../engine/packageManager';
import { TRASH_DIR } from '../engine/project';
import type { PreviewDocumentProvider } from '../providers/previewDocumentProvider';
import { showReviewPanel } from '../providers/reviewPanel';
import { hasUncommittedChanges } from './gitStatus';
import { previewManifestAfterRemoval } from './manifest';
import { PROVEN_USED_KEY, withProvenUsed, type ProvenUsedStore } from './provenUsed';
import {
  executeRemoval,
  findChangedManifests,
  listSnapshots,
  planRemoval,
  restoreSnapshot,
  uninstallCommand,
  type SnapshotRecord,
} from './trash';
import {
  affectedProjects,
  describeCheck,
  detectChecks,
  likelyCulprits,
  runCheck,
  type CheckResult,
  type VerifyCheck,
} from './verify';

export interface RemovalContext {
  folder: vscode.WorkspaceFolder;
  output: vscode.OutputChannel;
  previews: PreviewDocumentProvider;
  state: vscode.Memento;              // workspace state: check choices, proven-used findings
  verify: { enabled: boolean; timeoutMs: number };
}

// Check ids the user unticked in the review panel, remembered per workspace.
const DISABLED_CHECKS_KEY = 'deadweight.disabledChecks';

// Runs checks in order with a cancellable notification. Undefined when cancelled.
async function runChecks(
  root: string,
  checks: VerifyCheck[],
  title: string,
  { stopOnFailure, timeoutMs }: { stopOnFailure: boolean; timeoutMs: number },
): Promise<CheckResult[] | undefined> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title, cancellable: true },
    async (progress, token) => {
      const controller = new AbortController();
      const subscription = token.onCancellationRequested(() => controller.abort());
      const results: CheckResult[] = [];

      try {
        for (const [index, check] of checks.entries()) {
          progress.report({ message: `${index + 1}/${checks.length} · ${check.label}` });

          const result = await runCheck(root, check, { signal: controller.signal, timeoutMs });
          results.push(result);

          if (!result.ok && stopOnFailure) {
            break;
          }
        }

        return results;
      } catch (error) {
        if (error instanceof CancelledError) {
          return undefined;
        }

        throw error;
      } finally {
        subscription.dispose();
      }
    },
  );
}

function logCheck(output: vscode.OutputChannel, heading: string, result: CheckResult) {
  output.appendLine(`[${new Date().toLocaleString()}] ${heading}: ${result.check.label} (\`${describeCheck(result.check)}\`, ${Math.round(result.durationMs / 1000)} s)`);
  output.appendLine(`  ${result.output.replace(/\n/g, '\n  ')}`);
}

function joinLabels(results: CheckResult[]): string {
  const labels = results.map((result) => result.check.label.replace(/^\w/, (c) => c.toLowerCase()));
  return labels.length <= 1 ? labels.join('') : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
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
  // Findings a failed verification showed to be in use, already saved to state.
  onProvenUsed: (store: ProvenUsedStore) => void;
}

// A check that passed before the removal fails after it: put everything back, and
// remember what the error output points at as in use.
async function undoFailedVerification(
  context: RemovalContext,
  record: SnapshotRecord,
  failure: CheckResult,
  removed: Finding[],
  onProvenUsed: RemovalCallbacks['onProvenUsed'],
) {
  const { folder, output, state } = context;
  const command = describeCheck(failure.check);

  logCheck(output, failure.timedOut ? 'Timed out after the removal' : 'Failed after the removal', failure);

  const outcome = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Deadweight: Undoing the removal' },
    () => restoreSnapshot(folder.uri.fsPath, record),
  );

  const culprits = likelyCulprits(failure.output, removed);

  if (culprits.length > 0) {
    const reason = `Removing it broke ${failure.check.label.replace(/^\w/, (c) => c.toLowerCase())} (${command})`;
    const store = withProvenUsed(state.get<ProvenUsedStore>(PROVEN_USED_KEY, {}), culprits, reason);
    await state.update(PROVEN_USED_KEY, store);
    onProvenUsed(store);
  }

  const problems = outcome.conflicts.length + outcome.errors.length;

  if (problems > 0) {
    logErrors(output, 'Undo after the failed verification needs attention:', [
      ...outcome.errors,
      ...outcome.conflicts.map((file) => `${file} is still in the trash: a file exists at its path again.`),
    ]);
  }

  const cause = culprits.length > 0
    ? ` Likely cause: ${culprits.map((finding) => finding.name).join(', ')}, now marked as in use.`
    : ' The output didn\'t point at a specific item.';
  const what = failure.timedOut ? 'timed out' : 'failed';
  const undoState = problems > 0 ? ' Undo needs attention; see the output.' : '';

  const showOutput = 'Show Output';

  vscode.window
    .showErrorMessage(
      `Deadweight: ${failure.check.label} ${what} after the removal (${command}), so it was undone.${cause}${undoState}`,
      showOutput,
    )
    .then((choice) => {
      if (choice === showOutput) {
        output.show();
      }
    });
}

// Returns once the removal is done. The Undo notification is not awaited, since it
// can stay open indefinitely; clicking it calls `onUndo`.
// `packageManagerFor` picks the manager for each package.json, since the opened
// folder may hold several projects.
export async function reviewAndRemove(
  context: RemovalContext,
  selected: Finding[],
  packageManagerFor: (manifest: string) => PackageManager,
  { onRemoved, onUndo, onProvenUsed }: RemovalCallbacks,
): Promise<void> {
  const { folder, output, previews } = context;
  const root = folder.uri.fsPath;

  if (selected.length === 0) {
    vscode.window.showInformationMessage(
      'Deadweight: Check the findings you want to remove first.',
    );
    return;
  }

  const firstPackage = selected.find((finding) => finding.kind === 'package');
  const defaultManager = packageManagerFor(posix.join(firstPackage?.workspace ?? '', 'package.json'));
  const plan = planRemoval(selected, defaultManager, packageManagerFor);
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

  const checks = detectChecks(
    root,
    affectedProjects(root, selected),
    (project) => packageManagerFor(posix.join(project, 'package.json')),
  );
  const disabledChecks = new Set(context.state.get<string[]>(DISABLED_CHECKS_KEY, []));

  const decision = await showReviewPanel(
    {
      footprint: totalFootprint(selected.filter((finding) => finding.kind === 'package')),
      checks: checks.map((check) => ({
        id: check.id,
        label: check.label,
        command: describeCheck(check),
        checked: context.verify.enabled && !disabledChecks.has(check.id),
      })),
      packageGroups: plan.packages.map(({ manifest, names, packageManager }) => {
        const { command, args } = uninstallCommand(packageManager ?? plan.packageManager, names);
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

  if (!decision) {
    return;
  }

  // Remember unticked checks, only while verification is on (otherwise all start unticked).
  if (context.verify.enabled) {
    for (const check of checks) {
      if (decision.checks.includes(check.id)) {
        disabledChecks.delete(check.id);
      } else {
        disabledChecks.add(check.id);
      }
    }

    await context.state.update(DISABLED_CHECKS_KEY, [...disabledChecks]);
  }

  // Baseline: only checks that pass now can show that the removal broke something.
  const chosen = checks.filter((check) => decision.checks.includes(check.id));
  let verifyWith: VerifyCheck[] = [];
  let alreadyFailing: CheckResult[] = [];

  if (chosen.length > 0) {
    const baseline = await runChecks(root, chosen, 'Deadweight: Checking the project before removing', {
      stopOnFailure: false,
      timeoutMs: context.verify.timeoutMs,
    });

    if (!baseline) {
      vscode.window.showInformationMessage('Deadweight: Removal cancelled. Nothing was changed.');
      return;
    }

    verifyWith = baseline.filter((result) => result.ok).map((result) => result.check);
    alreadyFailing = baseline.filter((result) => !result.ok);

    for (const result of alreadyFailing) {
      logCheck(output, "Fails before the removal, so it can't verify it", result);
    }
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

  // Verify: the checks that passed before must still pass.
  let verified: CheckResult[] = [];
  let verification: 'passed' | 'cancelled' | 'skipped' = 'skipped';

  if (verifyWith.length > 0 && removedIds.size > 0) {
    const after = await runChecks(root, verifyWith, 'Deadweight: Verifying the removal', {
      stopOnFailure: true,
      timeoutMs: context.verify.timeoutMs,
    });

    const failure = after?.find((result) => !result.ok);

    if (failure) {
      await undoFailedVerification(context, record, failure, selected.filter((finding) => removedIds.has(finding.id)), onProvenUsed);
      return;
    }

    verification = after ? 'passed' : 'cancelled';
    verified = after ?? [];
  }

  onRemoved(removedIds);

  const packageCount = record.packages.reduce((sum, group) => sum + group.names.length, 0);
  const gained = totalFootprint(selected.filter((finding) => finding.kind === 'package' && removedIds.has(finding.id)));
  const gains = gained.packages === 0
    ? ''
    : ` (−${formatBytes(gained.bytes)}${gained.advisories.length > 0 ? `, −${describeAdvisories(gained.advisories)}` : ''})`;
  const notes = [
    ...(verification === 'passed' ? [`Verified: ${joinLabels(verified)} still ${verified.length === 1 ? 'passes' : 'pass'}.`] : []),
    ...(verification === 'cancelled' ? ['Verification was cancelled; use Undo if something looks wrong.'] : []),
    ...(alreadyFailing.length > 0 ? [`Not verified by ${joinLabels(alreadyFailing)}, which already failed before.`] : []),
  ];
  const summary = [
    `Deadweight: Uninstalled ${plural(packageCount, 'package')}${gains} and moved ${plural(record.files.length, 'file')} to ${TRASH_DIR}.`,
    ...notes,
  ].join(' ');

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
