# 💀 Deadweight

> **Your codebase has deadweight. Deadweight finds it.**

Deadweight is a developer-focused VS Code extension designed to identify **unused dependencies, dead files, and unnecessary project bloat** so developers can keep their codebases clean, lightweight, and maintainable.

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

Deadweight analyzes your project and helps identify potentially unnecessary code and dependencies.

Instead of manually searching through a project, developers can use Deadweight to quickly discover:

```text
Project
 ├── Used Dependency        ✅
 ├── Used File              ✅
 ├── Unused Dependency      💀
 ├── Unreferenced File      💀
 └── Dead Code              💀
```

The goal is simple:

> **Detect → Review → Remove**

Deadweight focuses on **safe cleanup**, giving developers visibility before anything is removed.

---

## ✨ Features

### 📦 Unused Dependency Detection

Identify packages that may no longer be required by your project.

### 🗂️ Dead File Detection

Find files that appear to have no references or usage within the project.

### 🔍 Codebase Analysis

Scan the project structure and analyze relationships between files and dependencies.

### 🛡️ Safe Cleanup

Deadweight is designed around **developer review before removal**, rather than blindly deleting project files.

### ⚡ Developer-First Workflow

Built directly into VS Code so cleanup can happen without leaving the editor.

---

## 🧠 How It Works

At a high level, Deadweight works by analyzing your project as a dependency graph.

```text
              ┌─────────────┐
              │   Project   │
              └──────┬──────┘
                     │
          ┌──────────┴──────────┐
          │                     │
     Source Files          Dependencies
          │                     │
          ▼                     ▼
    Import / Usage       Package Analysis
          │                     │
          └──────────┬──────────┘
                     ▼
              Deadweight Scan
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
      ✅ Required          💀 Deadweight
```

Deadweight identifies items that appear disconnected from the active project and presents them for developer review.

---

## 🛠️ Tech Stack

* **VS Code Extension API**
* **TypeScript / JavaScript**
* **Node.js**
* **VS Code Extension Development Tools**

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Kalyan-github-4/deadweight.git
cd deadweight
```

### 2. Install dependencies

```bash
npm install
```

### 3. Open the project in VS Code

```bash
code .
```

### 4. Start the extension

Press:

```text
F5
```

This launches a new **Extension Development Host** window where Deadweight can be tested.

---

## 🧪 Development

Run the extension locally using the VS Code Extension Development Host.

Typical development workflow:

```bash
npm install
npm run compile
```

Then press `F5` inside VS Code.

---

## 🗺️ Roadmap

Deadweight is still evolving.

Planned improvements include:

* [ ] Better unused dependency detection
* [ ] Improved dead-file analysis
* [ ] Unused export detection
* [ ] Dead code detection
* [ ] Dependency graph visualization
* [ ] One-click cleanup suggestions
* [ ] Configurable safety rules
* [ ] Monorepo support
* [ ] Framework-specific analysis
* [ ] CI/CD integration
* [ ] Extension Marketplace release

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

That's why Deadweight is intended to act as an **analysis and decisi**
