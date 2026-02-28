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

fn analyzer_candidate_names() -> [&'static str; 3] {
    [
        "ccv-analyzer",
        "ccv-analyzer-aarch64-apple-darwin",
        "ccv-analyzer-x86_64-apple-darwin",
    ]
}

fn find_first_existing_path(paths: Vec<PathBuf>) -> Option<PathBuf> {
    paths.into_iter().find(|path| path.exists())
}

fn sidecar_candidates(manifest_dir: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    for name in analyzer_candidate_names() {
        candidates.push(manifest_dir.join("binaries").join(name));
        candidates.push(manifest_dir.join("target").join("debug").join(name));
    }
    candidates
}

fn run_dev_sidecar_build(manifest_dir: &Path) -> Result<(), String> {
    let workspace_root = manifest_dir.join("../../..");
    let script_path = workspace_root.join("scripts/build-native-analyzer-sidecar.sh");
    let output = Command::new("/bin/sh")
        .arg(script_path)
        .arg("debug")
        .current_dir(workspace_root)
        .output()
        .map_err(|error| format!("Failed to build native analyzer sidecar: {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(format!(
        "Native analyzer sidecar build failed.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    ))
}

fn ensure_dev_sidecar_built(manifest_dir: &Path) -> Result<PathBuf, String> {
    if let Some(path) = find_first_existing_path(sidecar_candidates(manifest_dir)) {
        return Ok(path);
    }

    run_dev_sidecar_build(manifest_dir)?;

    find_first_existing_path(sidecar_candidates(manifest_dir)).ok_or_else(|| {
        format!(
            "Native analyzer sidecar not found after build. Expected one of: {}",
            sidecar_candidates(manifest_dir)
                .iter()
                .map(|path| path.display().to_string())
                .collect::<Vec<_>>()
                .join(", ")
        )
    })
}

fn build_dev_command(request: &AnalyzeRequest) -> Result<Command, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));

    ensure_dev_sidecar_built(&manifest_dir).map(|sidecar_path| build_sidecar_command(&sidecar_path, request))
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

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Failed to locate resource directory: {error}"))?;

    let executable_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.to_path_buf()));

    let mut candidate_paths: Vec<PathBuf> = Vec::new();

    for name in analyzer_candidate_names() {
        candidate_paths.push(resource_dir.join("binaries").join(name));
    }

    if let Some(dir) = executable_dir {
        for name in analyzer_candidate_names() {
            candidate_paths.push(dir.join(name));
        }
    }

    if let Some(path) = find_first_existing_path(candidate_paths) {
        return Ok(build_sidecar_command(&path, request));
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
