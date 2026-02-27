import { useMemo, useState } from "react";
import type { AnalysisModel } from "../types";

interface ArchitectureLayersViewProps {
  model: AnalysisModel;
  onFileSelected: (path: string) => void;
}

type FileEntry = AnalysisModel["files"][number];

interface ModuleSummary {
  name: string;
  fileCount: number;
  totalLoc: number;
  avgRisk: number;
  maxRisk: number;
  cycleFiles: number;
  files: FileEntry[];
}

interface ModuleFlow {
  from: string;
  to: string;
  count: number;
  avgRisk: number;
}

function moduleFromPath(filePath: string): string {
  const segments = filePath.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return "(root)";
  }

  return segments[0] ?? "(root)";
}

export function ArchitectureLayersView({
  model,
  onFileSelected
}: ArchitectureLayersViewProps): JSX.Element {
  const modules = useMemo<ModuleSummary[]>(() => {
    const grouped = new Map<string, FileEntry[]>();

    for (const file of model.files) {
      const moduleName = moduleFromPath(file.path);
      const existing = grouped.get(moduleName);
      if (existing) {
        existing.push(file);
      } else {
        grouped.set(moduleName, [file]);
      }
    }

    return [...grouped.entries()]
      .map(([name, files]) => {
        const totalLoc = files.reduce((sum, file) => sum + file.loc, 0);
        const totalRisk = files.reduce((sum, file) => sum + file.riskScore, 0);
        const maxRisk = files.reduce((max, file) => Math.max(max, file.riskScore), 0);
        const cycleFiles = files.filter((file) => file.inCycle).length;

        return {
          name,
          fileCount: files.length,
          totalLoc,
          avgRisk: totalRisk / Math.max(1, files.length),
          maxRisk,
          cycleFiles,
          files
        };
      })
      .sort((a, b) => b.avgRisk - a.avgRisk || b.fileCount - a.fileCount || a.name.localeCompare(b.name));
  }, [model.files]);

  const flows = useMemo<ModuleFlow[]>(() => {
    const grouped = new Map<string, { count: number; totalRisk: number }>();

    for (const edge of model.edges) {
      if (edge.external) {
        continue;
      }

      const fromModule = moduleFromPath(edge.from);
      const toModule = moduleFromPath(edge.to);
      if (fromModule === toModule) {
        continue;
      }

      const key = `${fromModule}=>${toModule}`;
      const fromRisk = model.files.find((file) => file.path === edge.from)?.riskScore ?? 0;
      const toRisk = model.files.find((file) => file.path === edge.to)?.riskScore ?? 0;
      const risk = (fromRisk + toRisk) / 2;

      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
        existing.totalRisk += risk;
      } else {
        grouped.set(key, { count: 1, totalRisk: risk });
      }
    }

    return [...grouped.entries()]
      .map(([key, metrics]) => {
        const [from, to] = key.split("=>");
        return {
          from: from ?? "(unknown)",
          to: to ?? "(unknown)",
          count: metrics.count,
          avgRisk: metrics.totalRisk / Math.max(1, metrics.count)
        };
      })
      .sort((a, b) => b.count - a.count || b.avgRisk - a.avgRisk)
      .slice(0, 18);
  }, [model.edges, model.files]);

  const [selectedModuleName, setSelectedModuleName] = useState<string>(modules[0]?.name ?? "");

  const selectedModule = useMemo(() => {
    const selected = modules.find((entry) => entry.name === selectedModuleName);
    return selected ?? modules[0] ?? null;
  }, [modules, selectedModuleName]);

  const maxFlowCount = useMemo(() => {
    if (flows.length === 0) {
      return 1;
    }
    return Math.max(1, ...flows.map((flow) => flow.count));
  }, [flows]);

  return (
    <section className="panel architecture-panel">
      <h3>Architectural Layers View</h3>
      <p className="panel-subtitle">
        Modules are grouped by top-level folder. Use this to inspect cross-module coupling and risky
        boundaries.
      </p>

      <div className="module-grid">
        {modules.map((module) => {
          const active = selectedModule?.name === module.name;
          return (
            <button
              key={module.name}
              className={active ? "module-card active" : "module-card"}
              onClick={() => setSelectedModuleName(module.name)}
            >
              <strong>{module.name}</strong>
              <span>{module.fileCount} files</span>
              <span>avg risk {module.avgRisk.toFixed(2)}</span>
              <span>{module.cycleFiles} in cycle</span>
            </button>
          );
        })}
      </div>

      <div className="architecture-split">
        <section className="module-detail">
          <h4>{selectedModule?.name ?? "No module selected"}</h4>
          {selectedModule ? (
            <>
              <p className="muted">
                Files: {selectedModule.fileCount} | LOC: {selectedModule.totalLoc} | Max risk: {" "}
                {selectedModule.maxRisk.toFixed(2)}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Top Risky Files</th>
                    <th>Risk</th>
                    <th>Complexity</th>
                    <th>Cycle</th>
                  </tr>
                </thead>
                <tbody>
                  {[...selectedModule.files]
                    .sort((a, b) => b.riskScore - a.riskScore)
                    .slice(0, 8)
                    .map((file) => (
                      <tr key={file.path} onClick={() => onFileSelected(file.path)}>
                        <td>{file.path}</td>
                        <td>{file.riskScore.toFixed(3)}</td>
                        <td>{file.complexity}</td>
                        <td>{file.inCycle ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="muted">No module data available.</p>
          )}
        </section>

        <section className="module-flows">
          <h4>Top Cross-Module Flows</h4>
          {flows.length === 0 ? (
            <p className="muted">No cross-module dependencies detected.</p>
          ) : (
            <ul className="flow-list">
              {flows.map((flow) => {
                const width = Math.max(6, (flow.count / maxFlowCount) * 100);
                return (
                  <li key={`${flow.from}-${flow.to}`}>
                    <div className="flow-line">
                      <span>{flow.from}</span>
                      <span>{flow.to}</span>
                    </div>
                    <div className="flow-bar-track">
                      <div className="flow-bar" style={{ width: `${width}%` }} />
                    </div>
                    <div className="flow-metrics">
                      <span>{flow.count} edges</span>
                      <span>avg risk {flow.avgRisk.toFixed(2)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
