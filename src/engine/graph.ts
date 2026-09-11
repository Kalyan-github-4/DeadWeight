import { join, posix } from 'node:path';
import type { ConnectionGraph, EdgeKind, GraphEdge, GraphNode, NodeStatus } from '../graphTypes';
import { mentions, PLUGIN_PACKAGE, TOOL_CONFIG_FILES } from './confidence';
import { createMatcher } from './filters';
import { extractImports } from './imports';
import {
  CI_FILE,
  CONFIG_FILE,
  listFiles,
  readInstalledPackage,
  readSmallFile,
  SOURCE_FILE,
  TRASH_DIR,
  type TextSource,
} from './project';
import {
  loadPathAliases,
  manifestEntryPaths,
  Resolver,
  type PathAliases,
  type WorkspacePackage,
} from './resolver';

// Deadweight's own connection graph: which files import which, which packages each
// file uses, and what is reachable from the project's entry points. Independent of
// knip and depcheck, runs offline, and explains every verdict.

export type { ConnectionGraph, EdgeKind, GraphEdge, GraphNode, NodeStatus };

export interface GraphOptions {
  signal?: AbortSignal;
  entryPoints?: string[];       // extra entry globs from settings
}

const TEST_FILE = /(?:^|\/)(?:__tests__|__mocks__)\/|\.(?:test|spec|stories|story)\.[cm]?[jt]sx?$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
// Build output folders a manifest entry may point into; group 1 is the rest of the path.
const BUILD_OUTPUT = /^(?:dist|out|build|lib|es|esm|cjs)\/(.+)$/;

const DEFAULT_ENTRY =/^(?:src\/)?(?:index|main|cli|server|app)\.(?:[cm]?[jt]sx?)$/;

// Files a framework loads by convention, relative to the workspace dir.
const FRAMEWORK_ENTRIES: [dependency: RegExp, files: RegExp, name: string][] = [
  [/^next$/, /^(?:src\/)?(?:pages|app)\/|^(?:src\/)?(?:middleware|instrumentation)\.[cm]?[jt]sx?$/, 'Next.js'],
  [/^nuxt$/, /^(?:pages|layouts|components|composables|plugins|middleware|server|utils)\/|^app\.vue$/, 'Nuxt'],
  [/^@sveltejs\/kit$/, /^src\/(?:routes\/|hooks\.|app\.html)/, 'SvelteKit'],
  [/^@remix-run\//, /^app\/(?:root|entry\.(?:client|server))\.|^app\/routes\//, 'Remix'],
  [/^astro$/, /^src\/(?:pages|layouts|content)\//, 'Astro'],
  [/^gatsby$/, /^src\/(?:pages|templates)\/|^gatsby-(?:browser|node|ssr)\./, 'Gatsby'],
  [/^(?:expo|react-native)$/, /^(?:App|index)\.[cm]?[jt]sx?$|^app\//, 'Expo / React Native'],
  [/^@angular\/core$/, /^src\/(?:main|polyfills)\.ts$/, 'Angular'],
];

// Modules the runtime supplies, so importing them without declaring them is fine.
const HOST_PROVIDED = new Set(['vscode', 'electron']);

// Packages a JSX file needs without importing them by name.
const JSX_RUNTIMES = ['react', 'react-dom', 'preact', 'solid-js'];

// A path-looking string literal in a config file: 'shims/x.js', './src/setup.ts'.
const PATH_LITERAL = /['"`]((?:\.{1,2}\/)?[\w@.-]+(?:\/[\w@.-]+)*\.[a-z]{1,5})['"`]/g;

// A file path mentioned in a shell command: `node scripts/seed.js`.
const COMMAND_PATH = /(?:^|[\s"'=])((?:\.\/)?[\w@.-]+(?:\/[\w@.-]+)*\.[cm]?[jt]sx?)(?=$|[\s"';&|)])/g;

const HTML_SCRIPT = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;

function workspaceOf(path: string, workspaceDirs: string[]): string {
  return workspaceDirs.find((dir) => dir !== '' && path.startsWith(`${dir}/`)) ?? '';
}

function relativeTo(dir: string, path: string): string {
  return dir ? path.slice(dir.length + 1) : path;
}

function dependencyNames(manifest: Record<string, unknown>, sections: string[]): string[] {
  return sections.flatMap((section) => {
    const deps = manifest[section];
    return deps && typeof deps === 'object' ? Object.keys(deps) : [];
  });
}

function list(items: string[], max = 3): string {
  return items.length > max ? `${items.slice(0, max).join(', ')} and ${items.length - max} more` : items.join(', ');
}

export async function buildConnectionGraph(root: string, options: GraphOptions = {}): Promise<ConnectionGraph> {
  const startedAt = Date.now();
  const { signal } = options;

  const allFiles = (await listFiles(root, signal)).filter((file) => !file.startsWith(`${TRASH_DIR}/`));
  const fileSet = new Set(allFiles);

  const readText = async (file: string) => readSmallFile(join(root, file));

  // Workspaces: every directory holding a package.json. Deepest first, so a file
  // belongs to the most specific one.
  const manifests = new Map<string, Record<string, unknown>>();

  for (const file of allFiles.filter((f) => posix.basename(f) === 'package.json')) {
    try {
      const dir = posix.dirname(file) === '.' ? '' : posix.dirname(file);
      manifests.set(dir, JSON.parse((await readText(file)) ?? '') as Record<string, unknown>);
    } catch {
      // A malformed manifest just isn't a workspace.
    }
  }

  const workspaceDirs = [...manifests.keys()].sort((a, b) => b.length - a.length);
  const workspacePackages = new Map<string, WorkspacePackage>();

  for (const [dir, manifest] of manifests) {
    if (typeof manifest.name === 'string') {
      workspacePackages.set(manifest.name, { dir, manifest });
    }
  }

  // Path aliases from every tsconfig/jsconfig.
  const configTexts = new Map<string, string>();

  for (const file of allFiles.filter((f) => /^(?:tsconfig|jsconfig)(?:\.[\w-]+)?\.json$/.test(posix.basename(f)))) {
    const text = await readText(file);

    if (text !== undefined) {
      configTexts.set(file, text);
    }
  }

  const aliases = new Map<string, PathAliases>();

  for (const file of configTexts.keys()) {
    const name = posix.basename(file);

    if (name !== 'tsconfig.json' && name !== 'jsconfig.json') {
      continue;
    }

    const loaded = loadPathAliases(file, (path) => configTexts.get(path));
    const dir = posix.dirname(file) === '.' ? '' : posix.dirname(file);

    if (loaded && !aliases.has(dir)) {
      aliases.set(dir, loaded);
    }
  }

  const resolver = new Resolver(fileSet, aliases, workspacePackages);

  // --- Imports -----------------------------------------------------------------

  const sourceFiles = allFiles.filter((file) => SOURCE_FILE.test(file));
  const edges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();
  const unresolved: { file: string; specifier: string }[] = [];
  const fullyComputed: string[] = [];         // files with import(x) / require(x)
  const packageImporters = new Map<string, Set<string>>();

  const addEdge = (from: string, to: string, kind: EdgeKind) => {
    const key = `${from}>${to}`;

    if (from !== to && !edgeKeys.has(key)) {
      edgeKeys.add(key);
      edges.push({ from, to, kind });
    }
  };

  const configSources: TextSource[] = [];

  for (const file of sourceFiles) {
    signal?.throwIfAborted();

    const text = await readText(file);

    if (text === undefined) {
      continue;
    }

    if (CONFIG_FILE.test(posix.basename(file))) {
      configSources.push({ source: file, text });
    }

    const { imports, dynamicPrefixes } = extractImports(text);

    for (const { specifier, kind } of imports) {
      const resolution = resolver.resolve(file, specifier);

      if (resolution.kind === 'file') {
        addEdge(`file:${file}`, `file:${resolution.path}`, kind);
      } else if (resolution.kind === 'package') {
        addEdge(`file:${file}`, `package:${resolution.name}`, kind);

        const importers = packageImporters.get(resolution.name) ?? new Set();
        importers.add(file);
        packageImporters.set(resolution.name, importers);
      } else if (resolution.kind === 'unresolved') {
        unresolved.push({ file, specifier });
      }
    }

    // Computed paths: every file under the static prefix may be loaded.
    for (const prefix of dynamicPrefixes) {
      if (prefix === '') {
        fullyComputed.push(file);
        continue;
      }

      if (!prefix.startsWith('.')) {
        continue;   // `dayjs/locale/${x}`: inside a package, not our files
      }

      const base = posix.normalize(posix.join(posix.dirname(file), prefix)).replace(/^\.\//, '');

      for (const candidate of sourceFiles) {
        if (candidate.startsWith(base) && candidate !== file) {
          addEdge(`file:${file}`, `file:${candidate}`, 'maybe');
        }
      }
    }
  }

  // Config files (including JSON/YAML ones) point at files by path string.
  for (const file of allFiles.filter((f) => CONFIG_FILE.test(posix.basename(f)) && !SOURCE_FILE.test(f))) {
    const text = await readText(file);

    if (text !== undefined) {
      configSources.push({ source: file, text });
    }
  }

  // Configs and build scripts (esbuild.js, webpack configs) name files by path.
  // Paths resolve against the file's own dir, then the workspace root, since
  // scripts usually run from there.
  const followPathLiterals = (source: string, text: string) => {
    const dir = posix.dirname(source) === '.' ? '' : posix.dirname(source);
    const workspace = workspaceOf(source, workspaceDirs);

    for (const match of text.matchAll(PATH_LITERAL)) {
      const hit = resolver.resolvePath(posix.join(dir, match[1])) ?? resolver.resolvePath(posix.join(workspace, match[1]));

      if (hit?.kind === 'file' && SOURCE_FILE.test(hit.path)) {
        addEdge(`file:${source}`, `file:${hit.path}`, 'config');
      }
    }
  };

  for (const { source, text } of configSources) {
    followPathLiterals(source, text);
  }

  // --- Entry points ----------------------------------------------------------

  const entries = new Map<string, string>();   // path -> reason
  const addEntry = (path: string, reason: string) => {
    if (fileSet.has(path) && !entries.has(path)) {
      entries.set(path, reason);
    }
  };

  const scriptSources: TextSource[] = [];
  const frameworks = new Map<string, string>();   // package -> framework name

  for (const [dir, manifest] of manifests) {
    const manifestPath = posix.join(dir, 'package.json');

    for (const entry of manifestEntryPaths(manifest)) {
      const hit = resolver.resolvePath(posix.join(dir, entry));

      if (hit?.kind === 'file') {
        addEntry(hit.path, `Entry point in ${manifestPath}`);
        continue;
      }

      // `main: dist/extension.js` names build output; the source is src/extension.ts.
      const built = posix.normalize(entry).match(BUILD_OUTPUT);

      if (built) {
        const source = resolver.resolvePath(posix.join(dir, 'src', built[1].replace(/\.[cm]?js$/, '')));

        if (source?.kind === 'file') {
          addEntry(source.path, `Source of ${entry}, the entry point in ${manifestPath}`);
        }
      }
    }

    const scripts = manifest.scripts && typeof manifest.scripts === 'object'
      ? Object.values(manifest.scripts).filter((s): s is string => typeof s === 'string').join('\n')
      : '';

    if (scripts) {
      scriptSources.push({ source: manifestPath, text: scripts });

      for (const match of scripts.matchAll(COMMAND_PATH)) {
        const hit = resolver.resolvePath(posix.join(dir, match[1]));

        if (hit?.kind === 'file') {
          addEntry(hit.path, `Run by a script in ${manifestPath}`);
        }
      }
    }

    const dependencies = dependencyNames(manifest, ['dependencies', 'devDependencies', 'peerDependencies']);

    for (const [dependency, pattern, framework] of FRAMEWORK_ENTRIES) {
      const frameworkPackage = dependencies.find((name) => dependency.test(name));

      if (!frameworkPackage) {
        continue;
      }

      frameworks.set(frameworkPackage, framework);

      for (const file of sourceFiles) {
        if (workspaceOf(file, workspaceDirs) === dir && pattern.test(relativeTo(dir, file))) {
          addEntry(file, `${framework} loads this file by convention`);
        }
      }
    }
  }

  const ciSources: TextSource[] = [];

  for (const file of allFiles.filter((f) => CI_FILE.test(f))) {
    const text = await readText(file);

    if (text === undefined) {
      continue;
    }

    ciSources.push({ source: file, text });

    for (const match of text.matchAll(COMMAND_PATH)) {
      const hit = resolver.resolvePath(match[1]);

      if (hit?.kind === 'file') {
        addEntry(hit.path, `Run from ${file}`);
      }
    }
  }

  for (const file of allFiles.filter((f) => f.endsWith('.html'))) {
    const text = await readText(file);
    const dir = posix.dirname(file) === '.' ? '' : posix.dirname(file);

    for (const match of text?.matchAll(HTML_SCRIPT) ?? []) {
      const src = match[1];
      const hit = resolver.resolvePath(src.startsWith('/') ? posix.join(workspaceOf(file, workspaceDirs), src) : posix.join(dir, src));

      if (hit?.kind === 'file') {
        addEntry(hit.path, `Loaded by <script> in ${file}`);
      }
    }
  }

  const isUserEntry = createMatcher(options.entryPoints ?? []);

  for (const file of sourceFiles) {
    const dir = workspaceOf(file, workspaceDirs);
    const name = posix.basename(file);

    if (isUserEntry(file)) {
      addEntry(file, 'Listed in the deadweight.entryPoints setting');
    } else if (CONFIG_FILE.test(name) || name.startsWith('.')) {
      // Dotfiles with code (.vscode-test.mjs, .mocharc.js) are tool configs too.
      addEntry(file, 'Config file, loaded by its tool');
    } else if (DECLARATION_FILE.test(file)) {
      addEntry(file, 'Type declarations, used by TypeScript without an import');
    } else if (TEST_FILE.test(file)) {
      addEntry(file, 'Test or story file, loaded by its runner');
    } else if (DEFAULT_ENTRY.test(relativeTo(dir, file))) {
      addEntry(file, 'Default entry file');
    }
  }

  for (const [path, reason] of entries) {
    if (reason.startsWith('Run ') && SOURCE_FILE.test(path) && !CONFIG_FILE.test(posix.basename(path))) {
      const text = await readText(path);

      if (text !== undefined) {
        followPathLiterals(path, text);
      }
    }
  }

  // --- Reachability -------------------------------------------------------------

  const outgoing = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();

  for (const edge of edges) {
    if (!outgoing.has(edge.from)) {
      outgoing.set(edge.from, []);
    }

    if (!incoming.has(edge.to)) {
      incoming.set(edge.to, []);
    }

    outgoing.get(edge.from)!.push(edge);
    incoming.get(edge.to)!.push(edge);
  }

  // Marks everything reachable from `starts` (the starts themselves included) in `seen`.
  const walk = (starts: string[], followMaybe: boolean, seen: Set<string>) => {
    const queue = [...starts];
    queue.forEach((id) => seen.add(id));

    for (let next = 0; next < queue.length; next++) {
      const id = queue[next];

      for (const edge of outgoing.get(id) ?? []) {
        if ((followMaybe || edge.kind !== 'maybe') && edge.to.startsWith('file:') && !seen.has(edge.to)) {
          seen.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
  };

  const used = new Set<string>();
  walk([...entries.keys()].map((path) => `file:${path}`), false, used);

  // Files reachable only through a computed import (or from such a file).
  const maybe = new Set<string>(used);
  walk([...used], true, maybe);

  for (const id of used) {
    maybe.delete(id);
  }

  // Only application code can cast doubt on other files. Tests, stories and configs
  // often hold code in strings (fixtures, snapshots) and don't load app files by
  // computed path.
  const isAppCode = (file: string) =>
    used.has(`file:${file}`) && !TEST_FILE.test(file) && !CONFIG_FILE.test(posix.basename(file));
  const usedFullyComputed = [...new Set(fullyComputed.filter(isAppCode))];
  const unresolvedInUse = unresolved.filter(({ file }) => isAppCode(file));

  // --- Nodes ----------------------------------------------------------------------

  const nodes: GraphNode[] = [];
  const fileNodes = new Set([
    ...sourceFiles.map((file) => `file:${file}`),
    ...edges.flatMap((edge) => [edge.from, edge.to]).filter((id) => id.startsWith('file:')),
  ]);

  const importersOf = (id: string, among?: Set<string>) =>
    (incoming.get(id) ?? [])
      .map((edge) => edge.from)
      .filter((from) => from.startsWith('file:') && (!among || among.has(from)))
      .map((from) => from.slice('file:'.length));

  for (const id of fileNodes) {
    const path = id.slice('file:'.length);
    const workspace = workspaceOf(path, workspaceDirs);
    let status: NodeStatus;
    let reason: string;

    if (entries.has(path)) {
      status = 'entry';
      reason = entries.get(path)!;
    } else if (used.has(id)) {
      status = 'used';
      reason = `Imported by ${list(importersOf(id, used))}`;
    } else if (maybe.has(id)) {
      status = 'maybe';
      const loaders = (incoming.get(id) ?? []).filter((edge) => edge.kind === 'maybe').map((edge) => edge.from.slice(5));
      reason = loaders.length > 0
        ? `May be loaded by a computed import in ${list(loaders)}`
        : `Only reachable through files that are loaded by a computed import`;
    } else if (usedFullyComputed.length > 0) {
      status = 'maybe';
      reason = `Nothing imports this file, but ${list(usedFullyComputed)} loads a computed path that could be anything`;
    } else if (unresolvedInUse.length > 0 && unresolvedInUse.some((u) => workspaceOf(u.file, workspaceDirs) === workspace)) {
      const example = unresolvedInUse.find((u) => workspaceOf(u.file, workspaceDirs) === workspace)!;
      status = 'maybe';
      reason = `Nothing imports this file, but some imports couldn't be resolved (e.g. "${example.specifier}" in ${example.file})`;
    } else {
      status = 'unused';
      const deadImporters = importersOf(id);
      reason = deadImporters.length > 0
        ? `Only imported by unused files: ${list(deadImporters)}`
        : 'Nothing imports this file';
    }

    nodes.push({ id, kind: 'file', label: posix.basename(path), path, workspace, status, reason });
  }

  // --- Packages ------------------------------------------------------------------

  const declared = new Map<string, string[]>();    // name -> manifests declaring it

  for (const [dir, manifest] of manifests) {
    for (const name of dependencyNames(manifest, ['dependencies', 'devDependencies', 'optionalDependencies'])) {
      if (!workspacePackages.has(name)) {
        declared.set(name, [...(declared.get(name) ?? []), posix.join(dir, 'package.json')]);
      }
    }
  }

  const statusOf = new Map(nodes.map((node) => [node.id, node.status]));
  const isLive = (file: string) => ['entry', 'used'].includes(statusOf.get(`file:${file}`) ?? '');
  const liveJsx = sourceFiles.some((file) => /\.[jt]sx$/.test(file) && isLive(file));
  const configNames = new Set(configSources.map(({ source }) => posix.basename(source)));

  // Peer dependencies of packages that are used load without an import in our code.
  const peerOf = new Map<string, string>();

  for (const [name, importers] of packageImporters) {
    if (![...importers].some(isLive)) {
      continue;
    }

    const workspace = workspaceOf([...importers][0], workspaceDirs);
    const installed = await readInstalledPackage(root, workspace, name);

    for (const peer of installed?.peers ?? []) {
      if (!peerOf.has(peer)) {
        peerOf.set(peer, name);
      }
    }
  }

  for (const name of new Set([...declared.keys(), ...packageImporters.keys()])) {
    const importers = [...(packageImporters.get(name) ?? [])];
    const liveImporters = importers.filter(isLive);
    const maybeImporters = importers.filter((file) => statusOf.get(`file:${file}`) === 'maybe');
    const manifestsDeclaring = declared.get(name) ?? [];
    const workspace = manifestsDeclaring.length > 0
      ? workspaceOf(manifestsDeclaring[0], workspaceDirs)
      : workspaceOf(importers[0] ?? '', workspaceDirs);

    let status: NodeStatus;
    let reason: string;

    const toolConfig = TOOL_CONFIG_FILES.find(([tool, pattern]) => tool === name && [...configNames].some((file) => pattern.test(file)));
    const runBy = [...scriptSources, ...ciSources].find(({ text }) => mentions(text, name));
    const mention = configSources.find(({ text }) => mentions(text, name));

    if (liveImporters.length > 0) {
      status = 'used';
      reason = manifestsDeclaring.length > 0 || HOST_PROVIDED.has(name)
        ? `Imported by ${list(liveImporters)}`
        : `Imported by ${list(liveImporters)}, but not declared in any package.json`;
    } else if (runBy) {
      status = 'used';
      reason = runBy.source.endsWith('package.json')
        ? `Run by a script in ${runBy.source}`
        : `Run from ${runBy.source}`;
    } else if (frameworks.has(name)) {
      status = 'used';
      reason = `The ${frameworks.get(name)} framework; it runs the app and loads its files`;
    } else if (peerOf.has(name)) {
      status = 'used';
      reason = `Peer dependency of ${peerOf.get(name)}, which loads it`;
    } else if (liveJsx && JSX_RUNTIMES.includes(name)) {
      status = 'used';
      reason = 'JSX runtime, used by .jsx/.tsx files without an import';
    } else if (maybeImporters.length > 0) {
      status = 'maybe';
      reason = `Only imported by files that may be unused: ${list(maybeImporters)}`;
    } else if (toolConfig) {
      status = 'maybe';
      reason = `A ${name} config file exists, so a tool or editor probably runs it`;
    } else if (mention) {
      status = 'maybe';
      reason = `Not imported, but referenced by name in ${mention.source}`;
    } else if (name.startsWith('@types/')) {
      status = 'maybe';
      reason = 'Type definitions; TypeScript uses them without an import';
    } else if (PLUGIN_PACKAGE.some((pattern) => pattern.test(name))) {
      status = 'maybe';
      reason = 'Looks like a plugin or preset, which tools load by name';
    } else if (importers.length > 0) {
      status = 'unused';
      reason = `Only imported by unused files: ${list(importers)}`;
    } else {
      status = 'unused';
      reason = `Declared in ${list(manifestsDeclaring)}, but nothing imports it`;
    }

    nodes.push({ id: `package:${name}`, kind: 'package', label: name, workspace, status, reason });
  }

  const count = (kind: GraphNode['kind'], status: NodeStatus) =>
    nodes.filter((node) => node.kind === kind && node.status === status).length;

  return {
    nodes,
    edges,
    unresolved,
    stats: {
      files: nodes.filter((node) => node.kind === 'file').length,
      entries: count('file', 'entry'),
      used: count('file', 'used'),
      maybe: count('file', 'maybe'),
      unused: count('file', 'unused'),
      packages: nodes.filter((node) => node.kind === 'package').length,
      unusedPackages: count('package', 'unused'),
    },
    durationMs: Date.now() - startedAt,
  };
}
