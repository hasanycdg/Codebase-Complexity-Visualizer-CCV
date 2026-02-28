# Privacy Guarantees

Codebase Complexity Visualizer (CCV) is local-first and offline by design.

## Guarantees

- No telemetry
- No cloud APIs
- No source upload
- No background network sync
- No account required

## What Runs Locally

A local analysis run consists of:

- the desktop Tauri app,
- a bundled native analyzer process named `ccv-analyzer`,
- local file reads inside the repository you selected.

Analysis is executed on your machine. The app does not need to send repository contents anywhere.

## What CCV Writes

CCV writes only local app data and generated analysis output.

### Repository output

Per analyzed repository:

```text
<repo>/.ccv/analysis.json
```

This file contains derived metrics and graph data. It is generated so the app can reopen previous analysis results quickly.

### Local app data

The app also stores local metadata in a SQLite database named `ccv.db`, including:

- recent project paths,
- saved settings,
- analysis file locations,
- per-project timestamps.

CCV does not persist full source files in SQLite.

## Data Deletion

From the Project Picker UI, you can remove stored metadata for a project via `Delete Data`.

You can also manually remove generated analysis output by deleting:

```text
<repo>/.ccv/analysis.json
```

If you want a fully clean local state, remove both:

- the repository's `.ccv` folder,
- the app's local SQLite database.
