# 💀 Deadweight

> **Your codebase has deadweight. Deadweight finds it.**

Deadweight is a developer-focused VS Code extension designed to identify **unused dependencies, dead files, unused exports and unnecessary project bloat** so developers can keep their codebases clean, lightweight, and maintainable.

Built for developers who want to know **what their project actually needs — and what is just taking up space.**

---

## 🚨 The Problem

Modern projects accumulate technical clutter surprisingly fast.

You install a package for a feature that gets removed.
You create a utility file that stops being used.
You leave behind dependencies from an old implementation.

Over time, these become **deadweight**.

This leads to:

* 📦 Unnecessary dependencies
* 🗂️ Unused files
* 🐌 Larger projects
* 🔍 Harder codebase navigation
* 🧩 Dependency maintenance overhead
* ⚠️ Increased technical debt

The problem isn't creating code.

**The problem is knowing what you no longer need.**

---

## 💡 The Solution

Deadweight analyzes your project and shows you, inside the editor, exactly what is dead — with a **safe-to-delete score** and the evidence behind it.

```text
Project
 ├── Used Dependency        ✅
 ├── Used File              ✅
 ├── Unused Dependency      💀  score 98 · "no import found; depcheck and the graph agree"
 ├── Unreferenced File      💀  score 98 · "nothing imports this file"
 ├── Unused Export          💀  score 98 · "exported, but no file imports it"
 └── Plugin loaded at runtime ⚠️  score 39 · "may be loaded by a computed import" (never pre-checked)
```

The goal is simple:

> **Detect → Review → Remove → (Undo)**

---

## ✨ Features

### 📦 Unused Dependency Detection
Packages in `package.json` that nothing imports, runs or configures.

### 🗂️ Dead File Detection
Files no entry point can reach — including files only imported by other dead files.

### 🧩 Unused Export Detection
Exported functions, classes, constants and types that no file imports. Click one to jump straight to its line.

### 🎯 Safe-to-Delete Score (0–100)
Every finding gets a score built from evidence, not guesses:

| Evidence | Effect on the score |
|---|---|
| Independent engines agree it's unused (knip, depcheck, Deadweight's own graph) | ⬆️ raises it |
| Loaded by a computed `import()` / `require(x)` | ⬇️ low |
| Referenced by path or name in a config file, npm script or CI | ⬇️ lower |
| Plugin / preset / `@types` package, barrel file, monorepo package | ⬇️ lower |

**80+ = high** (pre-checked for removal) · **50–79 = medium** · **below 50 = low**. Hover any finding to read exactly why it scored what it did. No AI, no API key, and your code never leaves your machine.

### 🕸️ Connection Graph
An interactive map of how every file and package connects — entry points, used, *maybe* and unused — built in milliseconds, fully offline. Search a file, click it to see **Imported by** and **Imports**, or switch to a tree view from the entry points.

### 🛡️ Safe Cleanup with Undo
**Review & Remove** previews the exact uninstall command and the `package.json` diff before anything happens. Packages are uninstalled with your package manager (npm, yarn, pnpm or bun); files move to `.deadweight-trash/` — **never deleted**. One click on **Undo** restores the files and reinstalls the packages at their exact previous versions.

### ⚡ Stays Out of the Way
Nothing runs until you ask. No startup scanning, no editor slowdown.

---

## 🚀 Using Deadweight

1. Open a JavaScript or TypeScript project (a folder with a `package.json`).
2. Click the **Deadweight** icon in the activity bar.
3. Click **Scan Workspace**, or **Show Connection Graph** for the instant offline map.
4. Review the findings — high-score items are pre-checked. Hover for the reasons.
5. Click **Review & Remove**, check the preview, confirm.
6. Changed your mind? Click **Undo**, or run **Deadweight: Restore from Trash** later.

### Commands

| Command | What it does |
|---|---|
| `Deadweight: Scan for unused code` | Find unused packages, files and exports |
| `Deadweight: Show Connection Graph` | Open the interactive file & package graph |
| `Deadweight: Review & Remove` | Preview and remove the checked findings |
| `Deadweight: Restore from Trash` | Undo any earlier removal |

### Settings

| Setting | Default | Description |
|---|---|---|
| `deadweight.exclude` | `[]` | `.gitignore`-style patterns for files or packages to leave out of results |
| `deadweight.entryPoints` | `[]` | Extra entry-point globs, e.g. `scripts/*.js` |
| `deadweight.minimumConfidence` | `low` | Hide findings below this confidence |
| `deadweight.packageManager` | `auto` | Force npm, yarn, pnpm or bun |

### Requirements

* VS Code 1.90 or newer (also works in Cursor, Windsurf and VSCodium via Open VSX)
* Node.js and npm on your `PATH` — the scan runs [knip](https://knip.dev) and [depcheck](https://github.com/depcheck/depcheck) through `npx`, so the first scan needs an internet connection
* The Connection Graph works fully offline

---

## 🧠 How It Works

```text
              ┌─────────────┐
              │   Project   │
              └──────┬──────┘
                     │
      ┌──────────────┼──────────────┐
      ▼              ▼              ▼
    knip         depcheck     Deadweight graph
 (files, deps,  (second opinion (own import graph:
   exports)      on packages)   entry points → reachability)
      │              │              │
      └──────────────┼──────────────┘
                     ▼
         Safe-to-delete score + reasons
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
      ✅ Required          💀 Deadweight
                                │
                   Review → Remove → Undo
```

Deadweight's own graph finds entry points (`main`/`bin`/`exports`, framework conventions for Next.js, Nuxt, SvelteKit, Remix, Astro and more, npm scripts, CI, config files and tests), resolves every import (relative paths, `index` files, tsconfig/jsconfig aliases, monorepo packages) and walks from the entry points. When independent engines agree, the score goes up; anything they can't prove lowers it.

---

## 🛠️ Tech Stack

* **VS Code Extension API**
* **TypeScript**
* **Node.js**
* **knip** and **depcheck** for detection, **Cytoscape.js** for the graph

---

## 🧪 Development

```bash
git clone https://github.com/Kalyan-github-4/deadweight.git
cd deadweight
npm install
npm run compile
```

Then press **F5** in VS Code to launch an **Extension Development Host** with Deadweight loaded.

```bash
npm run test:unit   # unit tests, including the zero-false-positive release gate
npm run vsix        # build deadweight-<version>.vsix
```

---

## 🗺️ Roadmap

* [x] Unused dependency detection
* [x] Dead-file analysis
* [x] Unused export detection
* [x] Dependency graph visualization
* [x] One-click cleanup with undo
* [x] Configurable safety rules
* [x] Framework-specific analysis
* [ ] Full monorepo support (cross-workspace verification)
* [ ] Dead code detection inside functions
* [ ] CI/CD integration
* [ ] Bundled engines for faster, fully offline scans

---

## 🔐 Safety Philosophy

Deadweight should **never encourage developers to blindly delete code**.

A file or dependency can appear unused while still being required through:

* Dynamic imports
* Configuration
* Build tooling
* Runtime behavior
* Framework conventions
* External consumers

That's why Deadweight is an **analysis and decision tool**, not an auto-deleter: every finding explains itself, uncertain items are never pre-checked, nothing is removed without a preview, files go to a trash folder instead of being deleted, and every removal can be undone.

---

## 📄 License

[MIT](LICENSE) © Kalyan Manna
