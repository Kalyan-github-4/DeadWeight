# Change Log

All notable changes to Deadweight are documented here.

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
