import { readdir, readFile, stat } from 'node:fs/promises';
import { join, posix } from 'node:path';
import ignore, { type Ignore } from 'ignore';
import { extractDynamicImportPrefixes } from './dynamicImports';

export const TRASH_DIR = '.deadweight-trash';

// Never walked, regardless of .gitignore: dependencies, VCS data, our own trash,
// and framework caches that hold generated bundles.
const ALWAYS_SKIPPED_DIRS = new Set([
  'node_modules',
  '.git',
  TRASH_DIR,
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  'coverage',
  '.deadweight',    // generated project maps for AI agents
]);

export const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/;

// Config files that load files or packages by string name (tailwind, next, vite,
// eslint, babel, prettier, jest, ...), plus the TS/JS project files.
export const CONFIG_FILE = /\.config\.(?:[cm]?[jt]s|json|ya?ml)$|^\.[\w.-]*rc(?:\.(?:[cm]?[jt]s|json|ya?ml))?$|^(?:tsconfig|jsconfig)(?:\.[\w-]+)?\.json$/;

export const CI_FILE = /^(?:\.github\/workflows\/.+\.ya?ml|\.gitlab-ci\.ya?ml|\.circleci\/config\.ya?ml|azure-pipelines\.ya?ml|bitbucket-pipelines\.ya?ml|\.travis\.ya?ml|Jenkinsfile|Dockerfile|Makefile)$/;

const MAX_SCANNED_FILE_BYTES = 1024 * 1024;

export interface DynamicImport {
  file: string;       // workspace-relative path of the importing file
  prefix: string;     // static part of the specifier, '' when fully computed
}

export interface TextSource {
  source: string;     // workspace-relative path the text came from
  text: string;
}

export interface ProjectContext {
  sourceFileCount: number;
  // For every identifier-like word, how many source files contain it. An export
  // whose name shows up in no other file is very unlikely to be used indirectly.
  identifierFileCounts?: Map<string, number>;
  workspaceDirs: string[];          // dirs holding a package.json; '' is the root
  dynamicImports: DynamicImport[];
  scripts: TextSource[];            // package.json `scripts`, one entry per manifest
  ci: TextSource[];
  configs: TextSource[];
}

interface IgnoreScope {
  base: string;
  rules: Ignore;
}

function isIgnored(path: string, isDir: boolean, scopes: IgnoreScope[]): boolean {
  return scopes.some(({ base, rules }) => {
    const relative = base ? path.slice(base.length + 1) : path;
    return rules.ignores(isDir ? `${relative}/` : relative);
  });
}

async function readIgnoreScope(
  root: string,
  dir: string,
): Promise<IgnoreScope | undefined> {
  try {
    const text = await readFile(join(root, dir, '.gitignore'), 'utf8');
    return { base: dir, rules: ignore().add(text) };
  } catch {
    return undefined;
  }
}

// Workspace-relative posix paths of every file not excluded by .gitignore.
export async function listFiles(root: string, signal?: AbortSignal): Promise<string[]> {
  const files: string[] = [];

  const walk = async (dir: string, scopes: IgnoreScope[]) => {
    signal?.throwIfAborted();

    const scope = await readIgnoreScope(root, dir);
    const activeScopes = scope ? [...scopes, scope] : scopes;

    let entries;

    try {
      entries = await readdir(join(root, dir), { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const path = dir ? `${dir}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (!ALWAYS_SKIPPED_DIRS.has(entry.name) && !isIgnored(path, true, activeScopes)) {
          await walk(path, activeScopes);
        }
      } else if (entry.isFile() && !isIgnored(path, false, activeScopes)) {
        files.push(path);
      }
    }
  };

  await walk('', []);

  return files;
}

// How far below the opened folder to look for projects. Deep enough for
// `repos/org/app/`, shallow enough to stay fast on a home directory.
const MAX_PROJECT_DEPTH = 6;

// Folder-relative posix dirs of the JavaScript/TypeScript projects inside `root`:
// the outermost dirs holding a package.json ('' when root is a project itself).
// A project's nested workspaces belong to it, so the walk stops at each one.
export async function findProjectRoots(root: string, signal?: AbortSignal): Promise<string[]> {
  const projects: string[] = [];

  const walk = async (dir: string, scopes: IgnoreScope[], depth: number) => {
    signal?.throwIfAborted();

    let entries;

    try {
      entries = await readdir(join(root, dir), { withFileTypes: true });
    } catch {
      return;
    }

    if (entries.some((entry) => entry.isFile() && entry.name === 'package.json')) {
      projects.push(dir);
      return;
    }

    if (depth >= MAX_PROJECT_DEPTH) {
      return;
    }

    const scope = await readIgnoreScope(root, dir);
    const activeScopes = scope ? [...scopes, scope] : scopes;

    for (const entry of entries) {
      const path = dir ? `${dir}/${entry.name}` : entry.name;

      // Dot folders (.git, .vscode, .github, caches) never hold a project.
      if (
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        !ALWAYS_SKIPPED_DIRS.has(entry.name) &&
        !isIgnored(path, true, activeScopes)
      ) {
        await walk(path, activeScopes, depth + 1);
      }
    }
  };

  await walk('', [], 0);

  return projects.sort();
}

export async function readSmallFile(path: string): Promise<string | undefined> {
  try {
    if ((await stat(path)).size > MAX_SCANNED_FILE_BYTES) {
      return undefined;
    }

    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

export async function collectProjectContext(
  root: string,
  signal?: AbortSignal,
): Promise<ProjectContext> {
  const files = await listFiles(root, signal);

  const identifierFileCounts = new Map<string, number>();

  const context: ProjectContext = {
    sourceFileCount: 0,
    identifierFileCounts,
    workspaceDirs: [],
    dynamicImports: [],
    scripts: [],
    ci: [],
    configs: [],
  };

  for (const file of files) {
    signal?.throwIfAborted();

    const name = posix.basename(file);
    const isSource = SOURCE_FILE.test(file);
    const isConfig = CONFIG_FILE.test(name);
    const isCi = CI_FILE.test(file);
    const isManifest = name === 'package.json';

    if (!isSource && !isConfig && !isCi && !isManifest) {
      continue;
    }

    const text = await readSmallFile(join(root, file));

    if (text === undefined) {
      continue;
    }

    if (isSource) {
      context.sourceFileCount++;

      for (const word of new Set(text.match(/[A-Za-z_$][\w$]*/g) ?? [])) {
        identifierFileCounts.set(word, (identifierFileCounts.get(word) ?? 0) + 1);
      }

      for (const prefix of extractDynamicImportPrefixes(text)) {
        context.dynamicImports.push({ file, prefix });
      }
    }

    if (isConfig) {
      context.configs.push({ source: file, text });
    }

    if (isCi) {
      context.ci.push({ source: file, text });
    }

    if (isManifest) {
      const dir = posix.dirname(file);
      context.workspaceDirs.push(dir === '.' ? '' : dir);

      try {
        const {
          scripts,
          dependencies: _dependencies,
          devDependencies: _devDependencies,
          peerDependencies: _peerDependencies,
          optionalDependencies: _optionalDependencies,
          ...rest
        } = JSON.parse(text) as Record<string, unknown>;

        if (scripts && typeof scripts === 'object') {
          context.scripts.push({
            source: file,
            text: Object.values(scripts).filter((s) => typeof s === 'string').join('\n'),
          });
        }

        // Inline tool config (`eslintConfig`, `prettier`, `babel`, `jest`) loads
        // plugins by name. Dependency lists are left out since they name every package.
        context.configs.push({ source: file, text: JSON.stringify(rest, null, 1) });
      } catch {
        // A malformed nested package.json shouldn't fail the scan.
      }
    }
  }

  return context;
}

export interface InstalledPackage {
  bins: string[];     // executables it installs, e.g. typescript -> ['tsc', 'tsserver']
  peers: string[];    // its peerDependencies
}

// Reads node_modules/<name>/package.json, from the workspace first, then the root.
export async function readInstalledPackage(
  root: string,
  workspaceDir: string,
  packageName: string,
): Promise<InstalledPackage | undefined> {
  for (const dir of new Set([join(root, workspaceDir), root])) {
    try {
      const manifest = JSON.parse(
        await readFile(join(dir, 'node_modules', packageName, 'package.json'), 'utf8'),
      ) as { bin?: unknown; peerDependencies?: unknown };

      const bins = typeof manifest.bin === 'string'
        ? [posix.basename(packageName)]
        : manifest.bin && typeof manifest.bin === 'object'
          ? Object.keys(manifest.bin)
          : [];

      const peers = manifest.peerDependencies && typeof manifest.peerDependencies === 'object'
        ? Object.keys(manifest.peerDependencies)
        : [];

      return { bins, peers };
    } catch {
      // Not installed here; try the next location.
    }
  }

  return undefined;
}

// Every package name a package.json declares, across all dependency sections.
export async function readDeclaredDependencies(root: string, manifest: string): Promise<string[]> {
  try {
    const json = JSON.parse(await readFile(join(root, manifest), 'utf8')) as Record<string, unknown>;

    return ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
      .flatMap((section) => {
        const deps = json[section];
        return deps && typeof deps === 'object' ? Object.keys(deps) : [];
      });
  } catch {
    return [];
  }
}
