#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
PROFILE_INPUT="${1:-release}"
TARGET_TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"
CARGO_MANIFEST="$ROOT_DIR/crates/ccv-analyzer/Cargo.toml"
BIN_DIR="$ROOT_DIR/apps/desktop/src-tauri/binaries"
OUT_NAME="ccv-analyzer-$TARGET_TRIPLE"
TARGET_SUBDIR="release"
BUILD_ARGS="--release"

if [ "$PROFILE_INPUT" = "debug" ]; then
  TARGET_SUBDIR="debug"
  BUILD_ARGS=""
fi

TARGET_DIR="$ROOT_DIR/crates/ccv-analyzer/target/$TARGET_TRIPLE/$TARGET_SUBDIR"

mkdir -p "$BIN_DIR"

cargo build --manifest-path "$CARGO_MANIFEST" --bin ccv-analyzer --target "$TARGET_TRIPLE" $BUILD_ARGS
cp "$TARGET_DIR/ccv-analyzer" "$BIN_DIR/$OUT_NAME"
chmod +x "$BIN_DIR/$OUT_NAME"

echo "Built native analyzer sidecar: $BIN_DIR/$OUT_NAME"
