import type { AnalysisModel, Language, RiskWeights } from "@ccv/model";
import { DEFAULT_EXCLUDES, DEFAULT_LANGUAGES, DEFAULT_WEIGHTS } from "@ccv/model";

export interface RecentProject {
  path: string;
  lastOpened: string;
}

export interface AnalysisRecord {
  projectPath: string;
  analysisPath: string;
  updatedAt: string;
}

export interface AppSettings {
  languages: Language[];
  excludePatterns: string[];
  weights: RiskWeights;
  cityViewEnabled: boolean;
}

export interface RunAnalysisRequest {
  runId: string;
  repoPath: string;
  outPath: string;
  languages: Language[];
  excludePatterns: string[];
  weights: RiskWeights;
}

export interface AnalysisLogEvent {
  runId: string;
  level: "stdout" | "stderr";
  message: string;
}

export interface AnalysisDoneEvent {
  runId: string;
  repoPath: string;
  outputPath: string;
  success: boolean;
  exitCode: number;
}

export interface AnalysisErrorEvent {
  runId: string;
  message: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  languages: [...DEFAULT_LANGUAGES],
  excludePatterns: [...DEFAULT_EXCLUDES],
  weights: { ...DEFAULT_WEIGHTS },
  cityViewEnabled: false
};

export type { AnalysisModel };
