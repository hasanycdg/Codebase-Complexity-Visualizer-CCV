import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import type { AnalysisModel } from "../types";

interface DependencyGraphProps {
  model: AnalysisModel;
  onFileSelected: (path: string) => void;
}

type LayoutMode = "cose" | "breadthfirst" | "concentric";
type ScopeMode = "all" | "top250" | "top120" | "cycles";

interface SelectedNodeMetrics {
  path: string;
  risk: number;
  loc: number;
  complexity: number;
  fanIn: number;
  fanOut: number;
  inCycle: boolean;
}

interface GraphNode {
  path: string;
  label: string;
  risk: number;
  loc: number;
  complexity: number;
  fanIn: number;
  fanOut: number;
  inCycle: number;
  directory: string;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
}

const DIR_PALETTE = ["#87d4c2", "#7db9ff", "#f2cc8f", "#d9a7ff", "#8ddab0", "#efab97"];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function topDirectory(path: string): string {
  const [head] = path.split("/");
  return head ?? "root";
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  if (maxLength <= 3) {
    return text.slice(0, maxLength);
  }
  return `${text.slice(0, maxLength - 3)}...`;
}

export function DependencyGraph({ model, onFileSelected }: DependencyGraphProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const [layoutMode, setLayoutMode] = useState<LayoutMode>("concentric");
  const [scopeMode, setScopeMode] = useState<ScopeMode>("top250");
  const [selectedNode, setSelectedNode] = useState<SelectedNodeMetrics | null>(null);

  const maxRiskAll = useMemo(
    () => Math.max(1, ...model.files.map((file) => file.riskScore)),
    [model.files]
  );

  const nodeMetricsByPath = useMemo(() => {
    const entries = model.files.map((file) => [file.path, file] as const);
    return new Map(entries);
  }, [model.files]);

  const scopedNodeIds = useMemo(() => {
    if (scopeMode === "all") {
      return new Set(model.files.map((file) => file.path));
    }

    if (scopeMode === "cycles") {
      return new Set(model.files.filter((file) => file.inCycle).map((file) => file.path));
    }

    const limit = scopeMode === "top120" ? 120 : 250;
    const top = [...model.files]
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, Math.min(limit, model.files.length));

    return new Set(top.map((file) => file.path));
  }, [model.files, scopeMode]);

  const scopedNodes = useMemo<GraphNode[]>(() => {
    return model.files
      .filter((file) => scopedNodeIds.has(file.path))
      .map((file) => {
        const segments = file.path.split("/");
        const basename = segments[segments.length - 1] ?? file.path;
        const directory = topDirectory(file.path);
        const colorIndex = hashString(directory) % DIR_PALETTE.length;

        return {
          path: file.path,
          label: truncate(basename, 24),
          risk: file.riskScore,
          loc: file.loc,
          complexity: file.complexity,
          fanIn: file.fanIn,
          fanOut: file.fanOut,
          inCycle: file.inCycle ? 1 : 0,
          directory: DIR_PALETTE[colorIndex] ?? "#87d4c2"
        };
      });
  }, [model.files, scopedNodeIds]);

  const scopedEdges = useMemo<GraphEdge[]>(() => {
    return model.edges
      .filter((edge) => !edge.external)
      .filter((edge) => scopedNodeIds.has(edge.from) && scopedNodeIds.has(edge.to))
      .map((edge) => {
        const source = nodeMetricsByPath.get(edge.from);
        const target = nodeMetricsByPath.get(edge.to);
        const sourceRisk = source?.riskScore ?? 0;
        const targetRisk = target?.riskScore ?? 0;

        return {
          id: `${edge.from}->${edge.to}`,
          source: edge.from,
          target: edge.to,
          weight: (sourceRisk + targetRisk) / 2
        };
      });
  }, [model.edges, nodeMetricsByPath, scopedNodeIds]);

  const maxRisk = useMemo(() => {
    if (scopedNodes.length === 0) {
      return 1;
    }
    return Math.max(1, ...scopedNodes.map((node) => node.risk));
  }, [scopedNodes]);

  const maxLoc = useMemo(() => {
    if (scopedNodes.length === 0) {
      return 1;
    }
    return Math.max(1, ...scopedNodes.map((node) => node.loc));
  }, [scopedNodes]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    const elements = [
      ...scopedNodes.map((node) => ({
        data: {
          id: node.path,
          path: node.path,
          label: node.label,
          risk: node.risk,
          loc: node.loc,
          complexity: node.complexity,
          fanIn: node.fanIn,
          fanOut: node.fanOut,
          inCycle: node.inCycle,
          dirColor: node.directory
        }
      })),
      ...scopedEdges.map((edge) => ({
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          weight: edge.weight
        }
      }))
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      wheelSensitivity: 0.17,
      minZoom: 0.1,
      maxZoom: 2.8,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            color: "#f7f4ed",
            "font-size": 11,
            "font-weight": "bold",
            "text-wrap": "ellipsis",
            "text-max-width": "126px",
            "text-valign": "bottom",
            "text-margin-y": 10,
            "text-outline-width": 3,
            "text-outline-color": "#0d1312",
            "background-color": `mapData(risk, 0, ${maxRisk}, #1b7b72, #ff6a3b)`,
            width: `mapData(loc, 0, ${maxLoc}, 18, 62)`,
            height: `mapData(loc, 0, ${maxLoc}, 18, 62)`,
            "border-width": "mapData(inCycle, 0, 1, 1.5, 4.2)",
            "border-color": "data(dirColor)",
            "overlay-padding": 10
          }
        },
        {
          selector: "node[inCycle = 1]",
          style: {
            "border-color": "#ff4a2f",
            "border-style": "solid"
          }
        },
        {
          selector: "edge",
          style: {
            width: `mapData(weight, 0, ${maxRiskAll}, 1, 3.2)`,
            opacity: 0.4,
            "line-color": `mapData(weight, 0, ${maxRiskAll}, #5f8d88, #f0aa80)`,
            "target-arrow-color": `mapData(weight, 0, ${maxRiskAll}, #5f8d88, #f0aa80)`,
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.82,
            "curve-style": "bezier",
            "control-point-step-size": 22
          }
        },
        {
          selector: "node:selected",
          style: {
            "overlay-color": "#ff9a66",
            "overlay-opacity": 0.28,
            "overlay-padding": 15
          }
        },
        {
          selector: "edge:selected",
          style: {
            opacity: 0.95,
            width: 3.8,
            "line-color": "#ffe0bc",
            "target-arrow-color": "#ffe0bc"
          }
        },
        {
          selector: ".faded",
          style: {
            opacity: 0.1
          }
        },
        {
          selector: ".active",
          style: {
            opacity: 1
          }
        }
      ]
    });

    cyRef.current = cy;

    const layout =
      layoutMode === "breadthfirst"
        ? cy.layout({
            name: "breadthfirst",
            directed: true,
            padding: 120,
            spacingFactor: 1.35,
            circle: false,
            avoidOverlap: true
          })
        : layoutMode === "concentric"
          ? cy.layout({
              name: "concentric",
              padding: 110,
              minNodeSpacing: 24,
              avoidOverlap: true,
              levelWidth: () => 3,
              concentric: (node) => Number(node.data("risk")) + Number(node.data("fanIn")) * 0.8
            })
          : cy.layout({
              name: "cose",
              animate: true,
              animationDuration: 500,
              padding: 110,
              idealEdgeLength: scopedNodes.length > 220 ? 90 : 130,
              nodeRepulsion: scopedNodes.length > 220 ? 20000 : 26000,
              gravity: 0.25,
              numIter: scopedNodes.length > 220 ? 1700 : 1200,
              componentSpacing: 180,
              initialTemp: 220,
              coolingFactor: 0.95,
              minTemp: 1
            });

    layout.run();

    cy.ready(() => {
      cy.fit(undefined, 100);
    });

    const clearFaded = (): void => {
      cy.elements().removeClass("faded");
      cy.elements().removeClass("active");
    };

    cy.on("tap", "node", (event) => {
      const node = event.target;
      const neighborhood = node.closedNeighborhood();

      cy.elements().addClass("faded");
      neighborhood.removeClass("faded");
      neighborhood.addClass("active");
      node.connectedEdges().addClass("active");

      const metrics: SelectedNodeMetrics = {
        path: String(node.data("path")),
        risk: Number(node.data("risk")),
        loc: Number(node.data("loc")),
        complexity: Number(node.data("complexity")),
        fanIn: Number(node.data("fanIn")),
        fanOut: Number(node.data("fanOut")),
        inCycle: Number(node.data("inCycle")) === 1
      };

      setSelectedNode(metrics);
      onFileSelected(metrics.path);
    });

    cy.on("tap", (event) => {
      if (event.target === cy) {
        clearFaded();
      }
    });

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [layoutMode, maxLoc, maxRisk, maxRiskAll, onFileSelected, scopedEdges, scopedNodes]);

  const zoomIn = (): void => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }

    const next = Math.min(cy.maxZoom(), cy.zoom() * 1.22);
    cy.zoom({ level: next, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  };

  const zoomOut = (): void => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }

    const next = Math.max(cy.minZoom(), cy.zoom() / 1.22);
    cy.zoom({ level: next, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  };

  const fitGraph = (): void => {
    cyRef.current?.fit(undefined, 100);
  };

  const recenter = (): void => {
    cyRef.current?.center();
  };

  return (
    <section className="panel graph-panel">
      <div className="graph-header">
        <h3>Dependency Graph</h3>
        <div className="graph-actions">
          <button className="button-ghost" onClick={fitGraph}>
            Fit
          </button>
          <button className="button-ghost" onClick={recenter}>
            Center
          </button>
          <button className="button-ghost" onClick={zoomOut}>
            -
          </button>
          <button className="button-ghost" onClick={zoomIn}>
            +
          </button>
        </div>
      </div>

      <div className="graph-filters">
        <label>
          Layout
          <select value={layoutMode} onChange={(event) => setLayoutMode(event.target.value as LayoutMode)}>
            <option value="cose">Organic (Best for complexity)</option>
            <option value="breadthfirst">Dependency Flow</option>
            <option value="concentric">Risk Rings (Default)</option>
          </select>
        </label>

        <label>
          Scope
          <select value={scopeMode} onChange={(event) => setScopeMode(event.target.value as ScopeMode)}>
            <option value="top250">Top 250 risky files</option>
            <option value="top120">Top 120 risky files</option>
            <option value="all">All files</option>
            <option value="cycles">Only cycle files</option>
          </select>
        </label>

        <div className="graph-legend">
          <span>
            Nodes: <strong>{scopedNodes.length}</strong>
          </span>
          <span>
            Edges: <strong>{scopedEdges.length}</strong>
          </span>
          <span>Size=LOC</span>
          <span>Color=Risk</span>
          <span>Red border=Cycle</span>
        </div>
      </div>

      <div className="graph-canvas" ref={containerRef} />

      {selectedNode ? (
        <div className="graph-detail">
          <strong>{selectedNode.path}</strong>
          <span>Risk: {selectedNode.risk.toFixed(3)}</span>
          <span>
            LOC: {selectedNode.loc} | Complexity: {selectedNode.complexity} | Fan-In: {selectedNode.fanIn} |
            Fan-Out: {selectedNode.fanOut}
          </span>
          <span>{selectedNode.inCycle ? "In cycle" : "No cycle"}</span>
        </div>
      ) : (
        <div className="graph-detail muted">
          Click a node to focus its neighborhood and open file details.
        </div>
      )}
    </section>
  );
}
