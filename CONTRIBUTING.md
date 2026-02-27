# Contributing

## Prerequisites

- Node.js 20+
- Corepack enabled
- Rust toolchain (for Tauri backend)
- macOS 13+ for desktop packaging workflow

## Setup

```bash
corepack pnpm install
```

## Development workflow

1. Build shared packages:

```bash
corepack pnpm --filter @ccv/model build
corepack pnpm --filter @ccv/analyzer build
```

2. Run checks:

```bash
corepack pnpm typecheck
corepack pnpm test
```

3. Run desktop app:

```bash
corepack pnpm --filter @ccv/desktop tauri:dev
```

## Coding expectations

- Keep the project local-first and privacy-first.
- Avoid introducing cloud dependencies.
- Do not add telemetry.
- Preserve analyzer determinism and reproducibility.
- Prefer explicit, typed interfaces over ad-hoc payloads.

## Analyzer-specific guidelines

- Maintain custom JS/TS import parsing (no heavy AST parser for MVP).
- Keep Tarjan SCC implementation in-repo and covered by tests.
- Add tests for any parser/metric behavior changes.

## Pull request checklist

- [ ] `corepack pnpm typecheck` passes
- [ ] `corepack pnpm test` passes
- [ ] `corepack pnpm --filter @ccv/analyzer build` passes
- [ ] Docs updated for behavior/config changes
- [ ] Privacy guarantees unchanged

## License

By contributing, you agree that your contributions are licensed under the MIT License.
