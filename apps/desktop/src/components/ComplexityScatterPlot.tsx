import { useMemo, useState } from "react";
import type { AnalysisModel } from "../types";

interface ComplexityScatterPlotProps {
  model: AnalysisModel;
  riskByPath: ReadonlyMap<string, number>;
  onFileSelected: (path: string) => void;
}

interface Point {
  path: string;
  loc: number;
  complexity: number;
  fanIn: number;
  risk: number;
  inCycle: boolean;
  x: number;
  y: number;
  r: number;
}

function interpolateColor(ratio: number): string {
  const clamped = Math.min(1, Math.max(0, ratio));
  const start = { r: 36, g: 141, b: 129 };
  const mid = { r: 243, g: 189, b: 103 };
  const end = { r: 230, g: 78, b: 47 };

  const toHex = (value: number): string => value.toString(16).padStart(2, "0");

  const mix = (a: number, b: number, t: number): number => Math.round(a + (b - a) * t);

  if (clamped < 0.5) {
    const t = clamped / 0.5;
    const r = mix(start.r, mid.r, t);
    const g = mix(start.g, mid.g, t);
    const b = mix(start.b, mid.b, t);
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  const t = (clamped - 0.5) / 0.5;
  const r = mix(mid.r, end.r, t);
  const g = mix(mid.g, end.g, t);
  const b = mix(mid.b, end.b, t);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function ComplexityScatterPlot({
  model,
  riskByPath,
  onFileSelected
}: ComplexityScatterPlotProps): JSX.Element {
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  const width = 980;
  const height = 560;
  const padding = { top: 30, right: 24, bottom: 56, left: 70 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const maxLogLoc = useMemo(
    () => Math.max(1, ...model.files.map((file) => Math.log1p(file.loc))),
    [model.files]
  );
  const maxLogComplexity = useMemo(
    () => Math.max(1, ...model.files.map((file) => Math.log1p(file.complexity))),
    [model.files]
  );
  const maxFanIn = useMemo(() => Math.max(1, ...model.files.map((file) => file.fanIn)), [model.files]);

  const riskExtent = useMemo(() => {
    const values = model.files.map((file) => riskByPath.get(file.path) ?? file.riskScore);
    return {
      min: Math.min(...values),
      max: Math.max(...values)
    };
  }, [model.files, riskByPath]);

  const points = useMemo<Point[]>(() => {
    return model.files.map((file) => {
      const logLoc = Math.log1p(file.loc);
      const logComplexity = Math.log1p(file.complexity);
      const x = padding.left + (logLoc / maxLogLoc) * innerWidth;
      const y = padding.top + (1 - logComplexity / maxLogComplexity) * innerHeight;
      const r = 4 + (file.fanIn / maxFanIn) * 10;
      const risk = riskByPath.get(file.path) ?? file.riskScore;

      return {
        path: file.path,
        loc: file.loc,
        complexity: file.complexity,
        fanIn: file.fanIn,
        risk,
        inCycle: file.inCycle,
        x,
        y,
        r
      };
    });
  }, [innerHeight, innerWidth, maxFanIn, maxLogComplexity, maxLogLoc, model.files, riskByPath]);

  const hovered = hoveredPath ? points.find((point) => point.path === hoveredPath) ?? null : null;

  const tickRatios = [0, 0.25, 0.5, 0.75, 1];

  return (
    <section className="panel scatter-panel">
      <h3>Complexity vs LOC Scatter</h3>
      <p className="panel-subtitle">
        X = LOC (log), Y = complexity (log), color = risk, bubble size = fan-in, red stroke = cycle.
      </p>

      <svg
        className="scatter-canvas"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Complexity scatter plot"
      >
        <rect x={0} y={0} width={width} height={height} fill="rgba(12,18,17,0.55)" />

        {tickRatios.map((ratio) => {
          const y = padding.top + (1 - ratio) * innerHeight;
          const value = Math.exp(ratio * maxLogComplexity) - 1;
          return (
            <g key={`y-${ratio}`}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + innerWidth}
                y2={y}
                stroke="rgba(141,168,160,0.22)"
                strokeWidth={1}
              />
              <text x={padding.left - 10} y={y + 4} fill="#90a9a3" fontSize={11} textAnchor="end">
                {Math.round(value)}
              </text>
            </g>
          );
        })}

        {tickRatios.map((ratio) => {
          const x = padding.left + ratio * innerWidth;
          const value = Math.exp(ratio * maxLogLoc) - 1;
          return (
            <g key={`x-${ratio}`}>
              <line
                x1={x}
                y1={padding.top}
                x2={x}
                y2={padding.top + innerHeight}
                stroke="rgba(141,168,160,0.22)"
                strokeWidth={1}
              />
              <text x={x} y={padding.top + innerHeight + 20} fill="#90a9a3" fontSize={11} textAnchor="middle">
                {Math.round(value)}
              </text>
            </g>
          );
        })}

        <line
          x1={padding.left}
          y1={padding.top + innerHeight}
          x2={padding.left + innerWidth}
          y2={padding.top + innerHeight}
          stroke="#7f9a94"
          strokeWidth={1.5}
        />
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={padding.top + innerHeight}
          stroke="#7f9a94"
          strokeWidth={1.5}
        />

        <text
          x={padding.left + innerWidth / 2}
          y={height - 10}
          fill="#b1c5bf"
          fontSize={12}
          textAnchor="middle"
        >
          LOC (log scale)
        </text>
        <text
          transform={`translate(18 ${padding.top + innerHeight / 2}) rotate(-90)`}
          fill="#b1c5bf"
          fontSize={12}
          textAnchor="middle"
        >
          Complexity (log scale)
        </text>

        {points.map((point) => {
          const ratio =
            (point.risk - riskExtent.min) /
            Math.max(0.00001, riskExtent.max - riskExtent.min);
          const fill = interpolateColor(ratio);
          const isHovered = hoveredPath === point.path;

          return (
            <circle
              key={point.path}
              cx={point.x}
              cy={point.y}
              r={isHovered ? point.r + 2 : point.r}
              fill={fill}
              fillOpacity={isHovered ? 0.96 : 0.82}
              stroke={point.inCycle ? "#ff4a2d" : "rgba(245,246,232,0.45)"}
              strokeWidth={point.inCycle ? 2.4 : 1.1}
              onMouseEnter={() => setHoveredPath(point.path)}
              onMouseLeave={() => setHoveredPath(null)}
              onClick={() => onFileSelected(point.path)}
              style={{ cursor: "pointer" }}
            />
          );
        })}
      </svg>

      <div className="scatter-meta">
        {hovered ? (
          <>
            <strong>{hovered.path}</strong>
            <span>
              LOC: {hovered.loc} | Complexity: {hovered.complexity} | Fan-In: {hovered.fanIn} | Risk: {" "}
              {hovered.risk.toFixed(3)} | {hovered.inCycle ? "In cycle" : "No cycle"}
            </span>
          </>
        ) : (
          <span className="muted">Hover a point to inspect file metrics.</span>
        )}
      </div>
    </section>
  );
}
