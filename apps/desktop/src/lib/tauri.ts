import { invoke } from "@tauri-apps/api/core";
import type { AnalysisModel, RunAnalysisRequest } from "../types";

export async function runAnalysis(request: RunAnalysisRequest): Promise<void> {
  await invoke("run_analysis", { request });
}

export async function readAnalysis(analysisPath: string): Promise<AnalysisModel> {
  return invoke<AnalysisModel>("read_analysis", {
    analysisPath,
    analysis_path: analysisPath
  });
}
