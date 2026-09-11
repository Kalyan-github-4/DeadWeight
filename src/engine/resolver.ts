import { builtinModules } from 'node:module';
import { posix } from 'node:path';

// Resolves import specifiers to workspace files or package names, against an
// in-memory list of the workspace's files (no filesystem calls per import).

export const RESOLVE_EXTENSIONS = [
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '.astro', '.json',
];

// TypeScript ESM code imports './a.js' for a file that is really './a.ts'.
const JS_TO_TS: Record<string, string[]> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
};

const BUILTINS = new Set(builtinModules);

// `@/x`, `~/x`, `#x`, `$lib/x`: path aliases. Unresolved ones are not packages.
const ALIAS_LIKE = /^(?:@\/|~|#|\$)/;

export type Resolution =
  | { kind: 'file'; path: string }
  | { kind: 'package'; name: string }
  | { kind: 'builtin' }
  | { kind: 'asset' }           // exists but isn't code (css, images, ...)
  | { kind: 'unresolved' };

export interface PathAliases {
  baseUrl?: string;                                   // workspace-relative
  paths: { pattern: string; targets: string[] }[];    // targets workspace-relative, may contain '*'
}

export interface WorkspacePackage {
  dir: string;                              // workspace-relative, '' for the root
  manifest: Record<string, unknown>;
}

export function packageNameOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

// String entry points a package.json declares: main, module, exports, bin, ...
export function manifestEntryPaths(manifest: Record<string, unknown>): string[] {
  const paths: string[] = [];

  const collect = (value: unknown) => {
    if (typeof value === 'string') {
      paths.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(collect);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(collect);
    }
  };

  for (const field of ['source', 'main', 'module', 'browser', 'exports', 'bin']) {
    collect(manifest[field]);
  }

  // `exports` patterns like "./*" aren't files.
  return paths.filter((path) => !path.includes('*'));
}

export class Resolver {
  constructor(
    private readonly files: Set<string>,
    private readonly aliases: Map<string, PathAliases>,        // keyed by config dir
    private readonly workspacePackages: Map<string, WorkspacePackage>,   // keyed by package name
  ) {}

  resolve(fromFile: string, rawSpecifier: string): Resolution {
    const specifier = rawSpecifier.split(/[?#]/)[0];   // vite-style `?raw`, `?url`

    if (!specifier) {
      return { kind: 'unresolved' };
    }

    if (specifier.startsWith('node:') || BUILTINS.has(specifier) || BUILTINS.has(packageNameOf(specifier))) {
      return { kind: 'builtin' };
    }

    if (specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../')) {
      return this.resolvePath(posix.join(posix.dirname(fromFile), specifier)) ?? { kind: 'unresolved' };
    }

    if (specifier.startsWith('/')) {
      return this.resolvePath(specifier.slice(1)) ?? { kind: 'unresolved' };
    }

    const aliases = this.nearestAliases(posix.dirname(fromFile));

    if (aliases) {
      for (const { pattern, targets } of aliases.paths) {
        const captured = matchPattern(pattern, specifier);

        if (captured === undefined) {
          continue;
        }

        for (const target of targets) {
          const hit = this.resolvePath(target.replace('*', captured));

          if (hit) {
            return hit;
          }
        }
      }

      if (aliases.baseUrl !== undefined) {
        const hit = this.resolvePath(posix.join(aliases.baseUrl, specifier));

        if (hit) {
          return hit;
        }
      }
    }

    const name = packageNameOf(specifier);
    const local = this.workspacePackages.get(name);

    if (local) {
      const subpath = specifier.slice(name.length + 1);
      const hit = subpath
        ? this.resolvePath(posix.join(local.dir, subpath))
        : this.resolvePackageEntry(local);

      return hit ?? { kind: 'package', name };
    }

    if (ALIAS_LIKE.test(specifier)) {
      return { kind: 'unresolved' };
    }

    return { kind: 'package', name };
  }

  // A path relative to the workspace root, with or without extension, or a directory.
  resolvePath(rawPath: string): Resolution | undefined {
    const path = posix.normalize(rawPath).replace(/^\.\//, '').replace(/\/$/, '');

    if (path.startsWith('..')) {
      return undefined;
    }

    if (this.files.has(path)) {
      return RESOLVE_EXTENSIONS.includes(posix.extname(path)) || /\.[cm]?[jt]sx?$/.test(path)
        ? { kind: 'file', path }
        : { kind: 'asset' };
    }

    const extension = posix.extname(path);

    for (const replacement of JS_TO_TS[extension] ?? []) {
      const candidate = path.slice(0, -extension.length) + replacement;

      if (this.files.has(candidate)) {
        return { kind: 'file', path: candidate };
      }
    }

    for (const candidateExtension of RESOLVE_EXTENSIONS) {
      if (this.files.has(path + candidateExtension)) {
        return { kind: 'file', path: path + candidateExtension };
      }
    }

    const dir = path === '.' ? '' : path;

    for (const candidateExtension of RESOLVE_EXTENSIONS) {
      const index = posix.join(dir, `index${candidateExtension}`);

      if (this.files.has(index)) {
        return { kind: 'file', path: index };
      }
    }

    return undefined;
  }

  resolvePackageEntry(local: WorkspacePackage): Resolution | undefined {
    for (const entry of manifestEntryPaths(local.manifest)) {
      const hit = this.resolvePath(posix.join(local.dir, entry));

      if (hit?.kind === 'file') {
        return hit;
      }
    }

    return this.resolvePath(posix.join(local.dir, 'src/index')) ?? this.resolvePath(posix.join(local.dir, 'index'));
  }

  private nearestAliases(dir: string): PathAliases | undefined {
    let current = dir === '.' ? '' : dir;

    for (;;) {
      const found = this.aliases.get(current);

      if (found) {
        return found;
      }

      if (current === '') {
        return undefined;
      }

      const parent = posix.dirname(current);
      current = parent === '.' ? '' : parent;
    }
  }
}

// tsconfig `paths` matching: 'exact' or 'prefix*suffix'. Returns the '*' capture.
function matchPattern(pattern: string, specifier: string): string | undefined {
  const star = pattern.indexOf('*');

  if (star === -1) {
    return pattern === specifier ? '' : undefined;
  }

  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);

  if (specifier.length >= prefix.length + suffix.length && specifier.startsWith(prefix) && specifier.endsWith(suffix)) {
    return specifier.slice(prefix.length, specifier.length - suffix.length);
  }

  return undefined;
}

// JSON with comments and trailing commas, as tsconfig allows.
export function parseJsonc(text: string): unknown {
  let out = '';
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (char === '"') {
      let j = i + 1;

      while (j < text.length && text[j] !== '"') {
        j += text[j] === '\\' ? 2 : 1;
      }

      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (char === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end;
    } else if (char === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
    } else {
      out += char;
      i++;
    }
  }

  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

// Reads `compilerOptions.baseUrl` / `paths` from a tsconfig/jsconfig, following
// relative `extends`. `readConfig` returns a config file's text, or undefined.
export function loadPathAliases(
  configPath: string,
  readConfig: (path: string) => string | undefined,
  depth = 0,
): PathAliases | undefined {
  const text = readConfig(configPath);

  if (text === undefined || depth > 5) {
    return undefined;
  }

  let config: { extends?: unknown; compilerOptions?: { baseUrl?: unknown; paths?: unknown } };

  try {
    config = parseJsonc(text) as typeof config;
  } catch {
    return undefined;
  }

  const dir = posix.dirname(configPath) === '.' ? '' : posix.dirname(configPath);

  const inherited = typeof config.extends === 'string' && config.extends.startsWith('.')
    ? loadPathAliases(
      posix.join(dir, config.extends.endsWith('.json') ? config.extends : `${config.extends}.json`),
      readConfig,
      depth + 1,
    )
    : undefined;

  const options = config.compilerOptions ?? {};
  const baseUrl = typeof options.baseUrl === 'string' ? posix.join(dir, options.baseUrl) : inherited?.baseUrl;

  if (!options.paths || typeof options.paths !== 'object') {
    return inherited || baseUrl !== undefined ? { baseUrl, paths: inherited?.paths ?? [] } : undefined;
  }

  // Since TS 4.1, `paths` without `baseUrl` resolve against the config's directory.
  const pathsBase = baseUrl ?? dir;
  const paths = Object.entries(options.paths as Record<string, unknown>).map(([pattern, targets]) => ({
    pattern,
    targets: (Array.isArray(targets) ? targets : [])
      .filter((target): target is string => typeof target === 'string')
      .map((target) => posix.join(pathsBase, target)),
  }));

  return { baseUrl, paths };
}
