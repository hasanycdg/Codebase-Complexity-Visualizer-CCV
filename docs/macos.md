# macOS Deployment Notes

This document covers building, installing, verifying, and distributing the macOS app.

## Runtime Model

The packaged app is self-contained:

- The desktop UI is a Tauri app.
- Repository analysis is executed by a bundled native Rust sidecar named `ccv-analyzer`.
- The installed app does not depend on a system `node` binary at runtime.

Expected bundled analyzer path:

```text
Codebase Complexity Visualizer.app/Contents/MacOS/ccv-analyzer
```

## Build From Source

Prerequisites:

- macOS 13+
- Node.js 20+
- Corepack
- Rust toolchain
- Xcode Command Line Tools

Build the release app from the repository root:

```bash
corepack enable
corepack pnpm install
corepack pnpm --filter @ccv/desktop tauri:build
```

The Tauri build automatically:

1. builds the frontend,
2. builds the native analyzer sidecar,
3. bundles the `.app` package.

Release artifact:

```text
apps/desktop/src-tauri/target/release/bundle/macos/Codebase Complexity Visualizer.app
```

## Install or Reinstall the App

Install into `/Applications`:

```bash
rm -rf "/Applications/Codebase Complexity Visualizer.app"
cp -R "apps/desktop/src-tauri/target/release/bundle/macos/Codebase Complexity Visualizer.app" /Applications/
open "/Applications/Codebase Complexity Visualizer.app"
```

If the app is currently running:

```bash
osascript -e 'quit app "Codebase Complexity Visualizer"' || true
pkill -f "Codebase Complexity Visualizer" || true
```

## Verify the Bundled Analyzer

After building, verify the packaged analyzer before shipping the app:

```bash
corepack pnpm check:bundled-analyzer
```

Manual verification:

```bash
ls -la "/Applications/Codebase Complexity Visualizer.app/Contents/MacOS/ccv-analyzer"
```

You can also execute the bundled analyzer directly:

```bash
env -i PATH="/usr/bin:/bin" HOME="$HOME" \
  "/Applications/Codebase Complexity Visualizer.app/Contents/MacOS/ccv-analyzer" \
  analyze /path/to/repo \
  --out /tmp/analysis.json \
  --languages js,ts,java,py,php,css,html \
  --exclude node_modules,.git,dist,build \
  --weights loc=0.8,complexity=1.4,fanIn=1,fanOut=1,cycle=2.5
```

That check is useful because Finder-launched macOS apps run with a reduced environment.

## Permissions and Folder Access

CCV only analyzes folders the user explicitly selects.

Some protected locations may require additional macOS permission:

- `Desktop`
- `Documents`
- external volumes under stricter policies

If analysis fails because the app cannot read the selected repository:

1. Open `System Settings`.
2. Go to `Privacy & Security`.
3. Open `Full Disk Access`.
4. Add `Codebase Complexity Visualizer.app`.
5. Enable access.
6. Restart the app.

## Unsigned Local Builds

For local development builds, Gatekeeper may block execution.

Remove quarantine from the installed local app if necessary:

```bash
xattr -dr com.apple.quarantine "/Applications/Codebase Complexity Visualizer.app"
```

## Public Distribution

For public distribution, do not ship the raw repository. Ship the `.app` bundle or a zipped release artifact.

Recommended release flow:

1. Build the release app.
2. Run `corepack pnpm check:bundled-analyzer`.
3. Sign the app with Developer ID.
4. Notarize it.
5. Staple the notarization ticket.
6. Distribute the signed app or zip.

Example notarization flow:

```bash
xcrun notarytool submit "apps/desktop/src-tauri/target/release/bundle/macos/Codebase Complexity Visualizer.app" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_APP_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait

xcrun stapler staple "apps/desktop/src-tauri/target/release/bundle/macos/Codebase Complexity Visualizer.app"
```

## Apple Silicon and Intel Builds

The sidecar build script builds the native analyzer for the current host architecture.

Examples:

- Apple Silicon host: `ccv-analyzer-aarch64-apple-darwin`
- Intel host: `ccv-analyzer-x86_64-apple-darwin`

If you want to distribute to both Apple Silicon and Intel users, build release artifacts for both architectures in CI or on matching machines.

Relevant script:

```bash
./scripts/build-native-analyzer-sidecar.sh release
```

## Common Failure Checks

### App launches, but analysis immediately fails

Usually one of these is true:

- the installed app is stale,
- the bundled `ccv-analyzer` is missing,
- macOS denied folder access.

Check the analyzer exists:

```bash
ls -la "/Applications/Codebase Complexity Visualizer.app/Contents/MacOS/ccv-analyzer"
```

Then replace the installed app with a fresh build if needed.

### You have multiple app copies

Make sure you are opening the copy in `/Applications`, not an older build from `target/` or `Downloads`.

### You changed the app icon or bundle but Finder still shows an old state

Restart Finder and Dock:

```bash
killall Finder
killall Dock
```
