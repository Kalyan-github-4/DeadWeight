# Change Log

All notable changes to Deadweight are documented here.

## [0.0.1] - 2026-09-11

First public release.

- **Scan** for unused packages, dead files and unused exports (functions, classes, constants, types), powered by knip, depcheck and Deadweight's own connection graph.
- **Safe-to-delete score (0–100)** on every finding, with the evidence behind it. Only high-scoring packages and files are pre-checked.
- **Connection Graph**: an interactive, offline map of how every file and package connects, with entry points, used, maybe and unused nodes.
- **Review & Remove**: preview the exact uninstall command and package.json diff, then remove in one click. Files move to `.deadweight-trash/`, never deleted.
- **Undo** and **Restore from Trash**: put files back and reinstall packages at their exact previous versions.
- Editor decorations for unused files and exports, and settings for exclude patterns, extra entry points, minimum confidence and package manager.
