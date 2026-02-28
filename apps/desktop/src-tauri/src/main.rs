#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RiskWeights {
    loc: f64,
    complexity: f64,
    fan_in: f64,
    fan_out: f64,
    cycle: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnalyzeRequest {
    run_id: String,
    repo_path: String,
    out_path: String,
    languages: Vec<String>,
    exclude_patterns: Vec<String>,
    weights: RiskWeights,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AnalysisLogEvent {
    run_id: String,
    level: String,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AnalysisDoneEvent {
    run_id: String,
    repo_path: String,
    output_path: String,
    success: bool,
    exit_code: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AnalysisErrorEvent {
    run_id: String,
    message: String,
}

fn emit_log(app: &AppHandle, run_id: &str, level: &str, message: impl Into<String>) {
    let _ = app.emit(
        "analysis-log",
        AnalysisLogEvent {
            run_id: run_id.to_string(),
            level: level.to_string(),
            message: message.into(),
        },
    );
}

fn emit_error(app: &AppHandle, run_id: &str, message: impl Into<String>) {
    let _ = app.emit(
        "analysis-error",
        AnalysisErrorEvent {
            run_id: run_id.to_string(),
            message: message.into(),
        },
    );
}

fn emit_done(app: &AppHandle, request: &AnalyzeRequest, success: bool, exit_code: i32) {
    let _ = app.emit(
        "analysis-done",
        AnalysisDoneEvent {
            run_id: request.run_id.clone(),
            repo_path: request.repo_path.clone(),
            output_path: request.out_path.clone(),
            success,
            exit_code,
        },
    );
}

fn build_weights_arg(weights: &RiskWeights) -> String {
    format!(
        "loc={},complexity={},fanIn={},fanOut={},cycle={}",
        weights.loc, weights.complexity, weights.fan_in, weights.fan_out, weights.cycle
    )
}

fn run_pnpm_build(workspace_root: &Path, filter: &str) -> Result<(), String> {
    let output = Command::new("corepack")
        .arg("pnpm")
        .arg("--filter")
        .arg(filter)
        .arg("build")
        .current_dir(workspace_root)
        .output()
        .map_err(|error| format!("Failed to run build for {filter}: {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(format!(
        "Build for {filter} failed.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    ))
}

fn ensure_dev_analyzer_built(manifest_dir: &Path) -> Result<PathBuf, String> {
    let analyzer_cli = manifest_dir.join("../../../packages/analyzer/dist/cli.js");
    if analyzer_cli.exists() {
        return Ok(analyzer_cli);
    }

    let workspace_root = manifest_dir.join("../../..");
    run_pnpm_build(&workspace_root, "@ccv/model")?;
    run_pnpm_build(&workspace_root, "@ccv/analyzer")?;

    if analyzer_cli.exists() {
        return Ok(analyzer_cli);
    }

    Err(format!(
        "Analyzer binary not found at {} even after auto-build. Run `corepack pnpm --filter @ccv/analyzer build` manually.",
        analyzer_cli.display()
    ))
}

fn build_dev_command(request: &AnalyzeRequest) -> Result<Command, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let analyzer_cli = ensure_dev_analyzer_built(&manifest_dir)?;

    build_node_cli_command(&analyzer_cli, request)
}

fn find_node_binary() -> Result<PathBuf, String> {
    if let Ok(explicit_path) = std::env::var("CCV_NODE_BIN") {
        let path = PathBuf::from(explicit_path);
        if path.exists() {
            return Ok(path);
        }
    }

    let candidates = [
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        "/opt/local/bin/node",
        "/usr/bin/node",
    ];

    for candidate in candidates {
        let path = PathBuf::from(candidate);
        if path.exists() {
            return Ok(path);
        }
    }

    let output = Command::new("/bin/zsh")
        .arg("-ic")
        .arg("command -v node")
        .output()
        .map_err(|error| format!("Failed to locate node runtime: {error}"))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let path = stdout.trim();
        if !path.is_empty() {
            return Ok(PathBuf::from(path));
        }
    }

    Err("Node.js runtime not found. Install Node.js or set CCV_NODE_BIN.".to_string())
}

fn build_node_cli_command(analyzer_cli: &Path, request: &AnalyzeRequest) -> Result<Command, String> {
    let node_binary = find_node_binary()?;

    let mut command = Command::new(node_binary);
    command
        .arg(analyzer_cli)
        .arg("analyze")
        .arg(&request.repo_path)
        .arg("--out")
        .arg(&request.out_path)
        .arg("--languages")
        .arg(request.languages.join(","))
        .arg("--exclude")
        .arg(request.exclude_patterns.join(","))
        .arg("--weights")
        .arg(build_weights_arg(&request.weights));

    Ok(command)
}

fn build_sidecar_command(analyzer_path: &Path, request: &AnalyzeRequest) -> Command {
    let mut command = Command::new(analyzer_path);
    command
        .arg("analyze")
        .arg(&request.repo_path)
        .arg("--out")
        .arg(&request.out_path)
        .arg("--languages")
        .arg(request.languages.join(","))
        .arg("--exclude")
        .arg(request.exclude_patterns.join(","))
        .arg("--weights")
        .arg(build_weights_arg(&request.weights));
    command
}

fn build_release_command(app: &AppHandle, request: &AnalyzeRequest) -> Result<Command, String> {
    if let Ok(explicit_path) = std::env::var("CCV_ANALYZER_BIN") {
        return Ok(build_sidecar_command(Path::new(&explicit_path), request));
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let local_analyzer_cli = manifest_dir.join("../../../packages/analyzer/dist/cli.js");
    if local_analyzer_cli.exists() {
        return build_node_cli_command(&local_analyzer_cli, request);
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Failed to locate resource directory: {error}"))?;

    let executable_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.to_path_buf()));

    let candidate_names = [
        "ccv-analyzer",
        "ccv-analyzer-aarch64-apple-darwin",
        "ccv-analyzer-x86_64-apple-darwin",
    ];

    let mut candidate_paths: Vec<PathBuf> = Vec::new();

    for name in candidate_names {
        candidate_paths.push(resource_dir.join("binaries").join(name));
    }

    if let Some(dir) = executable_dir {
        for name in candidate_names {
            candidate_paths.push(dir.join(name));
        }
    }

    for path in candidate_paths {
        if path.exists() {
            return Ok(build_sidecar_command(&path, request));
        }
    }

    Err("Release analyzer sidecar not found. Set CCV_ANALYZER_BIN or bundle binaries/ccv-analyzer.".to_string())
}

fn build_analyzer_command(app: &AppHandle, request: &AnalyzeRequest) -> Result<Command, String> {
    if cfg!(debug_assertions) {
        return build_dev_command(request);
    }

    build_release_command(app, request)
}

#[tauri::command]
async fn run_analysis(app: AppHandle, request: AnalyzeRequest) -> Result<(), String> {
    let runner_app = app.clone();

    thread::spawn(move || {
        let mut command = match build_analyzer_command(&runner_app, &request) {
            Ok(command) => command,
            Err(error) => {
                emit_error(&runner_app, &request.run_id, error);
                emit_done(&runner_app, &request, false, -1);
                return;
            }
        };

        command.stdout(Stdio::piped()).stderr(Stdio::piped());

        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                emit_error(
                    &runner_app,
                    &request.run_id,
                    format!("Failed to spawn analyzer process: {error}"),
                );
                emit_done(&runner_app, &request, false, -1);
                return;
            }
        };

        let stdout_handle = child.stdout.take().map(|stdout| {
            let app = runner_app.clone();
            let run_id = request.run_id.clone();
            thread::spawn(move || {
                for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                    emit_log(&app, &run_id, "stdout", line);
                }
            })
        });

        let stderr_handle = child.stderr.take().map(|stderr| {
            let app = runner_app.clone();
            let run_id = request.run_id.clone();
            thread::spawn(move || {
                for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                    emit_log(&app, &run_id, "stderr", line);
                }
            })
        });

        let status = match child.wait() {
            Ok(status) => status,
            Err(error) => {
                emit_error(
                    &runner_app,
                    &request.run_id,
                    format!("Analyzer process failed to wait: {error}"),
                );
                emit_done(&runner_app, &request, false, -1);
                return;
            }
        };

        if let Some(handle) = stdout_handle {
            let _ = handle.join();
        }
        if let Some(handle) = stderr_handle {
            let _ = handle.join();
        }

        emit_done(
            &runner_app,
            &request,
            status.success(),
            status.code().unwrap_or(-1),
        );
    });

    Ok(())
}

#[tauri::command]
fn read_analysis(analysis_path: String) -> Result<serde_json::Value, String> {
    let raw = fs::read_to_string(&analysis_path)
        .map_err(|error| format!("Failed to read analysis at {}: {error}", analysis_path))?;

    serde_json::from_str(&raw)
        .map_err(|error| format!("Invalid analysis JSON at {}: {error}", analysis_path))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![run_analysis, read_analysis])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
