export type Language = "js" | "ts" | "java" | "py" | "php" | "css" | "html";

export interface RiskWeights {
  loc: number;
  complexity: number;
  fanIn: number;
  fanOut: number;
  cycle: number;
}

export interface AnalysisConfig {
  languages: Language[];
  exclude: string[];
  weights: RiskWeights;
}

export interface ImportRef {
  specifier: string;
  resolvedPath: string | null;
  external: boolean;
}

export interface FileAnalysis {
  path: string;
  language: Language;
  loc: number;
  complexity: number;
  fanIn: number;
  fanOut: number;
  inCycle: boolean;
  riskScore: number;
  imports: ImportRef[];
}

export interface DependencyEdge {
  from: string;
  to: string;
  specifier: string;
  external: boolean;
}

export interface StronglyConnectedComponent {
  id: number;
  size: number;
  nodes: string[];
}

export interface AnalysisSummary {
  fileCount: number;
  dependencyCount: number;
  cycleCount: number;
  sccCount: number;
}

export interface AnalysisModel {
  schemaVersion: "1.0.0";
  generatedAt: string;
  rootPath: string;
  config: AnalysisConfig;
  summary: AnalysisSummary;
  files: FileAnalysis[];
  edges: DependencyEdge[];
  scc: StronglyConnectedComponent[];
}

export const DEFAULT_EXCLUDES = ["node_modules", ".git", "dist", "build"];

export const DEFAULT_LANGUAGES: Language[] = ["js", "ts", "java", "py", "php", "css", "html"];

export const DEFAULT_WEIGHTS: RiskWeights = {
  loc: 0.8,
  complexity: 1.4,
  fanIn: 1,
  fanOut: 1,
  cycle: 2.5
};

const isPositiveFinite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export function validateAnalysisModel(model: AnalysisModel): void {
  if (model.schemaVersion !== "1.0.0") {
    throw new Error(`Unsupported schema version: ${model.schemaVersion}`);
  }

  if (!Array.isArray(model.files) || !Array.isArray(model.edges) || !Array.isArray(model.scc)) {
    throw new Error("Invalid analysis model arrays");
  }

  for (const file of model.files) {
    if (!file.path || !isPositiveFinite(file.loc) || !isPositiveFinite(file.complexity)) {
      throw new Error(`Invalid file record: ${file.path}`);
    }

    if (
      !isPositiveFinite(file.fanIn) ||
      !isPositiveFinite(file.fanOut) ||
      !Number.isFinite(file.riskScore)
    ) {
      throw new Error(`Invalid fan/risk values in file: ${file.path}`);
    }
  }

  for (const component of model.scc) {
    if (!Array.isArray(component.nodes) || component.nodes.length !== component.size) {
      throw new Error(`Invalid SCC component id=${component.id}`);
    }
  }
}

export function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}
