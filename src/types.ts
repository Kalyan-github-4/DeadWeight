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

// One database's record that a package version is malware.
export interface MalwareReport {
  id: string;             // GHSA-… (GitHub advisory database) or MAL-… (OpenSSF, via OSV)
  title: string;
  url: string;
}

// An installed package version that is known malware, used or not.
export interface MaliciousPackage {
  name: string;
  version: string;
  direct: boolean;        // declared in a package.json, not only pulled in by another package
  via: string[];          // the declared dependencies that install it
  project?: string;       // folder-relative project dir, when several were scanned
  reports: MalwareReport[];
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
  malware?: MaliciousPackage[];   // known malware among the installed packages; undefined: not checked
}
