// The connection graph's data shape, shared by the engine (Node) and the graph
// webview (browser). Keep this file free of imports.

export type NodeStatus = 'entry' | 'used' | 'maybe' | 'unused';

export type EdgeKind = 'static' | 'type' | 'require' | 'dynamic' | 'config' | 'maybe';

export interface GraphNode {
  id: string;                   // 'file:<path>' or 'package:<name>'
  kind: 'file' | 'package';
  label: string;
  path?: string;                // files: workspace-relative posix path
  workspace: string;            // workspace dir, '' for the root
  status: NodeStatus;
  reason: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface ConnectionGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  unresolved: { file: string; specifier: string }[];
  stats: {
    files: number;
    entries: number;
    used: number;
    maybe: number;
    unused: number;
    packages: number;
    unusedPackages: number;
  };
  durationMs: number;
}
