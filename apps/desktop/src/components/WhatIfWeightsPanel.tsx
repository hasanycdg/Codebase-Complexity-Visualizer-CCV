import { useMemo } from "react";
import type { RiskWeights } from "@ccv/model";
import type { AnalysisModel } from "../types";
import { riskMapForModel } from "../lib/risk";

interface WhatIfWeightsPanelProps {
  model: AnalysisModel;
  enabled: boolean;
  weights: RiskWeights;
  onEnabledChange: (enabled: boolean) => void;
  onWeightsChange: (weights: RiskWeights) => void;
  onReset: () => void;
  onFileSelected: (path: string) => void;
}

const weightFields: Array<{
  key: keyof RiskWeights;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: "loc", label: "LOC", min: 0, max: 4, step: 0.1 },
  { key: "complexity", label: "Complexity", min: 0, max: 6, step: 0.1 },
  { key: "fanIn", label: "Fan-In", min: 0, max: 4, step: 0.1 },
  { key: "fanOut", label: "Fan-Out", min: 0, max: 4, step: 0.1 },
  { key: "cycle", label: "Cycle Penalty", min: 0, max: 6, step: 0.1 }
];

export function WhatIfWeightsPanel({
  model,
  enabled,
  weights,
  onEnabledChange,
  onWeightsChange,
  onReset,
  onFileSelected
}: WhatIfWeightsPanelProps): JSX.Element {
  const simulatedRisk = useMemo(() => riskMapForModel(model, weights), [model, weights]);

  const comparison = useMemo(() => {
    const rows = model.files.map((file) => {
      const current = file.riskScore;
      const simulated = simulatedRisk.get(file.path) ?? current;
      const delta = simulated - current;

      return {
        path: file.path,
        current,
        simulated,
        delta,
        absDelta: Math.abs(delta)
      };
    });

    const avgCurrent =
      rows.reduce((sum, row) => sum + row.current, 0) / Math.max(1, rows.length);
    const avgSimulated =
      rows.reduce((sum, row) => sum + row.simulated, 0) / Math.max(1, rows.length);

    return {
      avgCurrent,
      avgSimulated,
      topMovers: rows
        .sort((a, b) => b.absDelta - a.absDelta || b.simulated - a.simulated)
        .slice(0, 8)
    };
  }, [model.files, simulatedRisk]);

  const updateWeight = (key: keyof RiskWeights, raw: string): void => {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      return;
    }

    onWeightsChange({
      ...weights,
      [key]: numeric
    });
  };

  return (
    <section className="panel whatif-panel">
      <div className="whatif-header">
        <h3>What-if Weights</h3>
        <label className="inline whatif-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
          />
          Enable What-if override
        </label>
      </div>

      <p className="panel-subtitle">
        Adjust risk weights live without re-running analysis. This only affects dashboard visuals and ranking views.
      </p>

      <div className="whatif-weights-grid">
        {weightFields.map((field) => (
          <label key={field.key} className="whatif-weight-card">
            <span>{field.label}</span>
            <input
              type="range"
              min={field.min}
              max={field.max}
              step={field.step}
              value={weights[field.key]}
              onChange={(event) => updateWeight(field.key, event.target.value)}
              disabled={!enabled}
            />
            <input
              type="number"
              min={field.min}
              max={field.max}
              step={field.step}
              value={weights[field.key]}
              onChange={(event) => updateWeight(field.key, event.target.value)}
              disabled={!enabled}
            />
          </label>
        ))}
      </div>

      <div className="whatif-stats">
        <div>
          <span>Baseline avg risk</span>
          <strong>{comparison.avgCurrent.toFixed(3)}</strong>
        </div>
        <div>
          <span>What-if avg risk</span>
          <strong>{comparison.avgSimulated.toFixed(3)}</strong>
        </div>
        <div>
          <span>Global delta</span>
          <strong>{(comparison.avgSimulated - comparison.avgCurrent).toFixed(3)}</strong>
        </div>
        <button className="button-ghost" onClick={onReset}>
          Reset to analysis defaults
        </button>
      </div>

      <h4>Top Movers</h4>
      <table>
        <thead>
          <tr>
            <th>File</th>
            <th>Current</th>
            <th>What-if</th>
            <th>Delta</th>
          </tr>
        </thead>
        <tbody>
          {comparison.topMovers.map((row) => (
            <tr key={row.path} onClick={() => onFileSelected(row.path)}>
              <td>{row.path}</td>
              <td>{row.current.toFixed(3)}</td>
              <td>{row.simulated.toFixed(3)}</td>
              <td className={row.delta >= 0 ? "delta-up" : "delta-down"}>{row.delta.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
