import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { basename, dirname, join, sep } from 'node:path';
import semver from 'semver';
import type { Advisory, Finding, Footprint, Severity } from '../types';

// What removing unused packages actually takes out of node_modules: the packages
// themselves plus every dependency nothing else needs, their size on disk, and the
// known vulnerabilities among them. Works from the installed tree, so it follows
// npm/yarn hoisting and pnpm's symlinked store alike. Yarn PnP has no node_modules
// and gets no footprint.

export const SEVERITIES: readonly Severity[] = ['critical', 'high', 'moderate', 'low'];

// Installed packages that go away (the removed ones included), their size, and the
// known vulnerabilities among them.
export type RemovalFootprint = Footprint;

export interface Removal {
  id: string;                 // finding id
  manifestDir: string;        // project-relative dir of the declaring package.json
  name: string;
}

// Raw advisory as returned by the npm registry's bulk advisory endpoint.
interface RegistryAdvisory {
  severity?: string;
  title?: string;
  url?: string;
  vulnerable_versions?: string;
}

export type AdvisoryFetcher = (
  request: Record<string, string[]>,
  signal?: AbortSignal,
) => Promise<Record<string, RegistryAdvisory[]>>;

// The endpoint `npm audit` uses. It takes package names and versions, and answers
// with every advisory for those packages; versions are matched here.
const BULK_ADVISORY_URL = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk';
const ADVISORY_TIMEOUT_MS = 15_000;

export const fetchRegistryAdvisories: AdvisoryFetcher = async (request, signal) => {
  const timeout = AbortSignal.timeout(ADVISORY_TIMEOUT_MS);
  const response = await fetch(BULK_ADVISORY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });

  if (!response.ok) {
    throw new Error(`the npm registry answered ${response.status}`);
  }

  return await response.json() as Record<string, RegistryAdvisory[]>;
};

// Advisories per `name@version`, kept for the session so the review panel doesn't
// ask the registry again for what the scan already checked.
const advisoryCache = new Map<string, Advisory[]>();

interface InstalledNode {
  name: string;
  version: string;
  dir: string;                // real path
  local: boolean;             // a linked workspace or file: package, not from a registry
  deps: string[];             // real paths of resolved dependencies
}

async function readJson(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function names(manifest: Record<string, unknown>, sections: string[]): string[] {
  return sections.flatMap((section) => {
    const deps = manifest[section];
    return deps && typeof deps === 'object' ? Object.keys(deps) : [];
  });
}

const NODE_MODULES_SEGMENT = `${sep}node_modules${sep}`;

class InstalledTree {
  readonly nodes = new Map<string, InstalledNode>();
  private readonly resolved = new Map<string, string | undefined>();

  // Node's lookup: `<dir>/node_modules/<name>`, then each parent dir. Works for
  // pnpm too, because a package's real path sits next to its dependencies.
  async resolve(fromDir: string, name: string): Promise<string | undefined> {
    const cacheKey = `${fromDir}\0${name}`;

    if (this.resolved.has(cacheKey)) {
      return this.resolved.get(cacheKey);
    }

    let dir = fromDir;
    let found: string | undefined;

    for (;;) {
      if (basename(dir) !== 'node_modules') {
        try {
          const real = await realpath(join(dir, 'node_modules', name));

          if (await readJson(join(real, 'package.json'))) {
            found = real;
            break;
          }
        } catch {
          // Not installed at this level.
        }
      }

      const parent = dirname(dir);

      if (parent === dir) {
        break;
      }

      dir = parent;
    }

    this.resolved.set(cacheKey, found);
    return found;
  }

  // Loads `dir` and everything it depends on.
  async load(start: string, signal?: AbortSignal) {
    const queue = [start];

    while (queue.length > 0) {
      signal?.throwIfAborted();

      const dir = queue.pop()!;

      if (this.nodes.has(dir)) {
        continue;
      }

      const manifest = await readJson(join(dir, 'package.json')) ?? {};
      const node: InstalledNode = {
        name: typeof manifest.name === 'string' ? manifest.name : basename(dir),
        version: typeof manifest.version === 'string' ? manifest.version : '0.0.0',
        dir,
        local: !`${dir}${sep}`.includes(NODE_MODULES_SEGMENT),
        deps: [],
      };

      this.nodes.set(dir, node);

      // A linked workspace package declares its own dependencies in its own manifest.
      if (node.local) {
        continue;
      }

      for (const name of names(manifest, ['dependencies', 'optionalDependencies', 'peerDependencies'])) {
        const dep = await this.resolve(dir, name);

        if (dep) {
          node.deps.push(dep);
          queue.push(dep);
        }
      }
    }
  }

  reachable(starts: Iterable<string>): Set<string> {
    const seen = new Set<string>();
    const queue = [...starts];

    while (queue.length > 0) {
      const dir = queue.pop()!;

      if (seen.has(dir)) {
        continue;
      }

      seen.add(dir);
      queue.push(...(this.nodes.get(dir)?.deps ?? []));
    }

    return seen;
  }
}

// Size of a package's own files; nested node_modules are separate packages.
async function directorySize(dir: string, signal?: AbortSignal): Promise<number> {
  let total = 0;
  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    signal?.throwIfAborted();

    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') {
        total += await directorySize(path, signal);
      }
    } else if (entry.isFile()) {
      try {
        total += (await lstat(path)).size;
      } catch {
        // Vanished while measuring.
      }
    }
  }

  return total;
}

function toAdvisories(name: string, version: string, raw: RegistryAdvisory[]): Advisory[] {
  return raw
    .filter((advisory) => {
      try {
        return Boolean(advisory.vulnerable_versions) &&
          semver.satisfies(version, advisory.vulnerable_versions!, { includePrerelease: true });
      } catch {
        return false;
      }
    })
    .map((advisory) => ({
      package: name,
      version,
      severity: SEVERITIES.find((level) => level === advisory.severity) ?? 'low',
      title: advisory.title ?? 'Known vulnerability',
      url: advisory.url ?? '',
    }));
}

async function lookUpAdvisories(
  nodes: InstalledNode[],
  fetcher: AdvisoryFetcher,
  signal?: AbortSignal,
): Promise<void> {
  const request: Record<string, string[]> = {};

  for (const { name, version } of nodes) {
    if (!advisoryCache.has(`${name}@${version}`)) {
      request[name] = [...new Set([...(request[name] ?? []), version])];
    }
  }

  if (Object.keys(request).length === 0) {
    return;
  }

  const response = await fetcher(request, signal);

  for (const [name, versions] of Object.entries(request)) {
    for (const version of versions) {
      advisoryCache.set(`${name}@${version}`, toAdvisories(name, version, response[name] ?? []));
    }
  }
}

export function clearAdvisoryCache() {
  advisoryCache.clear();
}

export interface FootprintOptions {
  signal?: AbortSignal;
  fetchAdvisories?: AdvisoryFetcher | false;    // false: sizes only, no network
}

export interface FootprintResult {
  perRemoval: Map<string, RemovalFootprint>;    // what each removal takes out on its own
  combined: RemovalFootprint;                   // what removing all of them takes out
  warnings: string[];
}

const EMPTY: RemovalFootprint = { packages: 0, bytes: 0, advisories: [] };

// `projectRoot` is the project's install root; `manifestDirs` are every dir with a
// package.json in it (relative), since each one's dependencies keep packages alive.
export async function measureFootprints(
  projectRoot: string,
  manifestDirs: string[],
  removals: Removal[],
  { signal, fetchAdvisories = fetchRegistryAdvisories }: FootprintOptions = {},
): Promise<FootprintResult> {
  const warnings: string[] = [];
  const tree = new InstalledTree();

  // Every declared dependency is a root, remembered with the manifest that declares it.
  const roots: { manifestDir: string; name: string; dir: string }[] = [];

  for (const manifestDir of new Set(['', ...manifestDirs])) {
    const manifest = await readJson(join(projectRoot, manifestDir, 'package.json'));

    if (!manifest) {
      continue;
    }

    for (const name of names(manifest, ['dependencies', 'devDependencies', 'optionalDependencies'])) {
      const dir = await tree.resolve(join(projectRoot, manifestDir), name);

      if (dir) {
        roots.push({ manifestDir, name, dir });
        await tree.load(dir, signal);
      }
    }
  }

  if (roots.length === 0) {
    return { perRemoval: new Map(), combined: EMPTY, warnings };
  }

  const all = tree.reachable(roots.map((root) => root.dir));

  // What goes away when these (manifest, name) pairs are no longer declared.
  const goneWithout = (removed: Removal[]): Set<string> => {
    const isRemoved = (root: { manifestDir: string; name: string }) =>
      removed.some((removal) => removal.manifestDir === root.manifestDir && removal.name === root.name);
    const kept = tree.reachable(roots.filter((root) => !isRemoved(root)).map((root) => root.dir));

    return new Set([...all].filter((dir) => !kept.has(dir) && !tree.nodes.get(dir)?.local));
  };

  const combinedGone = goneWithout(removals);
  const perRemovalGone = new Map(removals.map((removal) => [removal.id, goneWithout([removal])]));

  const sizes = new Map<string, number>();

  for (const dir of combinedGone) {
    sizes.set(dir, await directorySize(dir, signal));
  }

  const goneNodes = [...combinedGone].map((dir) => tree.nodes.get(dir)!);
  let advisoriesKnown = false;

  if (fetchAdvisories && goneNodes.length > 0) {
    try {
      await lookUpAdvisories(goneNodes, fetchAdvisories, signal);
      advisoriesKnown = true;
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }

      warnings.push(`Couldn't check unused packages for known vulnerabilities (${(error as Error).message}). Sizes are still shown.`);
    }
  }

  const footprintOf = (gone: Set<string>): RemovalFootprint => ({
    packages: gone.size,
    bytes: [...gone].reduce((sum, dir) => sum + (sizes.get(dir) ?? 0), 0),
    advisories: advisoriesKnown
      ? [...gone].flatMap((dir) => {
        const { name, version } = tree.nodes.get(dir)!;
        return advisoryCache.get(`${name}@${version}`) ?? [];
      })
      : [],
  });

  return {
    perRemoval: new Map([...perRemovalGone].map(([id, gone]) => [id, footprintOf(gone)])),
    combined: footprintOf(combinedGone),
    warnings,
  };
}

// Sum of the findings' own footprints. A dependency shared only by several of them
// isn't in any single one's footprint, so this can understate but never overstates.
export function totalFootprint(findings: Finding[]): Footprint {
  return findings.reduce<Footprint>(
    (total, finding) => ({
      packages: total.packages + (finding.footprint?.packages ?? 0),
      bytes: total.bytes + (finding.footprint?.bytes ?? 0),
      advisories: [...total.advisories, ...(finding.footprint?.advisories ?? [])],
    }),
    { packages: 0, bytes: 0, advisories: [] },
  );
}

export function countBySeverity(advisories: Advisory[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, moderate: 0, low: 0 };

  for (const advisory of advisories) {
    counts[advisory.severity]++;
  }

  return counts;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }

  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

// "2 vulnerabilities (1 critical, 1 high)".
export function describeAdvisories(advisories: Advisory[]): string {
  if (advisories.length === 0) {
    return 'no known vulnerabilities';
  }

  const counts = countBySeverity(advisories);
  const parts = SEVERITIES.filter((level) => counts[level] > 0).map((level) => `${counts[level]} ${level}`);

  return `${advisories.length} known ${advisories.length === 1 ? 'vulnerability' : 'vulnerabilities'} (${parts.join(', ')})`;
}
