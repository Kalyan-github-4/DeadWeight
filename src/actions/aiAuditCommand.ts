import * as vscode from 'vscode';
import {
  AI_PROVIDERS,
  AiRequestError,
  collectAuditEvidence,
  DEFAULT_MODELS,
  PROVIDER_LABELS,
  providerHost,
  renderAuditMarkdown,
  renderEvidence,
  requestAiAudit,
  SYSTEM_PROMPT,
  type AiConfig,
  type AiProvider,
} from '../engine/aiAudit';
import { CancelledError } from '../engine/exec';

// The key lives in VS Code's SecretStorage (the OS keychain), never in settings.json.
// Provider, model and base URL are application-scoped settings, so a cloned repo's
// .vscode/settings.json can't point your key at its own server.
const secretKey = (provider: AiProvider) => `deadweight.ai.apiKey.${provider}`;

const KEY_HINTS: Record<AiProvider, string> = {
  anthropic: 'Starts with sk-ant-. Create one at console.anthropic.com',
  openai: 'Starts with sk-. Create one at platform.openai.com/api-keys',
  gemini: 'Create one at aistudio.google.com/apikey',
  'openai-compatible': 'The API key of your provider (OpenRouter, Groq, Mistral, DeepSeek, Together, a local server…)',
};

interface AiSettings {
  provider?: AiProvider;
  model?: string;
  baseUrl?: string;
}

function readAiSettings(): AiSettings {
  const config = vscode.workspace.getConfiguration('deadweight.ai');
  const provider = config.get<string>('provider');
  const model = config.get<string>('model')?.trim();
  const baseUrl = config.get<string>('baseUrl')?.trim();

  return {
    provider: AI_PROVIDERS.find((candidate) => candidate === provider),
    model: model || undefined,
    baseUrl: baseUrl || undefined,
  };
}

async function saveAiSettings(settings: AiSettings) {
  const config = vscode.workspace.getConfiguration('deadweight.ai');

  await config.update('provider', settings.provider, vscode.ConfigurationTarget.Global);
  await config.update('model', settings.model ?? '', vscode.ConfigurationTarget.Global);
  await config.update('baseUrl', settings.baseUrl ?? '', vscode.ConfigurationTarget.Global);
}

async function loadConfig(context: vscode.ExtensionContext): Promise<AiConfig | undefined> {
  const settings = readAiSettings();

  if (!settings.provider) {
    return undefined;
  }

  const apiKey = await context.secrets.get(secretKey(settings.provider));
  const model = settings.model ?? DEFAULT_MODELS[settings.provider];

  if (!apiKey || !model || (settings.provider === 'openai-compatible' && !settings.baseUrl)) {
    return undefined;
  }

  return { provider: settings.provider, apiKey, model, baseUrl: settings.baseUrl };
}

// Asks for the provider, key and model. Returns the saved config, or undefined if cancelled.
export async function configureAiKey(context: vscode.ExtensionContext): Promise<AiConfig | undefined> {
  const current = readAiSettings();
  const saved = await Promise.all(AI_PROVIDERS.map(async (provider) => Boolean(await context.secrets.get(secretKey(provider)))));

  type Item = vscode.QuickPickItem & { provider?: AiProvider; clear?: boolean };
  const items: Item[] = AI_PROVIDERS.map((provider, index) => ({
    label: `${provider === current.provider ? '$(check) ' : ''}${PROVIDER_LABELS[provider]}`,
    description: saved[index] ? 'key saved' : undefined,
    detail: DEFAULT_MODELS[provider] ? `Default model: ${DEFAULT_MODELS[provider]}` : 'Any API that speaks the OpenAI chat completions format',
    provider,
  }));

  if (saved.some(Boolean)) {
    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator }, { label: '$(trash) Remove saved API keys', clear: true });
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Deadweight: AI provider for the security scan',
    placeHolder: 'Which AI should review your packages and code? You pay for the request with your own key.',
  });

  if (!picked) {
    return undefined;
  }

  if (picked.clear) {
    await Promise.all(AI_PROVIDERS.map((provider) => context.secrets.delete(secretKey(provider))));
    vscode.window.showInformationMessage('Deadweight: Removed the saved AI API keys.');
    return undefined;
  }

  const provider = picked.provider!;
  let baseUrl: string | undefined;

  if (provider === 'openai-compatible') {
    baseUrl = (await vscode.window.showInputBox({
      title: 'API base URL',
      prompt: 'The URL before /chat/completions',
      placeHolder: 'https://openrouter.ai/api/v1',
      value: current.provider === provider ? current.baseUrl : undefined,
      ignoreFocusOut: true,
      validateInput: (value) => {
        try {
          const url = new URL(value.trim());
          return url.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
            ? undefined
            : 'Use https (http only for a server on this machine), so the key isn\'t sent in the clear.';
        } catch {
          return 'Enter a full URL, e.g. https://openrouter.ai/api/v1';
        }
      },
    }))?.trim();

    if (!baseUrl) {
      return undefined;
    }
  }

  const existingKey = await context.secrets.get(secretKey(provider));
  const enteredKey = await vscode.window.showInputBox({
    title: `${PROVIDER_LABELS[provider]} API key`,
    prompt: `${KEY_HINTS[provider]}. Stored in your OS keychain through VS Code, never in settings or the workspace.${existingKey ? ' Leave empty to keep the saved key.' : ''}`,
    password: true,
    ignoreFocusOut: true,
    placeHolder: existingKey ? '••••••••  (saved)' : 'Paste your API key',
    validateInput: (value) => (!value.trim() && !existingKey ? 'Enter an API key.' : /\s/.test(value.trim()) ? 'API keys have no spaces.' : undefined),
  });

  if (enteredKey === undefined) {
    return undefined;
  }

  const apiKey = enteredKey.trim() || existingKey!;
  const model = (await vscode.window.showInputBox({
    title: 'Model',
    prompt: DEFAULT_MODELS[provider] ? `Leave as is for ${DEFAULT_MODELS[provider]}` : 'The model id your provider uses, e.g. anthropic/claude-opus-5-5 on OpenRouter',
    value: current.provider === provider && current.model ? current.model : DEFAULT_MODELS[provider],
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() ? undefined : 'Enter a model id.'),
  }))?.trim();

  if (!model) {
    return undefined;
  }

  await context.secrets.store(secretKey(provider), apiKey);
  await saveAiSettings({ provider, model: model === DEFAULT_MODELS[provider] ? undefined : model, baseUrl });

  return { provider, apiKey, model, baseUrl };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function aiSecurityScan(context: vscode.ExtensionContext, folder: vscode.WorkspaceFolder, output: vscode.OutputChannel) {
  let config = await loadConfig(context);

  if (!config) {
    config = await configureAiKey(context);

    if (!config) {
      return;
    }
  }

  let evidence;

  try {
    evidence = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Deadweight: Collecting evidence', cancellable: true },
      async (progress, token) => {
        const controller = new AbortController();
        const listener = token.onCancellationRequested(() => controller.abort());

        try {
          return await collectAuditEvidence(folder.uri.fsPath, {
            signal: controller.signal,
            onProgress: (message) => progress.report({ message }),
          });
        } finally {
          listener.dispose();
        }
      },
    );
  } catch (error) {
    if (!(error instanceof CancelledError) && !(error instanceof Error && error.name === 'AbortError')) {
      vscode.window.showErrorMessage(`Deadweight: Couldn't collect the evidence: ${errorMessage(error)}`);
    }

    return;
  }

  const prompt = renderEvidence(evidence);
  const host = providerHost(config);
  const kb = Math.ceil(prompt.text.length / 1024);
  const send = 'Send';
  const preview = 'Preview';
  const change = 'Change Provider or Key';

  // The code leaves the machine: always ask, and show exactly what goes.
  for (;;) {
    const choice = await vscode.window.showWarningMessage(
      `Send ${kb} KB of evidence to ${PROVIDER_LABELS[config.provider]} (${host}, model ${config.model}) for review?`,
      {
        modal: true,
        detail:
          `${evidence.installScripts.length} install scripts of installed packages, ${evidence.hits.length} flagged lines of your code with their surroundings, ` +
          `${evidence.configs.length} config/CI files and your package.json dependencies and scripts. ` +
          'Tokens, keys and passwords found in it are replaced with <redacted>, and .env and key files are never read. ' +
          'The request is billed to your API key.',
      },
      send,
      preview,
      change,
    );

    if (choice === preview) {
      const document = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content: `<!-- System prompt -->\n\n${SYSTEM_PROMPT}\n\n<!-- Evidence -->\n\n${prompt.text}`,
      });
      await vscode.window.showTextDocument(document, { preview: true });
      continue;
    }

    if (choice === change) {
      config = await configureAiKey(context);

      if (!config) {
        return;
      }

      continue;
    }

    if (choice !== send) {
      return;
    }

    break;
  }

  const active = config;

  try {
    const report = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Deadweight: ${PROVIDER_LABELS[active.provider]} is reviewing ${folder.name}`,
        cancellable: true,
      },
      async (progress, token) => {
        progress.report({ message: 'This can take a few minutes for a large project.' });
        const controller = new AbortController();
        const listener = token.onCancellationRequested(() => controller.abort());

        try {
          return await requestAiAudit(active, prompt.text, { signal: controller.signal });
        } finally {
          listener.dispose();
        }
      },
    );

    const markdown = renderAuditMarkdown(report, {
      projectName: folder.name,
      provider: active.provider,
      model: active.model,
      evidence,
      truncated: prompt.truncated,
    });

    output.appendLine(`[${new Date().toLocaleString()}] AI security scan (${active.provider}, ${active.model}): ${report.verdict}, ${report.findings.length} finding(s).`);

    for (const finding of report.findings) {
      output.appendLine(`  [${finding.severity}] ${finding.title}${finding.location ? ` (${finding.location})` : ''}`);
    }

    const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: markdown });
    await vscode.commands.executeCommand('markdown.showPreview', document.uri);

    const serious = report.findings.filter((finding) => finding.severity === 'critical' || finding.severity === 'high').length;

    if (report.verdict === 'malicious' || serious > 0) {
      vscode.window.showErrorMessage(
        `Deadweight: The AI review found ${serious || report.findings.length} serious issue(s) in ${folder.name}. See the report.`,
      );
    } else {
      vscode.window.showInformationMessage(
        report.findings.length === 0
          ? `Deadweight: The AI review found no signs of malware or backdoors in ${folder.name}.`
          : `Deadweight: The AI review found ${report.findings.length} minor issue(s) in ${folder.name}. See the report.`,
      );
    }
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message)) && !(error instanceof AiRequestError)) {
      return;
    }

    output.appendLine(`[${new Date().toLocaleString()}] AI security scan failed: ${errorMessage(error)}`);

    const fix = 'Change Provider or Key';
    const choice = await vscode.window.showErrorMessage(
      `Deadweight: The AI security scan failed: ${errorMessage(error).slice(0, 300)}`,
      fix,
    );

    if (choice === fix) {
      await configureAiKey(context);
    }
  }
}
