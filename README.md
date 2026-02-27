# Codebase Complexity Visualizer (CCV)

Local-first desktop app to analyze repository complexity, dependency risk, and architectural hotspots.

- macOS app (Tauri + React)
- Offline analysis
- No source-code upload
- No telemetry

## Current Features

### Analyzer Engine

- Recursive repository scan with exclude patterns
- Supported languages: `js`, `ts`, `java`, `py`, `php`, `css`, `html`
- Import/dependency extraction per language
- Internal dependency graph + external dependency tracking
- SCC detection (Tarjan) for cycle analysis
- Per-file metrics:
  - `loc` (non-empty trimmed lines)
  - `complexity` (approximate cyclomatic complexity)
  - `fanIn`, `fanOut`
  - `inCycle`
  - `riskScore`

### Desktop App

- Project picker with recent projects
- Analysis runner with live logs
- Dashboard tabs:
  - `Overview`: treemap heatmap + top risky files
  - `Structural`: architecture layers + dependency graph
  - `Deep Analysis`: what-if weights + scatter plot + cycle explainer
  - `Experimental`: risk radar + optional 3D city view
  - `Info`: exact metric/risk formulas and live calculation details
- File detail drawer (click from any view)
- Settings persisted in local SQLite (`ccv.db`)

### Risk Formula

```text
locNorm = ln(1 + loc)
complexityNorm = ln(1 + complexity)
fanInNorm = ln(1 + fanIn)
fanOutNorm = ln(1 + fanOut)

riskScore =
  w.loc * locNorm +
  w.complexity * complexityNorm +
  w.fanIn * fanInNorm +
  w.fanOut * fanOutNorm +
  w.cycle * (inCycle ? 1 : 0)
```

## Install As a Real macOS App

This gives you a normal `.app` you can open from Finder/Launchpad (no terminal needed after install).

### Prerequisites

- macOS 13+
- Node.js 20+
- pnpm via Corepack
- Rust toolchain (`rustup`)
- Xcode Command Line Tools

### 1) Build the app bundle

From repo root:

```bash
corepack enable
corepack pnpm install
corepack pnpm --filter @ccv/desktop tauri:build
```

Build output:

```text
apps/desktop/src-tauri/target/release/bundle/macos/Codebase Complexity Visualizer.app
```

### 2) Install to Applications

```bash
cp -R "apps/desktop/src-tauri/target/release/bundle/macos/Codebase Complexity Visualizer.app" /Applications/
```

### 3) Launch without terminal

Open it from `/Applications` like any other app.

Optional:

- Keep in Dock: right-click Dock icon -> `Options` -> `Keep in Dock`
- Auto-start on login: `System Settings -> General -> Login Items`

## Development

From repo root:

```bash
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Run desktop app in dev mode:

```bash
corepack pnpm --filter @ccv/desktop tauri:dev
```

## CLI Usage

Analyze a repository directly with the analyzer package:

```bash
corepack pnpm --filter @ccv/analyzer build
node packages/analyzer/dist/cli.js analyze ./path-to-repo --out ./analysis.json
```

## Privacy

- Analysis runs locally on your machine
- No cloud upload
- Only local files are written:
  - analysis output (`analysis.json`)
  - local app metadata/settings (`SQLite`)

See also:

- [macOS deployment notes](./docs/macos.md)
- [privacy notes](./docs/privacy.md)

## Repo Structure

```text
apps/desktop      # Tauri + React desktop app
packages/analyzer # Analysis engine and CLI
packages/model    # Shared types/defaults/schema
```
