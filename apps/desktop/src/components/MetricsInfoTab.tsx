import { useMemo } from "react";
import type { RiskWeights } from "@ccv/model";
import type { AnalysisModel } from "../types";

interface MetricsInfoTabProps {
  model: AnalysisModel;
  riskByPath: ReadonlyMap<string, number>;
  weights: RiskWeights;
  whatIfEnabled: boolean;
}

interface RiskBreakdown {
  locNorm: number;
  complexityNorm: number;
  fanInNorm: number;
  fanOutNorm: number;
  risk: number;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function calculateBreakdown(
  file: AnalysisModel["files"][number],
  weights: RiskWeights
): RiskBreakdown {
  const locNorm = Math.log(1 + file.loc);
  const complexityNorm = Math.log(1 + file.complexity);
  const fanInNorm = Math.log(1 + file.fanIn);
  const fanOutNorm = Math.log(1 + file.fanOut);

  const risk =
    weights.loc * locNorm +
    weights.complexity * complexityNorm +
    weights.fanIn * fanInNorm +
    weights.fanOut * fanOutNorm +
    weights.cycle * (file.inCycle ? 1 : 0);

  return {
    locNorm,
    complexityNorm,
    fanInNorm,
    fanOutNorm,
    risk: round3(risk)
  };
}

export function MetricsInfoTab({
  model,
  riskByPath,
  weights,
  whatIfEnabled
}: MetricsInfoTabProps): JSX.Element {
  const rankedFiles = useMemo(
    () =>
      [...model.files].sort(
        (a, b) =>
          (riskByPath.get(b.path) ?? b.riskScore) -
          (riskByPath.get(a.path) ?? a.riskScore)
      ),
    [model.files, riskByPath]
  );

  const sampleFile = rankedFiles[0] ?? null;

  const avgRisk = useMemo(() => {
    return (
      model.files.reduce(
        (sum, file) => sum + (riskByPath.get(file.path) ?? file.riskScore),
        0
      ) / Math.max(1, model.files.length)
    );
  }, [model.files, riskByPath]);

  const dependencyStats = useMemo(() => {
    const internal = model.edges.filter((edge) => !edge.external).length;
    const external = model.edges.length - internal;
    return { internal, external };
  }, [model.edges]);

  const sample = useMemo(() => {
    if (!sampleFile) {
      return null;
    }

    return {
      file: sampleFile,
      breakdown: calculateBreakdown(sampleFile, weights),
      displayedRisk: round3(riskByPath.get(sampleFile.path) ?? sampleFile.riskScore)
    };
  }, [riskByPath, sampleFile, weights]);

  return (
    <section className="panel metrics-info-panel">
      <h3>Metric Calculation Info</h3>
      <p className="panel-subtitle">
        Exact formulas used by analyzer and dashboard.
      </p>

      <div className="metrics-info-grid">
        <article className="metrics-info-card">
          <h4>Current Config</h4>
          <div className="metrics-inline-grid">
            <div>
              <span className="muted">Risk Source</span>
              <strong>{whatIfEnabled ? "What-if weights" : "Saved analysis weights"}</strong>
            </div>
            <div>
              <span className="muted">Languages</span>
              <strong>{model.config.languages.join(", ")}</strong>
            </div>
            <div>
              <span className="muted">Exclude Patterns</span>
              <strong>{model.config.exclude.join(", ") || "none"}</strong>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Weight</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>loc</td>
                <td>{weights.loc}</td>
              </tr>
              <tr>
                <td>complexity</td>
                <td>{weights.complexity}</td>
              </tr>
              <tr>
                <td>fanIn</td>
                <td>{weights.fanIn}</td>
              </tr>
              <tr>
                <td>fanOut</td>
                <td>{weights.fanOut}</td>
              </tr>
              <tr>
                <td>cycle</td>
                <td>{weights.cycle}</td>
              </tr>
            </tbody>
          </table>
        </article>

        <article className="metrics-info-card">
          <h4>Risk Formula</h4>
          <pre className="metrics-formula">
{`risk =
  w.loc * ln(1 + loc) +
  w.complexity * ln(1 + complexity) +
  w.fanIn * ln(1 + fanIn) +
  w.fanOut * ln(1 + fanOut) +
  w.cycle * (inCycle ? 1 : 0)`}
          </pre>
          <p className="muted">Risk values are rounded to 3 decimals after calculation.</p>
          <p className="muted">Average Risk = sum(fileRisk) / fileCount.</p>
          <p className="muted">Top Risky Files = files sorted by current risk desc, first 12.</p>
        </article>

        <article className="metrics-info-card">
          <h4>Core Metric Definitions</h4>
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>How it is computed</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>LOC</td>
                <td>Count of non-empty trimmed lines in file.</td>
              </tr>
              <tr>
                <td>Complexity</td>
                <td>
                  Starts at 1, then adds matches of: if, for, while, case, catch, ternary '?',
                  '&&', '||' on comment-stripped source.
                </td>
              </tr>
              <tr>
                <td>fanOut</td>
                <td>Unique internal resolved imports going out from file.</td>
              </tr>
              <tr>
                <td>fanIn</td>
                <td>Count of internal edges that target this file.</td>
              </tr>
              <tr>
                <td>inCycle</td>
                <td>True if file is in SCC size {'>'} 1, or has a self-loop edge.</td>
              </tr>
              <tr>
                <td>dependencyCount</td>
                <td>Total unique edges (internal + external imports).</td>
              </tr>
              <tr>
                <td>cycleCount</td>
                <td>Number of cyclic SCC components (size {'>'} 1 or self-loop).</td>
              </tr>
              <tr>
                <td>sccCount</td>
                <td>Total strongly connected components from Tarjan SCC.</td>
              </tr>
            </tbody>
          </table>
        </article>

        <article className="metrics-info-card">
          <h4>Current Summary Snapshot</h4>
          <div className="summary-cards">
            <article className="summary-card">
              <span>File Count</span>
              <strong>{model.summary.fileCount}</strong>
            </article>
            <article className="summary-card">
              <span>Dependencies</span>
              <strong>{model.summary.dependencyCount}</strong>
            </article>
            <article className="summary-card">
              <span>Internal Edges</span>
              <strong>{dependencyStats.internal}</strong>
            </article>
            <article className="summary-card">
              <span>External Edges</span>
              <strong>{dependencyStats.external}</strong>
            </article>
            <article className="summary-card">
              <span>Cycle Count</span>
              <strong>{model.summary.cycleCount}</strong>
            </article>
            <article className="summary-card">
              <span>SCC Count</span>
              <strong>{model.summary.sccCount}</strong>
            </article>
            <article className="summary-card">
              <span>Average Risk</span>
              <strong>{avgRisk.toFixed(3)}</strong>
            </article>
          </div>
        </article>

        {sample ? (
          <article className="metrics-info-card">
            <h4>Live Example (Current Top Risk File)</h4>
            <p>
              <strong>{sample.file.path}</strong>
            </p>
            <table>
              <thead>
                <tr>
                  <th>Input</th>
                  <th>Value</th>
                  <th>ln(1 + value)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>loc</td>
                  <td>{sample.file.loc}</td>
                  <td>{sample.breakdown.locNorm.toFixed(3)}</td>
                </tr>
                <tr>
                  <td>complexity</td>
                  <td>{sample.file.complexity}</td>
                  <td>{sample.breakdown.complexityNorm.toFixed(3)}</td>
                </tr>
                <tr>
                  <td>fanIn</td>
                  <td>{sample.file.fanIn}</td>
                  <td>{sample.breakdown.fanInNorm.toFixed(3)}</td>
                </tr>
                <tr>
                  <td>fanOut</td>
                  <td>{sample.file.fanOut}</td>
                  <td>{sample.breakdown.fanOutNorm.toFixed(3)}</td>
                </tr>
                <tr>
                  <td>inCycle</td>
                  <td>{sample.file.inCycle ? "true" : "false"}</td>
                  <td>{sample.file.inCycle ? 1 : 0}</td>
                </tr>
              </tbody>
            </table>
            <p className="muted">
              Formula result (rounded): {sample.breakdown.risk.toFixed(3)}
            </p>
            <p className="muted">
              Displayed risk in dashboard right now: {sample.displayedRisk.toFixed(3)}
            </p>
          </article>
        ) : null}
      </div>
    </section>
  );
}
