import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Finding, ScanResult } from '../types';
import { scoreFindings, type PackageInfo } from './confidence';
import { runDepcheck, type DepcheckResult } from './depcheck';
import { CancelledError } from './exec';
import { filterFindings } from './filters';
import { buildConnectionGraph, type ConnectionGraph } from './graph';
import { runKnip, type KnipOptions, type KnipScanResult } from './knip';
import { detectPackageManager, type PackageManager } from './packageManager';
import { collectProjectContext, readDeclaredDependencies, readInstalledPackage } from './project';

// For each package finding: the executables it installs, and which other declared
// dependency (if any) needs it as a peer. Both come from node_modules.
async function readPackageInfo(
  workspaceRoot: string,
  findings: Finding[],
): Promise<Map<string, PackageInfo>> {
  const info = new Map<string, PackageInfo>();
  const peerOwners = new Map<string, Map<string, string>>(); // workspace -> peer -> owner

  for (const finding of findings) {
    if (finding.kind !== 'package') {
      continue;
    }

    const workspace = finding.workspace ?? '';

    if (!peerOwners.has(workspace)) {
      const owners = new Map<string, string>();
      const declared = await readDeclaredDependencies(workspaceRoot, join(workspace, 'package.json'));

      for (const dependency of declared) {
        const installed = await readInstalledPackage(workspaceRoot, workspace, dependency);

        for (const peer of installed?.peers ?? []) {
          if (!owners.has(peer)) {
            owners.set(peer, dependency);
          }
        }
      }

      peerOwners.set(workspace, owners);
    }

    const installed = await readInstalledPackage(workspaceRoot, workspace, finding.name);

    info.set(finding.id, {
      bins: installed?.bins ?? [],
      peerOf: peerOwners.get(workspace)?.get(finding.name),
    });
  }

  return info;
}

// The external analysers. Tests swap these for the locally installed binaries.
export interface ScanEngines {
  runKnip: (workspaceRoot: string, options: KnipOptions) => Promise<KnipScanResult>;
  runDepcheck: (workspaceRoot: string, signal?: AbortSignal) => Promise<DepcheckResult>;
}

const defaultEngines: ScanEngines = { runKnip, runDepcheck };

export interface ScanOptions {
  signal?: AbortSignal;
  engines?: ScanEngines;
  exclude?: string[];                   // globs for files/packages to leave out of results
  entryPoints?: string[];               // extra entry globs, passed to knip
  packageManager?: PackageManager;      // overrides lockfile detection
}

export async function scanWorkspace(
  workspaceRoot: string,
  {
    signal,
    engines = defaultEngines,
    exclude = [],
    entryPoints = [],
    packageManager,
  }: ScanOptions = {},
): Promise<ScanResult> {
  if (!existsSync(join(workspaceRoot, 'package.json'))) {
    throw new Error(
      `No package.json found in ${workspaceRoot}. Deadweight scans JavaScript/TypeScript projects. Open the folder that contains package.json.`,
    );
  }

  const startedAt = Date.now();

  // One failure (or the user's cancel) stops every child process.
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });

  const stopOthersOnFailure = <T>(task: Promise<T>): Promise<T> =>
    task.catch((error: unknown): never => {
      controller.abort();
      throw error;
    });

  // depcheck is only a second opinion: its failure becomes a warning, not a failed scan.
  const depcheckTask = engines.runDepcheck(workspaceRoot, controller.signal).catch(
    (error: unknown): Error => {
      if (error instanceof CancelledError) {
        throw error;
      }

      return error instanceof Error ? error : new Error(String(error));
    },
  );

  // Deadweight's own graph is an independent second opinion. Like depcheck, its
  // failure only weakens the scores; it never fails the scan.
  const graphTask = buildConnectionGraph(workspaceRoot, { signal: controller.signal, entryPoints }).catch(
    (error: unknown): Error => {
      if (error instanceof CancelledError || controller.signal.aborted) {
        throw new CancelledError('Scan cancelled.');
      }

      return error instanceof Error ? error : new Error(String(error));
    },
  );

  try {
    const [knip, depcheck, context, graph] = await Promise.all([
      stopOthersOnFailure(engines.runKnip(workspaceRoot, { signal: controller.signal, entryPoints })),
      stopOthersOnFailure<DepcheckResult | Error>(depcheckTask),
      stopOthersOnFailure(collectProjectContext(workspaceRoot, controller.signal)),
      stopOthersOnFailure<ConnectionGraph | Error>(graphTask),
    ]);

    const warnings = [...knip.warnings];
    let depcheckUnused: Set<string> | undefined;

    if (depcheck instanceof Error) {
      warnings.push(
        `depcheck couldn't run, so package confidence is capped at medium: ${depcheck.message}`,
      );
    } else {
      depcheckUnused = depcheck.unused;
      warnings.push(...depcheck.warnings);
    }

    if (graph instanceof Error) {
      warnings.push(`Deadweight's connection graph couldn't be built, so scores rely on knip alone: ${graph.message}`);
    }

    const findings = filterFindings(knip.findings, { exclude, entryPoints });
    const packageInfo = await readPackageInfo(workspaceRoot, findings);

    return {
      findings: scoreFindings(findings, {
        context,
        unresolvedFiles: knip.unresolvedFiles,
        depcheckUnused,
        packageInfo,
        graph: graph instanceof Error ? undefined : new Map(graph.nodes.map((node) => [node.id, node])),
      }),
      scannedFileCount: context.sourceFileCount,
      packageManager: packageManager ?? detectPackageManager(workspaceRoot),
      durationMs: Date.now() - startedAt,
      warnings,
    };
  } catch (error) {
    // The walk throws the signal's own reason on abort; normalise it.
    if (signal?.aborted) {
      throw new CancelledError('Scan cancelled.');
    }

    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}
