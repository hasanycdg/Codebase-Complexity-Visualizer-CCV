import type { RiskWeights } from "@ccv/model";

export interface RiskInputs {
  loc: number;
  complexity: number;
  fanIn: number;
  fanOut: number;
  inCycle: boolean;
}

export function calculateRiskScore(inputs: RiskInputs, weights: RiskWeights): number {
  const locNorm = Math.log(1 + inputs.loc);
  const complexityNorm = Math.log(1 + inputs.complexity);
  const fanInNorm = Math.log(1 + inputs.fanIn);
  const fanOutNorm = Math.log(1 + inputs.fanOut);

  return (
    weights.loc * locNorm +
    weights.complexity * complexityNorm +
    weights.fanIn * fanInNorm +
    weights.fanOut * fanOutNorm +
    weights.cycle * (inputs.inCycle ? 1 : 0)
  );
}
