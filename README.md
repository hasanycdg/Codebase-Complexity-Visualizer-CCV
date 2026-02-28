# Codebase Complexity Visualizer (CCV)

Codebase Complexity Visualizer is a local-first macOS desktop app for understanding repository structure, hotspot risk, and dependency cycles.

CCV is designed for people working in large or aging codebases who need a faster way to answer questions like:

- Which files are the riskiest to touch?
- Where are the architectural bottlenecks?
- Which files are part of cycles?
- How does risk change if I care more about complexity or coupling?

The desktop app runs offline, stores data locally, and bundles a native Rust analyzer in the `.app` package.

## Platform Status

- Desktop platform: macOS
- Runtime requirement for end users: none beyond macOS
- Runtime requirement for developers building from source: Node.js 20+, pnpm, Rust, Xcode Command Line Tools

## Features

### Analysis engine

- Recursive repository scan
- Supported languages: `js`, `ts`, `java`, `py`, `php`, `css`, `html`
- Per-file metrics:
  - `loc`
  - `complexity`
  - `fanIn`
  - `fanOut`
  - `inCycle`
  - `riskScore`
- Dependency graph extraction
- External dependency tracking
- Strongly connected component detection with Tarjan SCC
- Deterministic JSON output

### Desktop app

- Native macOS `.app` bundle
- Project picker with recent projects
- Analysis runner with live stdout/stderr logs
- Dashboard views:
  - `Overview`: treemap heatmap and top risky files
  - `Structural`: architecture layers and dependency graph
  - `Deep Analysis`: what-if weights, complexity scatter plot, cycle explainer
  - `Experimental`: Risk Radar and optional 3D City View
  - `Info`: metric definitions, current weights, and live risk calculation example
- File detail drawer from multiple views
- Local settings persistence in SQLite
- Stored analysis record per project

## How Risk Is Calculated

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

Default weights:

```text
loc=0.8, complexity=1.4, fanIn=1.0, fanOut=1.0, cycle=2.5
```

## Install and Run

There are two normal installation paths.

### Option 1: Install a built app bundle

Use this if you already have a built `Codebase Complexity Visualizer.app`.

1. Copy the app to `/Applications`.
2. Open it from Finder, Launchpad, or Spotlight.
3. Pick a repository folder and run analysis.

Example:

```bash
cp -R "Codebase Complexity Visualizer.app" /Applications/
open "/Applications/Codebase Complexity Visualizer.app"
```

End users do not need Node.js or Rust when they receive a built app.

### Option 2: Build from source

Prerequisites:

- macOS 13+
- Node.js 20+
- Corepack enabled
- Rust toolchain via `rustup`
- Xcode Command Line Tools

Build and install:

```bash
cd /path/to/codebase-complexity-visualizer
corepack enable
corepack pnpm install
corepack pnpm --filter @ccv/desktop tauri:build
rm -rf "/Applications/Codebase Complexity Visualizer.app"
cp -R "apps/desktop/src-tauri/target/release/bundle/macos/Codebase Complexity Visualizer.app" /Applications/
open "/Applications/Codebase Complexity Visualizer.app"
```

Release build output:

```text
apps/desktop/src-tauri/target/release/bundle/macos/Codebase Complexity Visualizer.app
```

## First Analysis

1. Open the app.
2. Go to `Project Picker`.
3. Select a repository root.
4. Review settings if needed:
   - languages
   - exclude patterns
   - risk weights
   - optional 3D City View toggle
5. Open `Analysis Runner`.
6. Click `Run Analysis`.
7. Inspect the dashboard tabs.

CCV writes the analysis model to:

```text
<your-repo>/.ccv/analysis.json
```

That file is then reloaded on future opens of the same project.

## What CCV Stores

CCV is local-first. It stores only local metadata and generated analysis output.

Written data:

- Repository analysis output: `<repo>/.ccv/analysis.json`
- Local app database: `ccv.db`
- Recent project paths
- Saved settings
- Per-project analysis record path

CCV does not upload source code.
CCV does not send telemetry.
CCV does not require a cloud account.

## Troubleshooting

### The app opens, but analysis does not start

Check that the packaged native analyzer exists:

```bash
ls -la "/Applications/Codebase Complexity Visualizer.app/Contents/MacOS/ccv-analyzer"
```

If it is missing, replace the installed app with a fresh build.

### macOS blocks access to a repository

Some folders, especially under `Documents`, `Desktop`, or external volumes, may require explicit permission.

Open:

- `System Settings`
- `Privacy & Security`
- `Full Disk Access`

Then add `Codebase Complexity Visualizer.app`, enable access, and reopen the app.

### Finder keeps opening an old app copy

Remove the stale copy and reinstall:

```bash
osascript -e 'quit app "Codebase Complexity Visualizer"' || true
rm -rf "/Applications/Codebase Complexity Visualizer.app"
cp -R "apps/desktop/src-tauri/target/release/bundle/macos/Codebase Complexity Visualizer.app" /Applications/
open "/Applications/Codebase Complexity Visualizer.app"
```

### Gatekeeper blocks a local unsigned build

For local development builds only:

```bash
xattr -dr com.apple.quarantine "/Applications/Codebase Complexity Visualizer.app"
```

## Development

Install dependencies:

```bash
corepack pnpm install
```

Run checks:

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:native-analyzer
```

Run the desktop app in development mode:

```bash
corepack pnpm --filter @ccv/desktop tauri:dev
```

Build the native analyzer sidecar directly:

```bash
./scripts/build-native-analyzer-sidecar.sh debug
./scripts/build-native-analyzer-sidecar.sh release
```

Verify that the packaged app contains a working analyzer:

```bash
corepack pnpm check:bundled-analyzer
```

## Native Analyzer CLI

The desktop app uses the native Rust analyzer in `crates/ccv-analyzer`.

Run it directly:

```bash
cargo run --manifest-path crates/ccv-analyzer/Cargo.toml -- \
  analyze ./path-to-repo \
  --out ./analysis.json \
  --languages js,ts,java,py,php,css,html \
  --exclude node_modules,.git,dist,build \
  --weights loc=0.8,complexity=1.4,fanIn=1,fanOut=1,cycle=2.5
```

## Repository Layout

```text
apps/desktop        Tauri + React desktop app
crates/ccv-analyzer Native Rust analyzer used by the packaged app
packages/model      Shared schema, defaults, and validation
packages/analyzer   Existing TypeScript analyzer implementation
scripts/            Build and verification scripts
```

## Additional Documentation

- [macOS deployment and troubleshooting](./docs/macos.md)
- [privacy details](./docs/privacy.md)
- [contributing guide](./CONTRIBUTING.md)
