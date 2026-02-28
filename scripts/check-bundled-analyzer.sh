#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
APP_PATH="$ROOT_DIR/apps/desktop/src-tauri/target/release/bundle/macos/Codebase Complexity Visualizer.app"
ANALYZER_PATH="$APP_PATH/Contents/MacOS/ccv-analyzer"
FIXTURE_PATH="$ROOT_DIR/fixtures/sample-repo"
OUT_PATH="${TMPDIR:-/tmp}/ccv-bundled-analyzer-check-$$.json"

if [ ! -x "$ANALYZER_PATH" ]; then
  echo "Missing bundled analyzer at: $ANALYZER_PATH" >&2
  exit 1
fi

rm -f "$OUT_PATH"

env -i PATH="/usr/bin:/bin" HOME="${HOME:-$ROOT_DIR}" "$ANALYZER_PATH" \
  analyze "$FIXTURE_PATH" \
  --out "$OUT_PATH" \
  --languages js,ts,java,py,php,css,html \
  --exclude node_modules,.git,dist,build \
  --weights loc=0.8,complexity=1.4,fanIn=1,fanOut=1,cycle=2.5

/usr/bin/python3 - "$OUT_PATH" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    summary = json.load(handle)["summary"]

if summary["fileCount"] != 3 or summary["dependencyCount"] != 3 or summary["cycleCount"] != 0:
    raise SystemExit(f"Unexpected summary: {summary}")
PY

rm -f "$OUT_PATH"
echo "Bundled analyzer check passed."
