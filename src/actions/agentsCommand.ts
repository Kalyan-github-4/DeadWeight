import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import * as vscode from 'vscode';

// Connects AI agents to Deadweight's MCP server (dist/mcp.js), which answers
// questions about the project's connection graph.

const SERVER_FILE = 'deadweight-mcp.js';
const PROVIDER_ID = 'deadweight.mcp';

// The installed extension's folder changes with every update, so agent configs
// point at a copy in global storage that is refreshed on each activation.
export async function installStableServer(context: vscode.ExtensionContext): Promise<string> {
  const target = join(context.globalStorageUri.fsPath, 'mcp', SERVER_FILE);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(context.extensionUri.fsPath, 'dist', 'mcp.js'), target);
  return target;
}

function serverArgs(serverPath: string, folder: vscode.WorkspaceFolder, entryPoints: string[]): string[] {
  return [serverPath, '--root', folder.uri.fsPath, ...entryPoints.flatMap((glob) => ['--entry', glob])];
}

// --- VS Code's own MCP support (1.101+): Copilot agent mode finds the server itself ---

interface McpApi {
  registerMcpServerDefinitionProvider?: (id: string, provider: {
    onDidChangeMcpServerDefinitions?: vscode.Event<void>;
    provideMcpServerDefinitions: () => unknown[];
  }) => vscode.Disposable;
}

type McpStdioServerDefinitionConstructor = new (
  label: string,
  command: string,
  args?: string[],
  env?: Record<string, string>,
  version?: string,
) => unknown;

export function supportsBuiltInMcp(): boolean {
  const api = (vscode as unknown as { lm?: McpApi }).lm;
  const definition = (vscode as unknown as { McpStdioServerDefinition?: unknown }).McpStdioServerDefinition;
  return typeof api?.registerMcpServerDefinitionProvider === 'function' && typeof definition === 'function';
}

// Registers one server per workspace folder with VS Code, when the API exists.
// Older VS Code builds and editors without it skip this; the command still works.
export function registerMcpProvider(
  context: vscode.ExtensionContext,
  serverPath: Promise<string>,
  entryPointsFor: (folder: vscode.WorkspaceFolder) => string[],
): vscode.Disposable | undefined {
  if (!supportsBuiltInMcp()) {
    return undefined;
  }

  const api = (vscode as unknown as { lm: Required<McpApi> }).lm;
  const Definition = (vscode as unknown as { McpStdioServerDefinition: McpStdioServerDefinitionConstructor }).McpStdioServerDefinition;
  const changed = new vscode.EventEmitter<void>();
  let resolvedPath: string | undefined;

  void serverPath.then((path) => {
    resolvedPath = path;
    changed.fire();
  });

  const version = String((context.extension.packageJSON as { version?: string }).version ?? '0.0.0');

  const registration = api.registerMcpServerDefinitionProvider(PROVIDER_ID, {
    onDidChangeMcpServerDefinitions: changed.event,
    provideMcpServerDefinitions: () => {
      const folders = vscode.workspace.workspaceFolders ?? [];

      if (!resolvedPath) {
        return [];
      }

      // The editor's own executable runs the script as plain Node, so no Node install is needed.
      return folders.map((folder) => new Definition(
        folders.length > 1 ? `Deadweight (${folder.name})` : 'Deadweight',
        process.execPath,
        serverArgs(resolvedPath!, folder, entryPointsFor(folder)),
        { ELECTRON_RUN_AS_NODE: '1' },
        version,
      ));
    },
  });

  return vscode.Disposable.from(
    registration,
    changed,
    vscode.workspace.onDidChangeWorkspaceFolders(() => changed.fire()),
  );
}

// --- Setting up other agents ------------------------------------------------------------

function quote(text: string): string {
  return `"${text.replace(/"/g, '\\"')}"`;
}

async function readJson(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

// Adds (or updates) the `deadweight` entry under `key` in a JSON config file.
async function mergeServerConfig(path: string, key: string, entry: Record<string, unknown>): Promise<'created' | 'updated'> {
  const existing = await readJson(path);
  const config = existing ?? {};
  const servers = (config[key] && typeof config[key] === 'object' ? config[key] : {}) as Record<string, unknown>;

  config[key] = { ...servers, deadweight: entry };

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);

  return existing ? 'updated' : 'created';
}

type AgentChoice = 'copilot' | 'claude' | 'cursor' | 'other';

export async function connectAgents(
  folder: vscode.WorkspaceFolder,
  serverPath: string,
  entryPoints: string[],
) {
  const args = serverArgs(serverPath, folder, entryPoints);
  const nodeCommand = ['node', ...args].map((part, index) => (index === 0 ? part : quote(part))).join(' ');
  const builtIn = supportsBuiltInMcp();

  const items: (vscode.QuickPickItem & { choice: AgentChoice })[] = [
    {
      choice: 'copilot',
      label: '$(comment-discussion) GitHub Copilot in VS Code',
      description: builtIn ? 'already connected' : '.vscode/mcp.json',
      detail: builtIn
        ? "Deadweight's tools are listed in Copilot Chat's Agent mode. Pick it to see how to use them."
        : 'Adds Deadweight to .vscode/mcp.json for Copilot agent mode.',
    },
    {
      choice: 'claude',
      label: '$(terminal) Claude Code',
      description: 'claude mcp add',
      detail: 'Runs `claude mcp add` in a terminal to register Deadweight for this project. Needs Node.js on your PATH.',
    },
    {
      choice: 'cursor',
      label: '$(file-code) Cursor',
      description: '.cursor/mcp.json',
      detail: 'Adds Deadweight to this project\'s .cursor/mcp.json. Needs Node.js on your PATH.',
    },
    {
      choice: 'other',
      label: '$(copy) Other agents (Windsurf, Claude Desktop, Cline, Zed, …)',
      description: 'copy config',
      detail: 'Copies an "mcpServers" JSON entry to paste into the agent\'s MCP settings.',
    },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Connect AI agents to Deadweight',
    placeHolder: 'Agents get tools to ask how files connect and what a change can break, instead of reading files',
  });

  if (!picked) {
    return;
  }

  const entry = { command: 'node', args };
  const configLine = 'The config has absolute paths for this machine; keep it out of version control if you share the repo.';

  switch (picked.choice) {
    case 'copilot': {
      if (builtIn) {
        const openChat = 'Open Chat';
        const choice = await vscode.window.showInformationMessage(
          'Deadweight is available to Copilot: open Chat, switch to Agent mode, and check "Deadweight" in the tools list. Then ask things like "what breaks if I change src/utils/format.ts?"',
          openChat,
        );

        if (choice === openChat) {
          await vscode.commands.executeCommand('workbench.action.chat.open');
        }

        return;
      }

      const path = join(folder.uri.fsPath, '.vscode', 'mcp.json');
      const result = await mergeServerConfig(path, 'servers', { type: 'stdio', ...entry });
      offerOpen(`Deadweight: ${result === 'created' ? 'Created' : 'Updated'} .vscode/mcp.json. ${configLine}`, path);
      return;
    }
    case 'claude': {
      const command = `claude mcp add deadweight -- ${nodeCommand}`;
      const terminal = vscode.window.createTerminal({ name: 'Deadweight: connect Claude Code', cwd: folder.uri });
      terminal.show();
      terminal.sendText(command, true);
      vscode.window.showInformationMessage('Deadweight: Registering with Claude Code in the terminal. Restart Claude Code in this project, then ask it about your code; it will use Deadweight\'s tools.');
      return;
    }
    case 'cursor': {
      const path = join(folder.uri.fsPath, '.cursor', 'mcp.json');
      const result = await mergeServerConfig(path, 'mcpServers', entry);
      offerOpen(`Deadweight: ${result === 'created' ? 'Created' : 'Updated'} .cursor/mcp.json. Enable "deadweight" in Cursor's MCP settings. ${configLine}`, path);
      return;
    }
    case 'other':
      await vscode.env.clipboard.writeText(JSON.stringify({ mcpServers: { deadweight: entry } }, null, 2));
      vscode.window.showInformationMessage('Deadweight: Copied the MCP config. Paste it into your agent\'s MCP settings (it needs Node.js on your PATH).');
      return;
  }
}

function offerOpen(message: string, path: string) {
  const open = 'Open';

  vscode.window.showInformationMessage(message, open).then((choice) => {
    if (choice === open) {
      vscode.window.showTextDocument(vscode.Uri.file(path));
    }
  });
}
