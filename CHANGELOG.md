# Change Log

All notable changes to Deadweight are documented here.

## [0.0.5] - 2026-09-12

- **PR guard (GitHub Action)**: `uses: Kalyan-github-4/DeadWeight@v1` scans each pull request and its base branch and comments with only the unused files, packages and exports the PR adds, with scores, reasons and known vulnerabilities. One comment, updated on every push; inline warnings on the diff; a job summary and outputs; optional `fail-on: new | new-high`.
- **MCP server for AI agents**: Copilot, Claude Code, Cursor and other agents can query the project's connection graph through five tools (`project_map`, `file_info`, `blast_radius`, `import_path`, `find_unused`) instead of reading files. Copilot in VS Code 1.101+ finds it automatically; **Deadweight: Connect AI Agents (MCP)** sets up Claude Code and Cursor or copies a config for any other agent. Runs offline.
- **Blast radius**: right-click a file → **Show Blast Radius** lists every file that depends on it, directly or through others, and the entry points affected. The graph's details panel shows it too, with **Highlight what it can break**.

## [0.0.4] - 2026-09-12

- **Delete a vulnerability**: every unused package now shows what removing it takes out of `node_modules` (the package plus dependencies nothing else needs, for npm, yarn and pnpm) and the known vulnerabilities in it, from the npm advisory database. The scan summary, the tree, the Review & Remove panel and the success message all show the gain, e.g. *"frees 84 MB and 3 known vulnerabilities (1 critical, 2 high)"*. Setting `deadweight.checkVulnerabilities` turns the lookup off; sizes are always measured locally.
- **Verified removal**: Review & Remove runs the project's own type check, `build` and `test` scripts before and after removing. If a check that passed before fails after, the removal is undone automatically, the likely cause is read from the error output, and that item is marked as in use in every later scan. Choose checks per removal in the panel; settings `deadweight.verifyRemovals` and `deadweight.verifyTimeoutMinutes`.
- **Move around the graph freely**: drag the background or folder boxes, scroll or swipe in any direction, Ctrl + scroll or pinch to zoom, Space + drag or middle-button drag over nodes, arrow keys and + / −.

## [0.0.3] - 2026-09-11

- **Scan from any folder**: opening a parent folder (no `package.json` at the top) no longer fails. Deadweight finds every project inside it and scans them all, up to 8 without asking, and lets you pick when there are more. Removal, undo and the package manager work per project.
- **Export Project Map for AI Agents**: a compact Markdown (or JSON) map of every file, its imports, entry points and unused code, typically 20–30× smaller than the source. Copy it into any chat, save it to `.deadweight/project-map.md`, or link it from `AGENTS.md` / `CLAUDE.md` / Copilot instructions so coding agents read it first. A saved map refreshes whenever the graph is rebuilt. Also available as **Export for AI** in the Connection Graph.
- **Clearer connections in the graph**: edges use the theme's text color, are thicker with larger arrows, draw above folder boxes and stay visible when zoomed out. Selecting a node colors what it imports (blue) and what imports it (orange).

## [0.0.2] - 2026-09-11

- **Redesigned Connection Graph**: a clean top bar with search (`/`), a Clusters / Tree layout switch and folder grouping; status chips that double as filters (hidden neighbours of dead files stay visible as faint context); hover tooltips; floating zoom controls and legend; a details panel with a "Why" explanation, **Open file** / **Focus** buttons and clickable *Imported by* / *Imports* lists. Filters and layout are remembered.
- Keyboard shortcuts in the graph: `/` search, `Enter` next match, `Esc` clear, `F` fit.
- Complete README with a step-by-step user guide, score explanation, graph guide and FAQ.

## [0.0.1] - 2026-09-11

First public release.

- **Scan** for unused packages, dead files and unused exports (functions, classes, constants, types), powered by knip, depcheck and Deadweight's own connection graph.
- **Safe-to-delete score (0–100)** on every finding, with the evidence behind it. Only high-scoring packages and files are pre-checked.
- **Connection Graph**: an interactive, offline map of how every file and package connects, with entry points, used, maybe and unused nodes.
- **Review & Remove**: preview the exact uninstall command and package.json diff, then remove in one click. Files move to `.deadweight-trash/`, never deleted.
- **Undo** and **Restore from Trash**: put files back and reinstall packages at their exact previous versions.
- Editor decorations for unused files and exports, and settings for exclude patterns, extra entry points, minimum confidence and package manager.
