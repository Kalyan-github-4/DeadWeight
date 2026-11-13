import { relative, sep } from 'node:path';
import * as vscode from 'vscode';
import { blastRadius, GraphIndex } from '../engine/graphQueries';
import type { ConnectionGraph, GraphNode } from '../graphTypes';

type Item = vscode.QuickPickItem & { node?: GraphNode; showGraph?: boolean };

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

// "What breaks if I change this file?": everything that imports it, directly or
// through other files, and the entry points (and so the tests, pages, commands)
// it reaches.
export async function showBlastRadius(
  folder: vscode.WorkspaceFolder,
  graph: ConnectionGraph,
  file: vscode.Uri,
  showInGraph: (nodeId: string) => void,
) {
  const path = relative(folder.uri.fsPath, file.fsPath).split(sep).join('/');
  const index = new GraphIndex(graph);
  const found = index.resolve(path);

  if ('error' in found) {
    vscode.window.showInformationMessage(`Deadweight: ${path} isn't in the connection graph (only JavaScript/TypeScript source files are).`);
    return;
  }

  const radius = blastRadius(index, found.node.id)!;
  const total = radius.direct.length + radius.indirect.length;
  const name = found.node.path ?? found.node.label;

  if (total === 0) {
    vscode.window.showInformationMessage(
      `Deadweight: Nothing imports ${name}, so changing it affects no other file${found.node.status === 'entry' ? ' (it is an entry point itself)' : ''}.`,
    );
    return;
  }

  const fileItem = (node: GraphNode, description?: string): Item => ({
    label: `$(file) ${node.label}`,
    description: [node.path?.slice(0, -node.label.length).replace(/\/$/, ''), description].filter(Boolean).join(' · '),
    node,
  });

  const items: Item[] = [
    { label: '$(type-hierarchy) Show in Connection Graph', description: 'highlight everything it reaches', showGraph: true },
    { label: `Entry points affected (${radius.entries.length})`, kind: vscode.QuickPickItemKind.Separator },
    ...radius.entries.map((node) => fileItem(node, node.reason)),
    { label: `Imports it directly (${radius.direct.length})`, kind: vscode.QuickPickItemKind.Separator },
    ...radius.direct.map((node) => fileItem(node)),
    ...(radius.indirect.length > 0
      ? [
        { label: `Imports it through other files (${radius.indirect.length})`, kind: vscode.QuickPickItemKind.Separator } as Item,
        ...radius.indirect.map(({ node, depth, via }) => fileItem(node, `${depth} steps away, via ${via.split('/').pop()}`)),
      ]
      : []),
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: `Blast radius of ${found.node.label}: ${plural(total, 'file')} (${radius.direct.length} direct, ${radius.indirect.length} indirect) · ${plural(radius.entries.length, 'entry point')}`,
    placeHolder: 'Files that can break when this one changes. Pick one to open it.',
    matchOnDescription: true,
  });

  if (picked?.showGraph) {
    showInGraph(found.node.id);
  } else if (picked?.node?.path) {
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.joinPath(folder.uri, picked.node.path));
  }
}
