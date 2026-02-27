import { useMemo, useState } from "react";
import type { AnalysisModel } from "../types";

interface CycleExplainerProps {
  model: AnalysisModel;
  onFileSelected: (path: string) => void;
}

interface CycleEdge {
  from: string;
  to: string;
}

interface CycleDetails {
  id: number;
  nodes: string[];
  pathNodes: string[];
  pathEdges: CycleEdge[];
  suggestedBreak: CycleEdge | null;
  score: number;
}

function hasSelfLoop(model: AnalysisModel, node: string): boolean {
  return model.edges.some((edge) => !edge.external && edge.from === node && edge.to === node);
}

function buildAdjacency(model: AnalysisModel): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();

  for (const edge of model.edges) {
    if (edge.external) {
      continue;
    }

    const existing = adjacency.get(edge.from);
    if (existing) {
      existing.push(edge.to);
    } else {
      adjacency.set(edge.from, [edge.to]);
    }
  }

  return adjacency;
}

function findCyclePathForComponent(
  nodes: string[],
  adjacency: ReadonlyMap<string, string[]>
): string[] | null {
  if (nodes.length === 0) {
    return null;
  }

  if (nodes.length === 1) {
    const single = nodes[0];
    if (!single) {
      return null;
    }

    const neighbors = adjacency.get(single) ?? [];
    if (neighbors.includes(single)) {
      return [single, single];
    }
    return null;
  }

  const nodeSet = new Set(nodes);

  const dfs = (
    start: string,
    current: string,
    path: string[],
    inPath: Set<string>
  ): string[] | null => {
    const neighbors = adjacency.get(current) ?? [];

    for (const next of neighbors) {
      if (!nodeSet.has(next)) {
        continue;
      }

      if (next === start && path.length > 1) {
        return [...path, start];
      }

      if (!inPath.has(next)) {
        inPath.add(next);
        const found = dfs(start, next, [...path, next], inPath);
        inPath.delete(next);
        if (found) {
          return found;
        }
      }
    }

    return null;
  };

  for (const start of nodes) {
    const found = dfs(start, start, [start], new Set([start]));
    if (found) {
      return found;
    }
  }

  return null;
}

function edgesFromPath(pathNodes: string[]): CycleEdge[] {
  const edges: CycleEdge[] = [];

  for (let index = 0; index < pathNodes.length - 1; index += 1) {
    const from = pathNodes[index];
    const to = pathNodes[index + 1];
    if (!from || !to) {
      continue;
    }

    edges.push({ from, to });
  }

  return edges;
}

export function CycleExplainer({ model, onFileSelected }: CycleExplainerProps): JSX.Element {
  const filesByPath = useMemo(() => {
    return new Map(model.files.map((file) => [file.path, file] as const));
  }, [model.files]);

  const cycleDetails = useMemo<CycleDetails[]>(() => {
    const adjacency = buildAdjacency(model);

    return model.scc
      .filter((component) => {
        if (component.size > 1) {
          return true;
        }

        const single = component.nodes[0];
        return single ? hasSelfLoop(model, single) : false;
      })
      .map((component) => {
        const pathNodes =
          findCyclePathForComponent(component.nodes, adjacency) ??
          (component.nodes.length > 1
            ? [...component.nodes, component.nodes[0]].filter((node): node is string => Boolean(node))
            : [...component.nodes]);

        const pathEdges = edgesFromPath(pathNodes);

        let suggestedBreak: CycleEdge | null = null;
        let score = Number.POSITIVE_INFINITY;

        for (const edge of pathEdges) {
          const fromFile = filesByPath.get(edge.from);
          const toFile = filesByPath.get(edge.to);

          const candidateScore =
            (fromFile?.fanOut ?? 0) * 1.4 +
            (toFile?.fanIn ?? 0) * 1.2 +
            (toFile?.riskScore ?? 0) * 0.6 +
            (fromFile?.complexity ?? 0) * 0.2;

          if (candidateScore < score) {
            suggestedBreak = edge;
            score = candidateScore;
          }
        }

        return {
          id: component.id,
          nodes: component.nodes,
          pathNodes,
          pathEdges,
          suggestedBreak,
          score: Number.isFinite(score) ? score : 0
        };
      })
      .sort((a, b) => b.nodes.length - a.nodes.length || b.score - a.score);
  }, [filesByPath, model]);

  const [selectedCycleId, setSelectedCycleId] = useState<number>(cycleDetails[0]?.id ?? -1);

  const selectedCycle = useMemo(() => {
    const selected = cycleDetails.find((entry) => entry.id === selectedCycleId);
    return selected ?? cycleDetails[0] ?? null;
  }, [cycleDetails, selectedCycleId]);

  return (
    <section className="panel cycle-explainer-panel">
      <h3>Cycle Explainer</h3>
      <p className="panel-subtitle">
        Shows a concrete cycle path and a recommended dependency edge to break first.
      </p>

      {cycleDetails.length === 0 ? (
        <p className="muted">No cycles detected.</p>
      ) : (
        <div className="cycle-explainer-grid">
          <aside className="cycle-sidebar">
            {cycleDetails.map((cycle) => (
              <button
                key={cycle.id}
                className={selectedCycle?.id === cycle.id ? "cycle-card active" : "cycle-card"}
                onClick={() => setSelectedCycleId(cycle.id)}
              >
                <strong>Cycle #{cycle.id}</strong>
                <span>{cycle.nodes.length} nodes</span>
                <span>{cycle.pathEdges.length} edges</span>
              </button>
            ))}
          </aside>

          <div className="cycle-main">
            <h4>Cycle #{selectedCycle?.id}</h4>

            <div className="cycle-path">
              {(selectedCycle?.pathNodes ?? []).map((node, index) => (
                <div key={`${node}-${index}`} className="cycle-path-node-row">
                  <button className="pill" onClick={() => onFileSelected(node)}>
                    {node}
                  </button>
                  {index < (selectedCycle?.pathNodes.length ?? 0) - 1 ? (
                    <span className="cycle-arrow">-&gt;</span>
                  ) : null}
                </div>
              ))}
            </div>

            <h4>Edge Breakdown</h4>
            <table>
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>From fanOut</th>
                  <th>To fanIn</th>
                  <th>To risk</th>
                </tr>
              </thead>
              <tbody>
                {(selectedCycle?.pathEdges ?? []).map((edge, index) => {
                  const fromFile = filesByPath.get(edge.from);
                  const toFile = filesByPath.get(edge.to);
                  const isRecommended =
                    selectedCycle?.suggestedBreak?.from === edge.from &&
                    selectedCycle?.suggestedBreak?.to === edge.to;

                  return (
                    <tr
                      key={`${edge.from}-${edge.to}-${index}`}
                      className={isRecommended ? "cycle-recommended" : ""}
                    >
                      <td>
                        <button className="link-button" onClick={() => onFileSelected(edge.from)}>
                          {edge.from}
                        </button>
                      </td>
                      <td>
                        <button className="link-button" onClick={() => onFileSelected(edge.to)}>
                          {edge.to}
                        </button>
                      </td>
                      <td>{fromFile?.fanOut ?? 0}</td>
                      <td>{toFile?.fanIn ?? 0}</td>
                      <td>{(toFile?.riskScore ?? 0).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {selectedCycle?.suggestedBreak ? (
              <div className="cycle-recommendation">
                <strong>Suggested first break</strong>
                <span>
                  Decouple <code>{selectedCycle.suggestedBreak.from}</code> from <code>
                    {selectedCycle.suggestedBreak.to}
                  </code>{" "}
                  via interface inversion, event dispatch, or extracting shared contracts.
                </span>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
