import type { AnalysisModel } from "../types";

interface CycleReportProps {
  model: AnalysisModel;
  onFileSelected: (path: string) => void;
}

export function CycleReport({ model, onFileSelected }: CycleReportProps): JSX.Element {
  const cyclicComponents = model.scc.filter((component) => {
    if (component.size > 1) {
      return true;
    }

    const node = component.nodes[0];
    if (!node) {
      return false;
    }

    return model.edges.some((edge) => !edge.external && edge.from === node && edge.to === node);
  });

  return (
    <section className="panel">
      <h3>Cycle Report</h3>
      {cyclicComponents.length === 0 ? (
        <p className="muted">No cycles detected.</p>
      ) : (
        <ul className="cycle-list">
          {cyclicComponents.map((component) => (
            <li key={component.id}>
              <strong>Cycle #{component.id}</strong>
              <span>{component.nodes.length} files</span>
              <div className="cycle-pill-row">
                {component.nodes.map((node) => (
                  <button key={node} className="pill" onClick={() => onFileSelected(node)}>
                    {node}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
