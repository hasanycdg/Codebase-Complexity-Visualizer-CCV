import type { RiskWeights } from "@ccv/model";
import type { AnalysisModel } from "../types";

type FileMetrics = Pick<
  AnalysisModel["files"][number],
  "loc" | "complexity" | "fanIn" | "fanOut" | "inCycle"
>;

export function calculateRiskScore(file: FileMetrics, weights: RiskWeights): number {
  const locNorm = Math.log(1 + file.loc);
  const complexityNorm = Math.log(1 + file.complexity);
  const fanInNorm = Math.log(1 + file.fanIn);
  const fanOutNorm = Math.log(1 + file.fanOut);

  return (
    weights.loc * locNorm +
    weights.complexity * complexityNorm +
    weights.fanIn * fanInNorm +
    weights.fanOut * fanOutNorm +
    weights.cycle * (file.inCycle ? 1 : 0)
  );
}

export function riskMapForModel(
  model: AnalysisModel,
  weights: RiskWeights
): Map<string, number> {
  return new Map(
    model.files.map((file) => [
      file.path,
      Math.round(calculateRiskScore(file, weights) * 1000) / 1000
    ])
  );
}
