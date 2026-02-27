import { useEffect, useMemo, useState } from "react";
import { DEFAULT_WEIGHTS, type RiskWeights } from "@ccv/model";
import { ArchitectureLayersView } from "./ArchitectureLayersView";
import type { AnalysisModel } from "../types";
import { CityView3D } from "./CityView3D";
import { ComplexityScatterPlot } from "./ComplexityScatterPlot";
import { CycleExplainer } from "./CycleExplainer";
import { DependencyGraph } from "./DependencyGraph";
import { FileDetailDrawer } from "./FileDetailDrawer";
import { MetricsInfoTab } from "./MetricsInfoTab";
import { RiskRadarView } from "./RiskRadarView";
import { TreemapView } from "./TreemapView";
import { WhatIfWeightsPanel } from "./WhatIfWeightsPanel";
import { riskMapForModel } from "../lib/risk";

interface DashboardProps {
  model: AnalysisModel | null;
  selectedFilePath: string | null;
  onFileSelected: (path: string) => void;
  onCloseDrawer: () => void;
  cityViewEnabled: boolean;
}

type DashboardTab = "overview" | "structural" | "deep" | "experimental" | "info";

export function Dashboard({
  model,
  selectedFilePath,
  onFileSelected,
  onCloseDrawer,
  cityViewEnabled
}: DashboardProps): JSX.Element {
  const [whatIfEnabled, setWhatIfEnabled] = useState(false);
  const [whatIfWeights, setWhatIfWeights] = useState<RiskWeights>(
    model?.config.weights ?? { ...DEFAULT_WEIGHTS }
  );
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");

  useEffect(() => {
    if (!model) {
      return;
    }
    setWhatIfEnabled(false);
    setWhatIfWeights({ ...model.config.weights });
    setActiveTab("overview");
  }, [model]);

  const activeRiskByPath = useMemo(() => {
    if (!model) {
      return new Map<string, number>();
    }
    if (whatIfEnabled) {
      return riskMapForModel(model, whatIfWeights);
    }

    return new Map(model.files.map((file) => [file.path, file.riskScore]));
  }, [model, whatIfEnabled, whatIfWeights]);

  const riskyFiles = useMemo(
    () => {
      if (!model) {
        return [];
      }
      return [...model.files]
        .sort(
          (a, b) =>
            (activeRiskByPath.get(b.path) ?? b.riskScore) -
            (activeRiskByPath.get(a.path) ?? a.riskScore)
        )
        .slice(0, 12);
    },
    [activeRiskByPath, model]
  );

  const avgRisk = useMemo(
    () => {
      if (!model) {
        return 0;
      }
      return (
        model.files.reduce(
          (accumulator, file) => accumulator + (activeRiskByPath.get(file.path) ?? file.riskScore),
          0
        ) / Math.max(1, model.files.length)
      );
    },
    [activeRiskByPath, model]
  );

  const cycleFiles = useMemo(
    () => (model ? model.files.filter((file) => file.inCycle).length : 0),
    [model]
  );

  const handleResetWhatIf = (): void => {
    if (!model) {
      return;
    }
    setWhatIfEnabled(false);
    setWhatIfWeights({ ...model.config.weights });
  };

  if (!model) {
    return (
      <section className="panel">
        <h2>Dashboard</h2>
        <p className="muted">Run analysis to view treemap, graph, and cycle reports.</p>
      </section>
    );
  }

  return (
    <div className="dashboard-grid">
      <section className="panel dashboard-summary">
        <h3>Project Summary</h3>
        <div className="summary-cards">
          <article className="summary-card">
            <span>Total Files</span>
            <strong>{model.summary.fileCount}</strong>
          </article>
          <article className="summary-card">
            <span>Dependencies</span>
            <strong>{model.summary.dependencyCount}</strong>
          </article>
          <article className="summary-card">
            <span>{whatIfEnabled ? "Average Risk (What-if)" : "Average Risk"}</span>
            <strong>{avgRisk.toFixed(2)}</strong>
          </article>
          <article className="summary-card">
            <span>Files In Cycles</span>
            <strong>{cycleFiles}</strong>
          </article>
        </div>

        <nav className="dashboard-tabs" aria-label="Dashboard sections">
          <button
            className={activeTab === "overview" ? "tab active" : "tab"}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </button>
          <button
            className={activeTab === "structural" ? "tab active" : "tab"}
            onClick={() => setActiveTab("structural")}
          >
            Structural
          </button>
          <button className={activeTab === "deep" ? "tab active" : "tab"} onClick={() => setActiveTab("deep")}>
            Deep Analysis
          </button>
          <button
            className={activeTab === "experimental" ? "tab active" : "tab"}
            onClick={() => setActiveTab("experimental")}
          >
            Experimental
          </button>
          <button className={activeTab === "info" ? "tab active" : "tab"} onClick={() => setActiveTab("info")}>
            Info
          </button>
        </nav>
      </section>

      <div className="dashboard-tab-content">
        {activeTab === "overview" ? (
          <>
            <TreemapView model={model} riskByPath={activeRiskByPath} onFileSelected={onFileSelected} />

            <section className="panel risky-table-panel">
              <h3>Top Risky Files</h3>
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Risk</th>
                    <th>Complexity</th>
                    <th>Cycle</th>
                  </tr>
                </thead>
                <tbody>
                  {riskyFiles.map((file) => (
                    <tr key={file.path} onClick={() => onFileSelected(file.path)}>
                      <td>{file.path}</td>
                      <td>{(activeRiskByPath.get(file.path) ?? file.riskScore).toFixed(3)}</td>
                      <td>{file.complexity}</td>
                      <td>{file.inCycle ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        ) : null}

        {activeTab === "structural" ? (
          <>
            <ArchitectureLayersView model={model} onFileSelected={onFileSelected} />
            <DependencyGraph model={model} onFileSelected={onFileSelected} />
          </>
        ) : null}

        {activeTab === "deep" ? (
          <>
            <WhatIfWeightsPanel
              model={model}
              enabled={whatIfEnabled}
              weights={whatIfWeights}
              onEnabledChange={setWhatIfEnabled}
              onWeightsChange={setWhatIfWeights}
              onReset={handleResetWhatIf}
              onFileSelected={onFileSelected}
            />
            <ComplexityScatterPlot model={model} riskByPath={activeRiskByPath} onFileSelected={onFileSelected} />
            <CycleExplainer model={model} onFileSelected={onFileSelected} />
          </>
        ) : null}

        {activeTab === "experimental" ? (
          <>
            <RiskRadarView
              model={model}
              riskByPath={activeRiskByPath}
              selectedFilePath={selectedFilePath}
              onFileSelected={onFileSelected}
            />
            {cityViewEnabled ? (
              <CityView3D model={model} onFileSelected={onFileSelected} />
            ) : (
              <section className="panel">
                <h3>Experimental</h3>
                <p className="muted">
                  3D City View is currently disabled. Enable it in Settings to use this tab.
                </p>
              </section>
            )}
          </>
        ) : null}

        {activeTab === "info" ? (
          <MetricsInfoTab
            model={model}
            riskByPath={activeRiskByPath}
            weights={whatIfEnabled ? whatIfWeights : model.config.weights}
            whatIfEnabled={whatIfEnabled}
          />
        ) : null}
      </div>

      <FileDetailDrawer model={model} selectedPath={selectedFilePath} onClose={onCloseDrawer} />
    </div>
  );
}
