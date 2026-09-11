export type Confidence = 'high' | 'medium' | 'low';

export interface Finding {
  id: string;
  kind: 'package' | 'file' | 'export';
  name: string;           // package name, workspace-relative path, or exported symbol
  confidence: Confidence;
  score: number;          // 0-100 safe-to-delete score; `confidence` is its band
  reason: string;
  sizeBytes?: number;
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
}
