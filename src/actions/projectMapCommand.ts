import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import * as vscode from 'vscode';
import {
  AGENT_INSTRUCTION_FILES,
  estimateTokens,
  PROJECT_MAP_JSON,
  PROJECT_MAP_MARKDOWN,
  renderProjectMapJson,
  renderProjectMapMarkdown,
  withAgentPointer,
} from '../engine/projectMap';
import type { ConnectionGraph } from '../graphTypes';

async function readIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function writeInFolder(folder: vscode.WorkspaceFolder, relative: string, text: string): Promise<vscode.Uri> {
  const path = join(folder.uri.fsPath, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  return vscode.Uri.joinPath(folder.uri, relative);
}

// Adds a pointer to the map in the instruction files agents read on their own.
// Returns the files changed, or undefined when the user declined.
async function linkAgentInstructions(folder: vscode.WorkspaceFolder): Promise<string[] | undefined> {
  const found: { file: string; text: string }[] = [];

  for (const file of AGENT_INSTRUCTION_FILES) {
    const text = await readIfExists(join(folder.uri.fsPath, file));

    if (text !== undefined) {
      found.push({ file, text });
    }
  }

  // No instruction file yet: AGENTS.md is the one most agents read.
  const candidates = found.length > 0 ? found : [{ file: 'AGENTS.md', text: '' }];
  const updates = candidates
    .map(({ file, text }) => ({ file, updated: withAgentPointer(text) }))
    .filter((update): update is { file: string; updated: string } => update.updated !== undefined);

  if (updates.length === 0) {
    return [];
  }

  const files = updates.map(({ file }) => file).join(', ');
  const confirm = found.length > 0 ? 'Add Section' : 'Create AGENTS.md';
  const choice = await vscode.window.showInformationMessage(
    found.length > 0
      ? `Add a short "Project map" section to ${files}, so coding agents read the map before exploring files?`
      : 'Create AGENTS.md with a short "Project map" section? Codex, Cursor, Copilot and other coding agents read it automatically.',
    { modal: true },
    confirm,
  );

  if (choice !== confirm) {
    return undefined;
  }

  for (const { file, updated } of updates) {
    await writeInFolder(folder, file, updated);
  }

  return updates.map(({ file }) => file);
}

function offerOpen(message: string, uri: vscode.Uri) {
  const open = 'Open';

  vscode.window.showInformationMessage(message, open).then((choice) => {
    if (choice === open) {
      vscode.window.showTextDocument(uri);
    }
  });
}

type ExportAction = 'agents' | 'save' | 'copy' | 'json' | 'open';

export async function exportProjectMap(folder: vscode.WorkspaceFolder, graph: ConnectionGraph) {
  const options = { projectName: folder.name };
  const markdown = renderProjectMapMarkdown(graph, options);
  const tokens = `~${estimateTokens(markdown).toLocaleString()} tokens`;

  const items: (vscode.QuickPickItem & { action: ExportAction })[] = [
    {
      action: 'agents',
      label: '$(sparkle) Save and point AI agents to it',
      description: PROJECT_MAP_MARKDOWN,
      detail: 'Adds a one-line pointer to AGENTS.md / CLAUDE.md / Copilot instructions, so coding agents read the map before opening files',
    },
    {
      action: 'save',
      label: '$(save) Save to the workspace',
      description: PROJECT_MAP_MARKDOWN,
      detail: 'Mention it in any agent chat (@ or #file) to hand over the whole structure at once',
    },
    {
      action: 'copy',
      label: '$(copy) Copy to clipboard',
      description: tokens,
      detail: 'Paste into ChatGPT, Claude, Gemini or any other chat',
    },
    {
      action: 'json',
      label: '$(json) Save as JSON',
      description: PROJECT_MAP_JSON,
      detail: 'Structured version for scripts and custom agents',
    },
    {
      action: 'open',
      label: '$(go-to-file) Open in an editor',
      detail: 'Review it before sharing',
    },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: `Project map for AI agents · ${graph.stats.files} files, ${graph.stats.packages} packages · ${tokens}`,
    placeHolder: 'How do you want to hand the project structure to your AI agent?',
  });

  if (!picked) {
    return;
  }

  switch (picked.action) {
    case 'agents': {
      const uri = await writeInFolder(folder, PROJECT_MAP_MARKDOWN, markdown);
      const linked = await linkAgentInstructions(folder);

      if (linked === undefined) {
        offerOpen(`Deadweight: Saved ${PROJECT_MAP_MARKDOWN} (${tokens}). No instruction files were changed.`, uri);
      } else if (linked.length === 0) {
        offerOpen(`Deadweight: Updated ${PROJECT_MAP_MARKDOWN} (${tokens}). Your agent instructions already point to it.`, uri);
      } else {
        offerOpen(`Deadweight: Saved ${PROJECT_MAP_MARKDOWN} (${tokens}) and linked it from ${linked.join(', ')}.`, uri);
      }
      break;
    }
    case 'save': {
      const uri = await writeInFolder(folder, PROJECT_MAP_MARKDOWN, markdown);
      offerOpen(`Deadweight: Saved ${PROJECT_MAP_MARKDOWN} (${tokens}). Mention it in your AI chat so the agent starts from the whole structure.`, uri);
      break;
    }
    case 'copy':
      await vscode.env.clipboard.writeText(markdown);
      vscode.window.showInformationMessage(`Deadweight: Copied the project map (${tokens}). Paste it into any AI chat.`);
      break;
    case 'json': {
      const uri = await writeInFolder(folder, PROJECT_MAP_JSON, renderProjectMapJson(graph, options));
      offerOpen(`Deadweight: Saved ${PROJECT_MAP_JSON}.`, uri);
      break;
    }
    case 'open': {
      const document = await vscode.workspace.openTextDocument({ content: markdown, language: 'markdown' });
      await vscode.window.showTextDocument(document);
      break;
    }
  }
}

// Keeps saved maps in step with the code: rewrites them whenever the graph is
// rebuilt, but never creates one the user didn't ask for.
export async function refreshSavedProjectMaps(folder: vscode.WorkspaceFolder, graph: ConnectionGraph) {
  const options = { projectName: folder.name };

  if (await exists(join(folder.uri.fsPath, PROJECT_MAP_MARKDOWN))) {
    await writeInFolder(folder, PROJECT_MAP_MARKDOWN, renderProjectMapMarkdown(graph, options));
  }

  if (await exists(join(folder.uri.fsPath, PROJECT_MAP_JSON))) {
    await writeInFolder(folder, PROJECT_MAP_JSON, renderProjectMapJson(graph, options));
  }
}
