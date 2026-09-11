import * as vscode from 'vscode';
import {
  openFinding,
  restoreFromTrash,
  restoreRecord,
  reviewAndRemove,
  type RemovalContext,
} from './actions/commands';
import { exportProjectMap, refreshSavedProjectMaps } from './actions/projectMapCommand';
import { posix } from 'node:path';
import { CancelledError } from './engine/exec';
import { buildConnectionGraph } from './engine/graph';
import { detectPackageManagerFor } from './engine/packageManager';
import { findProjectRoots } from './engine/project';
import { scanFolder } from './engine/scan';
import { DeadFileDecorations } from './providers/deadFileDecorations';
import { DeadweightTreeProvider, type DeadweightTreeItem } from './providers/deadweightTreeProvider';
import { GraphPanel } from './providers/graphPanel';
import { PREVIEW_SCHEME, PreviewDocumentProvider } from './providers/previewDocumentProvider';
import { readSettings } from './providers/settings';
import type { Finding } from './types';

// Up to this many projects are scanned without asking. Each one is a knip run of a
// few seconds, so a folder of many repos gets a choice instead of a long wait.
const MAX_AUTO_PROJECTS = 8;

async function chooseProjects(
  folder: vscode.WorkspaceFolder,
  projects: string[],
): Promise<string[] | undefined> {
  if (projects.length <= MAX_AUTO_PROJECTS) {
    return projects;
  }

  const picked = await vscode.window.showQuickPick(
    projects.map((project) => ({
      label: project || folder.name,
      description: project ? undefined : 'folder root',
      picked: true,
      project,
    })),
    {
      canPickMany: true,
      title: `Deadweight found ${projects.length} projects in ${folder.name}`,
      placeHolder: 'Choose the projects to scan',
    },
  );

  return picked && picked.length > 0 ? picked.map((item) => item.project) : undefined;
}

export function activate(context: vscode.ExtensionContext) {
  const treeProvider = new DeadweightTreeProvider();
  const previews = new PreviewDocumentProvider();
  const decorations = new DeadFileDecorations(context.extensionUri);
  const output = vscode.window.createOutputChannel('Deadweight');

  const treeView = vscode.window.createTreeView<DeadweightTreeItem>('deadweight.findings', {
    treeDataProvider: treeProvider,
  });

  treeProvider.setMinimumConfidence(readSettings().minimumConfidence);

  // The folder the current findings came from; decorations resolve paths against it.
  let scannedFolder: vscode.WorkspaceFolder | undefined;

  // Scans and removals both touch package.json and the file tree; never overlap them.
  let busy = false;

  const updateViewState = () => {
    const count = treeProvider.findingCount;

    treeView.badge = count > 0
      ? { value: count, tooltip: `${count} unused package(s) and file(s)` }
      : undefined;

    vscode.commands.executeCommand('setContext', 'deadweight.hasFindings', count > 0);

    if (scannedFolder) {
      decorations.update(scannedFolder, treeProvider.getVisibleFindings());
    }
  };

  const onSettingsChanged = (event: vscode.ConfigurationChangeEvent) => {
    if (event.affectsConfiguration('deadweight.minimumConfidence')) {
      treeProvider.setMinimumConfidence(readSettings().minimumConfidence);
    }

    const affectsScan = ['deadweight.exclude', 'deadweight.entryPoints']
      .some((section) => event.affectsConfiguration(section));

    if (affectsScan && scannedFolder) {
      const scanAgain = 'Scan Again';

      vscode.window
        .showInformationMessage('Deadweight: Scan again to apply the changed settings.', scanAgain)
        .then((choice) => {
          if (choice === scanAgain) {
            vscode.commands.executeCommand('deadweight.scan');
          }
        });
    }
  };

  const getFolder = (): vscode.WorkspaceFolder | undefined => {
    const folder = vscode.workspace.workspaceFolders?.[0];

    if (!folder) {
      vscode.window.showErrorMessage('Deadweight: Open a project folder first.');
    }

    return folder;
  };

  const exclusive = (task: () => Promise<void>) => async () => {
    if (busy) {
      vscode.window.showInformationMessage('Deadweight: Wait for the current scan or removal to finish.');
      return;
    }

    busy = true;

    try {
      await task();
    } finally {
      busy = false;
    }
  };

  const removalContext = (folder: vscode.WorkspaceFolder): RemovalContext => ({
    folder,
    output,
    previews,
  });

  const scan = exclusive(async () => {
    const folder = getFolder();

    if (!folder) {
      return;
    }

    const settings = readSettings(folder.uri);

    try {
      // The opened folder may be a project, or a parent holding one or more.
      const projects = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: 'Deadweight: Looking for projects' },
        () => findProjectRoots(folder.uri.fsPath),
      );

      if (projects.length === 0) {
        const showGraph = 'Show Connection Graph';

        vscode.window
          .showWarningMessage(
            `Deadweight: No package.json found in ${folder.name} or its subfolders. Deadweight scans JavaScript/TypeScript projects.`,
            showGraph,
          )
          .then((choice) => {
            if (choice === showGraph) {
              vscode.commands.executeCommand('deadweight.showGraph');
            }
          });
        return;
      }

      const selected = await chooseProjects(folder, projects);

      if (!selected) {
        return;
      }

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Deadweight: Scanning',
          cancellable: true,
        },
        async (progress, token) => {
          const controller = new AbortController();

          const cancellationListener =
            token.onCancellationRequested(() => {
              controller.abort();
            });

          try {
            return await scanFolder(folder.uri.fsPath, {
              signal: controller.signal,
              exclude: settings.exclude,
              entryPoints: settings.entryPoints,
              packageManager: settings.packageManager,
              projects: selected,
              onProject: (project, index, total) => progress.report({
                message: total > 1 ? `${index + 1}/${total} · ${project || folder.name}` : project || folder.name,
                increment: index === 0 ? undefined : 100 / total,
              }),
            });
          } finally {
            cancellationListener.dispose();
          }
        },
      );

      scannedFolder = folder;
      treeProvider.setFindings(result.findings);
      await vscode.commands.executeCommand(
        'setContext',
        'deadweight.hasScanned',
        true,
      );

      for (const warning of result.warnings) {
        output.appendLine(warning);
      }

      const packageCount = result.findings.filter(
        (finding) => finding.kind === 'package',
      ).length;

      const fileCount = result.findings.filter(
        (finding) => finding.kind === 'file',
      ).length;

      const exportCount = result.findings.filter(
        (finding) => finding.kind === 'export',
      ).length;

      const projectCount = result.projects?.length ?? 1;
      const scope = projectCount > 1
        ? `${result.scannedFileCount} files in ${projectCount} projects`
        : `${result.scannedFileCount} files`;

      const summary = result.findings.length === 0
        ? `Deadweight: No deadweight found across ${scope}.`
        : `Deadweight: Found ${packageCount} unused package(s), ${fileCount} unused file(s) and ${exportCount} unused export(s) across ${scope}.`;

      if (result.warnings.length === 0) {
        vscode.window.showInformationMessage(summary);
        return;
      }

      const showWarnings = 'Show Warnings';

      vscode.window.showInformationMessage(summary, showWarnings).then((choice) => {
        if (choice === showWarnings) {
          output.show();
        }
      });
    } catch (error) {
      if (error instanceof CancelledError) {
        return;
      }

      const message =
        error instanceof Error ? error.message : String(error);

      // Engine crashes come with long stack traces; keep the popup to the first
      // meaningful line and put the rest in the output channel.
      const summary = message
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => /error/i.test(line) && !line.startsWith('at ')) ??
        message.split(/\r?\n/)[0];

      output.appendLine(`[${new Date().toLocaleString()}] Scan failed:`);
      output.appendLine(message);

      const showDetails = 'Show Details';

      vscode.window
        .showErrorMessage(`Deadweight scan failed: ${summary.slice(0, 300)}`, showDetails)
        .then((choice) => {
          if (choice === showDetails) {
            output.show();
          }
        });
    }
  });

  const remove = exclusive(async () => {
    // Findings are relative to the folder they were scanned from.
    const folder = scannedFolder ?? getFolder();

    if (folder) {
      // Read at removal time, so a changed override applies without rescanning.
      const override = readSettings(folder.uri).packageManager;

      await reviewAndRemove(
        removalContext(folder),
        treeProvider.getCheckedFindings(),
        (manifest) => override ?? detectPackageManagerFor(folder.uri.fsPath, posix.dirname(manifest)),
        {
          onRemoved: (ids) => treeProvider.removeFindings(ids),
          onUndo: (record) => exclusive(() => restoreRecord(removalContext(folder), record))(),
        },
      );
    }
  });

  const buildGraph = async (folder: vscode.WorkspaceFolder, location: vscode.ProgressLocation) => {
    const graph = await vscode.window.withProgress(
      { location, title: 'Deadweight: Building connection graph' },
      () => buildConnectionGraph(folder.uri.fsPath, { entryPoints: readSettings(folder.uri).entryPoints }),
    );

    // A saved project map would otherwise go stale as the code changes.
    refreshSavedProjectMaps(folder, graph).catch((error: unknown) =>
      output.appendLine(`Couldn't refresh the saved project map: ${(error as Error).message}`),
    );

    return graph;
  };

  const showGraph = (focusId?: string) => GraphPanel.show(context.extensionUri, {
    build: async () => {
      const folder = getFolder();

      if (!folder) {
        return undefined;
      }

      return { graph: await buildGraph(folder, vscode.ProgressLocation.Window), folder };
    },
    exportMap: (graph, folder) => void exportProjectMap(folder, graph),
  }, focusId);

  const exportMap = async () => {
    const folder = getFolder();

    if (!folder) {
      return;
    }

    try {
      await exportProjectMap(folder, await buildGraph(folder, vscode.ProgressLocation.Notification));
    } catch (error) {
      vscode.window.showErrorMessage(`Deadweight: Couldn't build the project map: ${(error as Error).message}`);
    }
  };

  const restore = exclusive(async () => {
    const folder = getFolder();

    if (folder) {
      await restoreFromTrash(removalContext(folder));
    }
  });

  context.subscriptions.push(
    treeProvider,
    previews,
    decorations,
    output,
    treeView,
    vscode.window.registerFileDecorationProvider(decorations),
    vscode.workspace.onDidChangeConfiguration(onSettingsChanged),
    treeProvider.onDidChangeTreeData(updateViewState),
    treeView.onDidChangeCheckboxState((event) => treeProvider.setChecked(event.items)),
    vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, previews),
    vscode.commands.registerCommand('deadweight.scan', scan),
    vscode.commands.registerCommand('deadweight.reviewRemove', remove),
    vscode.commands.registerCommand('deadweight.restore', restore),
    vscode.commands.registerCommand('deadweight.showGraph', () => showGraph()),
    vscode.commands.registerCommand('deadweight.exportProjectMap', exportMap),
    vscode.commands.registerCommand('deadweight.showInGraph', (item?: DeadweightTreeItem) => {
      const finding = item?.finding;
      const nodeId = !finding
        ? undefined
        : finding.kind === 'export' ? `file:${finding.file}` : `${finding.kind}:${finding.name}`;
      showGraph(nodeId);
    }),
    vscode.commands.registerCommand('deadweight.openFinding', async (finding: Finding) => {
      const folder = scannedFolder ?? getFolder();

      if (!folder) {
        return;
      }

      try {
        await openFinding(folder, finding);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Deadweight: Couldn't open ${finding.name}: ${(error as Error).message}`,
        );
      }
    }),
  );
}

export function deactivate() {}
