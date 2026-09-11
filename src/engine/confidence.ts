import { posix } from 'node:path';
import type { GraphNode } from '../graphTypes';
import type { Confidence, Finding } from '../types';
import { TRASH_DIR, type DynamicImport, type ProjectContext, type TextSource } from './project';

// Confidence rules for the trap cases in PRD §4. Every finding starts at a base
// level and each rule that applies can only lower it, adding a sentence to the reason.

export interface PackageInfo {
  bins: string[];     // executables the package installs
  peerOf?: string;    // a declared dependency that lists this package as a peer
}

export interface ScoringInput {
  context: ProjectContext;
  unresolvedFiles: string[];
  depcheckUnused?: Set<string>;               // undefined when depcheck didn't run
  packageInfo: Map<string, PackageInfo>;      // keyed by finding id
  graph?: Map<string, GraphNode>;             // Deadweight's own graph, keyed by node id
}

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

// A tool whose config file exists is run by something (an editor, a framework
// command like `next lint`, a git hook) even when nothing imports it.
export const TOOL_CONFIG_FILES: [packageName: string, configFile: RegExp][] = [
  ['eslint', /^(?:\.eslintrc(?:\.\w+)?|eslint\.config\.[cm]?[jt]s)$/],
  ['prettier', /^(?:\.prettierrc(?:\.\w+)?|prettier\.config\.[cm]?[jt]s)$/],
  ['typescript', /^tsconfig(?:\.[\w-]+)?\.json$/],
  ['@babel/core', /^(?:\.babelrc(?:\.\w+)?|babel\.config\.\w+)$/],
  ['jest', /^jest\.config\.\w+$/],
  ['vitest', /^vitest\.config\.\w+$/],
  ['vite', /^vite\.config\.\w+$/],
  ['postcss', /^(?:postcss\.config\.\w+|\.postcssrc(?:\.\w+)?)$/],
  ['tailwindcss', /^tailwind\.config\.\w+$/],
  ['stylelint', /^(?:\.stylelintrc(?:\.\w+)?|stylelint\.config\.\w+)$/],
  ['webpack', /^webpack\.config\.\w+$/],
  ['rollup', /^rollup\.config\.\w+$/],
  ['next', /^next\.config\.\w+$/],
  ['@commitlint/cli', /^(?:\.commitlintrc(?:\.\w+)?|commitlint\.config\.\w+)$/],
  ['lint-staged', /^(?:\.lintstagedrc(?:\.\w+)?|lint-staged\.config\.\w+)$/],
];

// Packages that tools load by string name from a config file.
export const PLUGIN_PACKAGE = [
  /(?:^|\/)eslint-(?:plugin|config)(?:-|$)/,
  /(?:^|\/)babel-(?:plugin|preset)-/,
  /^@babel\/(?:plugin|preset)-/,
  /(?:^|\/)prettier-plugin-/,
  /(?:^|\/)stylelint-(?:plugin|config)(?:-|$)/,
  /(?:^|\/)postcss-/,
  /(?:^|\/)(?:remark|rehype)-/,
  /^@commitlint\//,
  /(?:^|\/)(?:vite|rollup)-plugin-/,
  /^@(?:vitejs|rollup)\/plugin-/,
  /-loader$/,
];

const BARREL_FILE = /^index\.[cm]?[jt]sx?$/;

// Specifiers that go through a path alias we can't resolve (`@/`, `~/`, `#imports`).
const ALIAS_PREFIX = /^(?:\/|@\/|~\/|#|\$)/;

// The safe-to-delete score. A finding starts from the level its evidence supports;
// independent agreement raises it within that band, and every risk caps the band
// and costs points. The band (high >= 80, medium >= 50) is what drives pre-checking.
const START: Record<Confidence, number> = { high: 90, medium: 70, low: 40 };
const CEILING: Record<Confidence, number> = { high: 99, medium: 79, low: 49 };
const AGREEMENT_BONUS = 8;
const RISK_PENALTY = 5;

export function confidenceOf(score: number): Confidence {
  return score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';
}

class Assessment {
  private readonly notes: string[] = [];
  private score: number;
  private ceiling: number;

  constructor(level: Confidence, note: string) {
    this.score = START[level];
    this.ceiling = CEILING[level];
    this.notes.push(note);
  }

  // Independent evidence that the item really is unused.
  confirm(note: string) {
    this.score = Math.min(this.score + AGREEMENT_BONUS, this.ceiling);
    this.notes.push(note);
  }

  // A reason it might still be in use: caps the band and costs points.
  cap(level: Confidence, note: string) {
    this.ceiling = Math.min(this.ceiling, CEILING[level]);
    this.score = Math.max(1, Math.min(this.score, this.ceiling) - RISK_PENALTY);
    this.notes.push(note);
  }

  get level(): Confidence {
    return confidenceOf(this.score);
  }

  get value(): number {
    return this.score;
  }

  get reason(): string {
    return `${this.notes.join('. ')}.`;
  }
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// True when `token` appears in `text` as a whole word, path or specifier.
export function mentions(text: string, token: string): boolean {
  return new RegExp(
    `(?:^|[\\s"'\`(/=,:;&|])${escapeRegExp(token)}(?:$|[\\s"'\`)/@,;:&|?#])`,
    'm',
  ).test(text);
}

function findMention(sources: TextSource[], tokens: string[]): TextSource | undefined {
  return sources.find(({ text }) => tokens.some((token) => mentions(text, token)));
}

function workspaceOf(path: string, workspaceDirs: string[]): string {
  return workspaceDirs
    .filter((dir) => dir !== '' && path.startsWith(`${dir}/`))
    .sort((a, b) => b.length - a.length)[0] ?? '';
}

type ResolvedDynamicImport =
  | { scope: 'relative'; path: string }
  | { scope: 'bare'; prefix: string }
  | { scope: 'unknown' };

function resolveDynamicImport({ file, prefix }: DynamicImport): ResolvedDynamicImport {
  if (prefix === '' || ALIAS_PREFIX.test(prefix)) {
    return { scope: 'unknown' };
  }

  if (prefix.startsWith('.')) {
    const path = posix.join(posix.dirname(file), prefix).replace(/^\.\/?/, '');
    return { scope: 'relative', path };
  }

  return { scope: 'bare', prefix };
}

function describeImport({ file, prefix }: DynamicImport): string {
  return prefix
    ? `${file} has a computed import starting with "${prefix}"`
    : `${file} has a fully computed import/require`;
}

function scannedFiles(count: number): string {
  return `${count} scanned ${count === 1 ? 'file' : 'files'}`;
}

function scorePackage(
  finding: Finding,
  input: ScoringInput,
  dynamicImports: { source: DynamicImport; resolved: ResolvedDynamicImport }[],
  unresolvedWorkspaces: Map<string, string>,
): Assessment {
  const { context, depcheckUnused } = input;
  const { name } = finding;
  const workspace = finding.workspace ?? '';
  const base = `No import found across ${scannedFiles(context.sourceFileCount)}`;

  let assessment: Assessment;

  if (workspace) {
    assessment = new Assessment(
      'medium',
      `${base}. In monorepo workspace ${workspace}; cross-workspace usage isn't verified yet`,
    );
  } else if (!depcheckUnused) {
    assessment = new Assessment('medium', `${base}. depcheck didn't run, so there is no second opinion`);
  } else if (depcheckUnused.has(name)) {
    assessment = new Assessment('high', `${base}; depcheck agrees`);
  } else {
    assessment = new Assessment('low', `${base}, but depcheck found it in use`);
  }

  const node = input.graph?.get(`package:${name}`);

  if (node?.status === 'unused') {
    assessment.confirm(`Deadweight's graph agrees: ${lowerFirst(node.reason)}`);
  } else if (node?.status === 'maybe') {
    assessment.cap('medium', `Deadweight's graph can't rule out use: ${lowerFirst(node.reason)}`);
  } else if (node) {
    assessment.cap('low', `Deadweight's graph found it in use: ${lowerFirst(node.reason)}`);
  }

  if (name.startsWith('@types/')) {
    assessment.cap('low', 'Type-only package; TypeScript can use it without any import');
  }

  if (PLUGIN_PACKAGE.some((pattern) => pattern.test(name))) {
    assessment.cap('medium', 'Looks like a plugin or preset, which tools load by name from config');
  }

  const info = input.packageInfo.get(finding.id);

  if (info?.peerOf) {
    assessment.cap('low', `Peer dependency of ${info.peerOf}, which loads it without an import in your code`);
  }

  const toolConfig = TOOL_CONFIG_FILES
    .filter(([packageName]) => packageName === name)
    .flatMap(([, pattern]) => context.configs.filter(({ source }) => pattern.test(posix.basename(source))))[0];

  if (toolConfig) {
    assessment.cap('medium', `${toolConfig.source} exists, so ${name} is probably run by a tool or editor`);
  }

  const inConfig = findMention(context.configs, [name]);

  if (inConfig) {
    assessment.cap('medium', `Referenced by name in ${inConfig.source}`);
  }

  const commands = [name, ...(info?.bins ?? [])];
  const inScripts = findMention(context.scripts, commands);

  if (inScripts) {
    assessment.cap('medium', `Used in the scripts of ${inScripts.source}`);
  }

  const inCi = findMention(context.ci, commands);

  if (inCi) {
    assessment.cap('medium', `Referenced in CI config ${inCi.source}`);
  }

  const unresolvedFile = unresolvedWorkspaces.get(workspace);

  if (unresolvedFile) {
    assessment.cap('low', `Knip couldn't resolve some imports in this workspace (e.g. ${unresolvedFile})`);
  }

  const dynamic = dynamicImports.find(({ resolved }) =>
    resolved.scope === 'unknown' ||
    (resolved.scope === 'bare' &&
      (name.startsWith(resolved.prefix) || resolved.prefix.startsWith(`${name}/`))),
  );

  if (dynamic) {
    assessment.cap('low', `May be loaded dynamically: ${describeImport(dynamic.source)}`);
  }

  return assessment;
}

type ResolvedImports = { source: DynamicImport; resolved: ResolvedDynamicImport }[];

function scoreFile(
  finding: Finding,
  input: ScoringInput,
  dynamicImports: ResolvedImports,
  unresolvedWorkspaces: Map<string, string>,
): Assessment {
  const path = finding.name;

  const assessment = new Assessment(
    'high',
    `No import found across ${scannedFiles(input.context.sourceFileCount)}`,
  );

  const node = input.graph?.get(`file:${path}`);

  if (node?.status === 'unused') {
    assessment.confirm(`Deadweight's graph agrees: ${lowerFirst(node.reason)}`);
  } else if (node?.status === 'maybe') {
    assessment.cap('low', `Deadweight's graph can't rule out use: ${lowerFirst(node.reason)}`);
  } else if (node) {
    assessment.cap('low', `Deadweight's graph found it in use: ${lowerFirst(node.reason)}`);
  }

  applyFileRisks(assessment, path, input, dynamicImports, unresolvedWorkspaces);

  return assessment;
}

// An unused export: a function, class, constant or type nothing imports.
function scoreExport(
  finding: Finding,
  input: ScoringInput,
  dynamicImports: ResolvedImports,
  unresolvedWorkspaces: Map<string, string>,
): Assessment {
  const { name } = finding;
  const path = finding.file ?? '';
  const label = name === 'default' ? 'The default export' : `"${name}"`;

  const assessment = new Assessment('high', `${label} is exported from ${path}, but no file imports it`);

  // Second opinion, independent of knip: does the name appear in any other file?
  const counts = input.context.identifierFileCounts;

  if (counts && name !== 'default') {
    const others = Math.max(0, (counts.get(name) ?? 1) - 1);

    if (others === 0) {
      assessment.confirm(`The name "${name}" appears in no other file`);
    } else {
      assessment.cap('medium', `The name "${name}" also appears in ${others} other file${others === 1 ? '' : 's'}, so it may be used indirectly`);
    }
  }

  const node = input.graph?.get(`file:${path}`);

  if (node?.status === 'maybe') {
    assessment.cap('low', `${path} may be loaded by a computed import, which can reach any export`);
  } else if (node?.status === 'entry') {
    assessment.cap('medium', `${path} is an entry point, so its exports may be public API`);
  }

  applyFileRisks(assessment, path, input, dynamicImports, unresolvedWorkspaces);

  return assessment;
}

// Risks that apply to a file and to anything exported from it.
function applyFileRisks(
  assessment: Assessment,
  path: string,
  input: ScoringInput,
  dynamicImports: ResolvedImports,
  unresolvedWorkspaces: Map<string, string>,
) {
  const { context } = input;
  const workspace = workspaceOf(path, context.workspaceDirs);

  if (workspace) {
    assessment.cap('medium', `In monorepo workspace ${workspace}; cross-workspace usage isn't verified yet`);
  }

  if (BARREL_FILE.test(posix.basename(path))) {
    assessment.cap('medium', 'Barrel file; chained re-exports can look unused');
  }

  const withoutExtension = path.replace(/\.[^./]+$/, '');
  const tokens = [path, withoutExtension];

  if (workspace) {
    tokens.push(path.slice(workspace.length + 1), withoutExtension.slice(workspace.length + 1));
  }

  const reference = findMention([...context.configs, ...context.scripts, ...context.ci], tokens);

  if (reference) {
    assessment.cap('low', `Referenced from ${reference.source}`);
  }

  const unresolvedFile = unresolvedWorkspaces.get(workspace);

  if (unresolvedFile) {
    assessment.cap('low', `Knip couldn't resolve some imports in this workspace (e.g. ${unresolvedFile})`);
  }

  const dynamic = dynamicImports.find(({ resolved }) =>
    resolved.scope === 'unknown' ||
    (resolved.scope === 'relative' && path.startsWith(resolved.path)),
  );

  if (dynamic) {
    assessment.cap('low', `May be loaded dynamically: ${describeImport(dynamic.source)}`);
  }
}

export function scoreFindings(findings: Finding[], input: ScoringInput): Finding[] {
  const { context } = input;

  const dynamicImports = context.dynamicImports.map((source) => ({
    source,
    resolved: resolveDynamicImport(source),
  }));

  const unresolvedWorkspaces = new Map<string, string>();

  for (const file of input.unresolvedFiles) {
    const workspace = workspaceOf(file, context.workspaceDirs);

    if (!unresolvedWorkspaces.has(workspace)) {
      unresolvedWorkspaces.set(workspace, file);
    }
  }

  // An export inside a file that is itself unused goes away with the file.
  const unusedFiles = new Set(findings.filter((f) => f.kind === 'file').map((f) => f.name));
  const inTrash = (path: string | undefined) => path?.startsWith(`${TRASH_DIR}/`) ?? false;

  return findings
    .filter((finding) =>
      finding.kind === 'file'
        ? !inTrash(finding.name)
        : finding.kind === 'export'
          ? !inTrash(finding.file) && !unusedFiles.has(finding.file ?? '')
          : true)
    .map((finding) => {
      const assessment = finding.kind === 'package'
        ? scorePackage(finding, input, dynamicImports, unresolvedWorkspaces)
        : finding.kind === 'export'
          ? scoreExport(finding, input, dynamicImports, unresolvedWorkspaces)
          : scoreFile(finding, input, dynamicImports, unresolvedWorkspaces);

      return { ...finding, confidence: assessment.level, score: assessment.value, reason: assessment.reason };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
