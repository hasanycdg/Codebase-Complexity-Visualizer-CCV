# Contributing

## Prerequisites

- Node.js 20+
- Corepack enabled
- Rust toolchain
- Xcode Command Line Tools
- macOS 13+ for desktop packaging and manual app verification

## Setup

```bash
corepack enable
corepack pnpm install
```

## Development Workflow

### Core checks

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:native-analyzer
```

### Desktop app

Run the app in development mode:

```bash
corepack pnpm --filter @ccv/desktop tauri:dev
```

Build the release app:

```bash
corepack pnpm --filter @ccv/desktop tauri:build
```

### Native analyzer sidecar

Build the native analyzer binary used by the packaged app:

```bash
./scripts/build-native-analyzer-sidecar.sh debug
./scripts/build-native-analyzer-sidecar.sh release
```

Verify that the packaged app includes a working analyzer:

```bash
corepack pnpm check:bundled-analyzer
```

## Architecture Notes

- `apps/desktop` contains the Tauri + React app.
- `crates/ccv-analyzer` contains the native Rust analyzer used by the desktop bundle.
- `packages/model` contains shared schema, defaults, and validation.
- `packages/analyzer` contains the existing TypeScript analyzer implementation.

The packaged app must remain self-contained. Do not reintroduce a runtime dependency on a system `node` binary for release builds.

## Coding Expectations

- Keep the project local-first and privacy-first.
- Do not add telemetry.
- Avoid cloud dependencies for analysis.
- Preserve deterministic analyzer output.
- Keep docs in sync with packaging and runtime behavior.
- Prefer explicit typed interfaces over ad-hoc payloads.

## Analyzer Guidelines

- Keep output compatible with the shared analysis model.
- Add tests for parser, resolver, or metric changes.
- Treat packaged-app analyzer execution as a release-critical path.
- If you touch build or packaging logic, rerun `corepack pnpm check:bundled-analyzer`.

## Pull Request Checklist

- [ ] `corepack pnpm typecheck` passes
- [ ] `corepack pnpm test` passes
- [ ] `corepack pnpm test:native-analyzer` passes
- [ ] `corepack pnpm --filter @ccv/desktop tauri:build` passes when relevant
- [ ] `corepack pnpm check:bundled-analyzer` passes when packaging/runtime changed
- [ ] Docs updated for behavior or install changes
- [ ] Privacy guarantees unchanged unless explicitly discussed

## License

By contributing, you agree that your contributions are licensed under the MIT License.
