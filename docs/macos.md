# macOS Deployment Notes

## 1) Folder access and privacy boundaries

CCV is local-first and offline-only. The desktop app only analyzes folders selected by the user via Tauri's native dialog API (`@tauri-apps/plugin-dialog`).

Operational rules:

- Do not scan outside the user-selected repository path.
- Do not request network access to send source code.
- Store only metadata in SQLite (`ccv.db`) and analysis model files (`analysis.json`).

### Full Disk Access (if needed)

Some repositories under protected folders (for example Desktop/Documents on locked-down environments, or external volume policies) can require explicit macOS permission.

Steps:

1. Open `System Settings`.
2. Go to `Privacy & Security`.
3. Open `Full Disk Access`.
4. Add the built CCV app bundle and enable it.
5. Restart CCV.

CCV should still default to scanning only user-granted folders.

## 2) Unsigned development mode

For local development on macOS 13+:

```bash
corepack pnpm install
corepack pnpm --filter @ccv/model build
corepack pnpm --filter @ccv/analyzer build
corepack pnpm --filter @ccv/desktop tauri:dev
```

If Gatekeeper blocks execution for a local build, remove quarantine on the local artifact:

```bash
xattr -dr com.apple.quarantine ./apps/desktop/src-tauri/target
```

## 3) Developer ID signing and notarization

When preparing public distribution, sign with an Apple Developer ID identity and notarize.

High-level process:

1. Build release app.
2. Sign using Developer ID Application certificate.
3. Submit for notarization.
4. Staple notarization ticket.

Example (adjust team/account details):

```bash
corepack pnpm --filter @ccv/model build
corepack pnpm --filter @ccv/analyzer build
corepack pnpm --filter @ccv/desktop tauri:build

xcrun notarytool submit "apps/desktop/src-tauri/target/release/bundle/macos/Codebase Complexity Visualizer.app" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_APP_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait

xcrun stapler staple "apps/desktop/src-tauri/target/release/bundle/macos/Codebase Complexity Visualizer.app"
```

## 4) Universal binaries (arm64 + x64)

CCV supports Apple Silicon and Intel.

### Analyzer sidecar binaries

Build analyzer sidecar binary for both targets and place in:

- `apps/desktop/src-tauri/binaries/ccv-analyzer-aarch64-apple-darwin`
- `apps/desktop/src-tauri/binaries/ccv-analyzer-x86_64-apple-darwin`

For MVP, placeholder scripts are included. Replace them with real binaries before release.

### Desktop app

Build per architecture:

```bash
cd apps/desktop/src-tauri
cargo build --release --target aarch64-apple-darwin
cargo build --release --target x86_64-apple-darwin
```

Create universal executable with `lipo`:

```bash
lipo -create \
  target/aarch64-apple-darwin/release/ccv-desktop \
  target/x86_64-apple-darwin/release/ccv-desktop \
  -output target/universal/release/ccv-desktop
```

Then package/sign/notarize the universal bundle.

## 5) Future incremental analysis

File watching is intentionally excluded from MVP, but architecture supports future incremental analysis by:

- Persisting previous file hash/metrics snapshots in SQLite.
- Re-analyzing only changed files.
- Recomputing SCC and fan-in/fan-out only for impacted subgraph components.
