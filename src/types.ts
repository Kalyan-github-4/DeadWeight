export type Confidence = 'high' | 'medium' | 'low';

export type Severity = 'critical' | 'high' | 'moderate' | 'low';

// A known vulnerability in an installed package (from the npm advisory database).
export interface Advisory {
  package: string;
  version: string;
  severity: Severity;
  title: string;
  url: string;
}

// What removing packages takes out of node_modules, transitive dependencies included.
export interface Footprint {
  packages: number;
  bytes: number;
  advisories: Advisory[];
}

export interface Finding {
  id: string;
  kind: 'package' | 'file' | 'export';
  name: string;           // package name, workspace-relative path, or exported symbol
  confidence: Confidence;
  score: number;          // 0-100 safe-to-delete score; `confidence` is its band
  reason: string;
  sizeBytes?: number;
  footprint?: Footprint;  // packages: what removing this one takes out of node_modules
  workspace?: string;
  file?: string;          // exports: workspace-relative path of the declaring file
  line?: number;          // exports: 1-based position of the declaration
  column?: number;
}

export interface ScanResult {
  findings: Finding[];
  scannedFileCount: number;
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun';
  durationMs: number;
  warnings: string[];
  projects?: string[];    // folder-relative project dirs scanned ('' is the folder itself)
  footprint?: Footprint;  // what removing every unused package takes out of node_modules
}
