import * as vscode from 'vscode';
import type { PackageManager } from '../engine/packageManager';
import type { Confidence } from '../types';

// The `deadweight.*` settings contributed in package.json (PRD R3.5).
export interface DeadweightSettings {
  exclude: string[];
  entryPoints: string[];
  minimumConfidence: Confidence;
  packageManager?: PackageManager;    // undefined means detect from the lockfile
}

const CONFIDENCES: readonly Confidence[] = ['low', 'medium', 'high'];
const PACKAGE_MANAGERS: readonly PackageManager[] = ['npm', 'yarn', 'pnpm', 'bun'];

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function readSettings(scope?: vscode.ConfigurationScope): DeadweightSettings {
  const config = vscode.workspace.getConfiguration('deadweight', scope);
  const minimumConfidence = config.get<string>('minimumConfidence');
  const packageManager = config.get<string>('packageManager');

  return {
    exclude: stringList(config.get('exclude')),
    entryPoints: stringList(config.get('entryPoints')),
    minimumConfidence: CONFIDENCES.find((level) => level === minimumConfidence) ?? 'low',
    packageManager: PACKAGE_MANAGERS.find((manager) => manager === packageManager),
  };
}
