import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisModel } from "../types";

type RadarMetric = "risk" | "complexity" | "loc";

interface RiskRadarViewProps {
  model: AnalysisModel;
  riskByPath: ReadonlyMap<string, number>;
  selectedFilePath: string | null;
  onFileSelected: (path: string) => void;
}

interface RadarNode {
  path: string;
  module: string;
  score: number;
  risk: number;
  complexity: number;
  loc: number;
  fanIn: number;
  fanOut: number;
  inCycle: boolean;
  angle: number;
  radiusRatio: number;
  size: number;
}

interface HitTarget {
  path: string;
  x: number;
  y: number;
  radius: number;
}

function topModule(path: string): string {
  const [head] = path.split("/");
  return head ?? "(root)";
}

function stableHash(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function metricValue(
  file: AnalysisModel["files"][number],
  metric: RadarMetric,
  riskByPath: ReadonlyMap<string, number>
): number {
  if (metric === "complexity") {
    return file.complexity;
  }
  if (metric === "loc") {
    return file.loc;
  }
  return riskByPath.get(file.path) ?? file.riskScore;
}

function mix(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}

function scoreColor(ratio: number): string {
  const clamped = Math.min(1, Math.max(0, ratio));
  const start = { r: 39, g: 178, b: 164 };
  const mid = { r: 245, g: 192, b: 106 };
  const end = { r: 232, g: 89, b: 57 };

  if (clamped < 0.5) {
    const t = clamped / 0.5;
    return `#${toHex(mix(start.r, mid.r, t))}${toHex(mix(start.g, mid.g, t))}${toHex(mix(start.b, mid.b, t))}`;
  }

  const t = (clamped - 0.5) / 0.5;
  return `#${toHex(mix(mid.r, end.r, t))}${toHex(mix(mid.g, end.g, t))}${toHex(mix(mid.b, end.b, t))}`;
}

function truncatePath(path: string, maxLength: number): string {
  if (path.length <= maxLength) {
    return path;
  }
  if (maxLength <= 3) {
    return path.slice(0, maxLength);
  }
  return `${path.slice(0, maxLength - 3)}...`;
}

function pickTarget(x: number, y: number, targets: ReadonlyArray<HitTarget>): HitTarget | null {
  let picked: HitTarget | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const target of targets) {
    const dx = x - target.x;
    const dy = y - target.y;
    const distance = Math.hypot(dx, dy);

    if (distance > target.radius + 8) {
      continue;
    }

    if (distance < bestDistance) {
      picked = target;
      bestDistance = distance;
    }
  }

  return picked;
}

export function RiskRadarView({
  model,
  riskByPath,
  selectedFilePath,
  onFileSelected
}: RiskRadarViewProps): JSX.Element {
  const [metric, setMetric] = useState<RadarMetric>("risk");
  const [cycleOnly, setCycleOnly] = useState(false);
  const [limit, setLimit] = useState(180);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  const hoveredRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const moduleOptions = useMemo(() => {
    const modules = new Set<string>();
    for (const file of model.files) {
      modules.add(topModule(file.path));
    }
    return ["all", ...[...modules].sort((a, b) => a.localeCompare(b))];
  }, [model.files]);

  useEffect(() => {
    if (moduleFilter !== "all" && !moduleOptions.includes(moduleFilter)) {
      setModuleFilter("all");
    }
  }, [moduleFilter, moduleOptions]);

  const filesByPath = useMemo(
    () => new Map(model.files.map((file) => [file.path, file] as const)),
    [model.files]
  );

  const filteredFiles = useMemo(() => {
    return model.files.filter((file) => {
      if (cycleOnly && !file.inCycle) {
        return false;
      }
      if (moduleFilter !== "all" && topModule(file.path) !== moduleFilter) {
        return false;
      }
      return true;
    });
  }, [cycleOnly, model.files, moduleFilter]);

  const rankedFiles = useMemo(() => {
    return [...filteredFiles]
      .sort((a, b) => metricValue(b, metric, riskByPath) - metricValue(a, metric, riskByPath))
      .slice(0, limit);
  }, [filteredFiles, limit, metric, riskByPath]);

  const scoreRange = useMemo(() => {
    if (rankedFiles.length === 0) {
      return { min: 0, max: 1 };
    }

    const values = rankedFiles.map((file) => metricValue(file, metric, riskByPath));
    return {
      min: Math.min(...values),
      max: Math.max(...values)
    };
  }, [metric, rankedFiles, riskByPath]);

  const selectedPath = useMemo(() => {
    if (selectedFilePath && rankedFiles.some((file) => file.path === selectedFilePath)) {
      return selectedFilePath;
    }
    return rankedFiles[0]?.path ?? null;
  }, [rankedFiles, selectedFilePath]);

  const radarNodes = useMemo(() => {
    const groups = new Map<string, AnalysisModel["files"][number][]>();

    for (const file of rankedFiles) {
      const moduleName = topModule(file.path);
      const bucket = groups.get(moduleName);
      if (bucket) {
        bucket.push(file);
      } else {
        groups.set(moduleName, [file]);
      }
    }

    const groupEntries = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (groupEntries.length === 0) {
      return [] as RadarNode[];
    }

    const totalGroups = groupEntries.length;
    const fullCircle = Math.PI * 2;

    const nodes: RadarNode[] = [];

    for (let groupIndex = 0; groupIndex < groupEntries.length; groupIndex += 1) {
      const [moduleName, files] = groupEntries[groupIndex] ?? ["(root)", []];
      const sectorStart = (groupIndex / totalGroups) * fullCircle;
      const sectorEnd = ((groupIndex + 1) / totalGroups) * fullCircle;
      const sectorSpan = Math.max(0.2, sectorEnd - sectorStart);

      files.sort((a, b) => stableHash(a.path) - stableHash(b.path));

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (!file) {
          continue;
        }

        const rawScore = metricValue(file, metric, riskByPath);
        const ratio = (rawScore - scoreRange.min) / Math.max(0.00001, scoreRange.max - scoreRange.min);

        const angleBase = sectorStart + ((index + 1) / (files.length + 1)) * sectorSpan;
        const jitter = (((stableHash(`${file.path}:j`) % 1000) / 1000) - 0.5) * (sectorSpan * 0.25);

        nodes.push({
          path: file.path,
          module: moduleName,
          score: rawScore,
          risk: riskByPath.get(file.path) ?? file.riskScore,
          complexity: file.complexity,
          loc: file.loc,
          fanIn: file.fanIn,
          fanOut: file.fanOut,
          inCycle: file.inCycle,
          angle: angleBase + jitter,
          radiusRatio: 0.18 + (1 - ratio) * 0.76,
          size: 3.4 + ratio * 6 + (file.inCycle ? 1.2 : 0)
        });
      }
    }

    return nodes;
  }, [metric, rankedFiles, riskByPath, scoreRange.max, scoreRange.min]);

  const summary = useMemo(() => {
    const cycleCount = radarNodes.filter((node) => node.inCycle).length;
    const avgScore =
      radarNodes.reduce((sum, node) => sum + node.score, 0) / Math.max(1, radarNodes.length);
    const moduleCount = new Set(radarNodes.map((node) => node.module)).size;

    return {
      count: radarNodes.length,
      cycleCount,
      avgScore,
      moduleCount
    };
  }, [radarNodes]);

  const hovered = useMemo(() => {
    if (!hoveredPath) {
      return null;
    }
    return radarNodes.find((node) => node.path === hoveredPath) ?? null;
  }, [hoveredPath, radarNodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || radarNodes.length === 0) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const pointer = { x: 0, y: 0, inside: false };
    let width = 0;
    let height = 0;
    let dpr = 1;
    let frameId = 0;
    let targets: HitTarget[] = [];

    const updateHover = (path: string | null): void => {
      if (hoveredRef.current === path) {
        return;
      }
      hoveredRef.current = path;
      setHoveredPath(path);
    };

    const resize = (): void => {
      width = Math.max(1, canvas.clientWidth);
      height = Math.max(1, canvas.clientHeight);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onMove = (event: PointerEvent): void => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.inside = true;
    };

    const onLeave = (): void => {
      pointer.inside = false;
      updateHover(null);
    };

    const onClick = (event: MouseEvent): void => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const target = pickTarget(x, y, targets);
      if (!target) {
        return;
      }
      onFileSelected(target.path);
    };

    const draw = (timeMs: number): void => {
      const time = timeMs * 0.001;
      const centerX = width / 2;
      const centerY = height / 2;
      const radarRadius = Math.min(width, height) * 0.42;

      context.clearRect(0, 0, width, height);

      const bg = context.createRadialGradient(centerX, centerY, radarRadius * 0.08, centerX, centerY, radarRadius * 1.2);
      bg.addColorStop(0, "#0f2b2e");
      bg.addColorStop(0.6, "#0d1c26");
      bg.addColorStop(1, "#090e18");
      context.fillStyle = bg;
      context.fillRect(0, 0, width, height);

      for (let ring = 1; ring <= 5; ring += 1) {
        const r = (ring / 5) * radarRadius;
        context.strokeStyle = ring === 5 ? "rgba(89, 165, 191, 0.35)" : "rgba(89, 165, 191, 0.18)";
        context.lineWidth = 1;
        context.beginPath();
        context.arc(centerX, centerY, r, 0, Math.PI * 2);
        context.stroke();
      }

      const sweepAngle = (time * 0.9) % (Math.PI * 2);
      const sweepWidth = 0.34;
      const sweepGradient = context.createRadialGradient(centerX, centerY, radarRadius * 0.05, centerX, centerY, radarRadius);
      sweepGradient.addColorStop(0, "rgba(118, 235, 221, 0.22)");
      sweepGradient.addColorStop(1, "rgba(118, 235, 221, 0)");

      context.save();
      context.translate(centerX, centerY);
      context.rotate(sweepAngle);
      context.beginPath();
      context.moveTo(0, 0);
      context.arc(0, 0, radarRadius, -sweepWidth, sweepWidth);
      context.closePath();
      context.fillStyle = sweepGradient;
      context.fill();
      context.restore();

      const moduleNames = [...new Set(radarNodes.map((node) => node.module))];
      const sectorCount = Math.max(1, moduleNames.length);
      for (let index = 0; index < sectorCount; index += 1) {
        const angle = (index / sectorCount) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * radarRadius;
        const y = centerY + Math.sin(angle) * radarRadius;
        context.strokeStyle = "rgba(103, 146, 177, 0.2)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(centerX, centerY);
        context.lineTo(x, y);
        context.stroke();
      }

      targets = [];

      for (const node of radarNodes) {
        const x = centerX + Math.cos(node.angle) * radarRadius * node.radiusRatio;
        const y = centerY + Math.sin(node.angle) * radarRadius * node.radiusRatio;

        const nodeTarget: HitTarget = {
          path: node.path,
          x,
          y,
          radius: node.size
        };
        targets.push(nodeTarget);

        const distanceToSweep = Math.abs(Math.atan2(Math.sin(node.angle - sweepAngle), Math.cos(node.angle - sweepAngle)));
        const sweepBoost = Math.max(0, 1 - distanceToSweep / 0.45);

        const scoreRatio = (node.score - scoreRange.min) / Math.max(0.00001, scoreRange.max - scoreRange.min);
        const fill = scoreColor(scoreRatio);
        const isSelected = selectedPath === node.path;
        const isHovered = hoveredRef.current === node.path;

        context.beginPath();
        context.fillStyle = fill;
        context.globalAlpha = Math.min(1, 0.72 + sweepBoost * 0.45 + (isHovered ? 0.2 : 0));
        context.arc(x, y, node.size + (isHovered ? 1.4 : 0), 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;

        if (node.inCycle || isSelected) {
          context.beginPath();
          context.strokeStyle = isSelected ? "rgba(220, 239, 255, 0.95)" : "rgba(255, 100, 81, 0.85)";
          context.lineWidth = isSelected ? 2 : 1.25;
          context.arc(x, y, node.size + (isSelected ? 4.2 : 3), 0, Math.PI * 2);
          context.stroke();
        }
      }

      context.fillStyle = "rgba(220, 247, 255, 0.92)";
      context.font = "600 12px 'Avenir Next', 'Gill Sans', sans-serif";
      context.textAlign = "left";
      context.fillText("core", centerX + 6, centerY - 6);

      if (pointer.inside) {
        const target = pickTarget(pointer.x, pointer.y, targets);
        updateHover(target?.path ?? null);
      }

      const hoverTarget = pointer.inside ? pickTarget(pointer.x, pointer.y, targets) : null;
      if (hoverTarget) {
        const label = truncatePath(hoverTarget.path, 54);
        const textWidth = context.measureText(label).width;
        const boxWidth = textWidth + 20;
        const boxHeight = 24;
        const boxX = Math.max(8, Math.min(width - boxWidth - 8, hoverTarget.x + 12));
        const boxY = Math.max(8, hoverTarget.y - boxHeight - 12);

        context.fillStyle = "rgba(5, 11, 17, 0.93)";
        context.strokeStyle = "rgba(132, 196, 233, 0.8)";
        context.lineWidth = 1;
        context.fillRect(boxX, boxY, boxWidth, boxHeight);
        context.strokeRect(boxX, boxY, boxWidth, boxHeight);

        context.fillStyle = "#d6ecff";
        context.fillText(label, boxX + 10, boxY + 16);
      }

      frameId = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("click", onClick);

    frameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick);
    };
  }, [onFileSelected, radarNodes, scoreRange.max, scoreRange.min, selectedPath]);

  return (
    <section className="panel radar-panel">
      <div className="radar-header">
        <h3>Experimental: Risk Radar</h3>
        <span className="muted">Live sweep map of hotspots by module sectors.</span>
      </div>

      <div className="radar-controls">
        <label>
          Metric
          <select value={metric} onChange={(event) => setMetric(event.target.value as RadarMetric)}>
            <option value="risk">Risk Score</option>
            <option value="complexity">Complexity</option>
            <option value="loc">LOC</option>
          </select>
        </label>

        <label>
          Module
          <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
            {moduleOptions.map((moduleName) => (
              <option key={moduleName} value={moduleName}>
                {moduleName === "all" ? "All modules" : moduleName}
              </option>
            ))}
          </select>
        </label>

        <label>
          Visible Files
          <input
            type="range"
            min={30}
            max={320}
            step={10}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value) || 180)}
          />
          <span className="muted">Limit: {limit}</span>
        </label>

        <label className="inline">
          <input
            type="checkbox"
            checked={cycleOnly}
            onChange={(event) => setCycleOnly(event.target.checked)}
          />
          Show cycle files only
        </label>
      </div>

      <div className="radar-summary-grid">
        <article className="summary-card">
          <span>Visible Files</span>
          <strong>{summary.count}</strong>
        </article>
        <article className="summary-card">
          <span>Modules</span>
          <strong>{summary.moduleCount}</strong>
        </article>
        <article className="summary-card">
          <span>Cycle Files</span>
          <strong>{summary.cycleCount}</strong>
        </article>
        <article className="summary-card">
          <span>Average {metric === "risk" ? "Risk" : metric === "loc" ? "LOC" : "Complexity"}</span>
          <strong>{summary.avgScore.toFixed(2)}</strong>
        </article>
      </div>

      <div className="radar-legend">
        <span className="legend-dot low" />
        <span>Lower score</span>
        <span className="legend-dot medium" />
        <span>Medium score</span>
        <span className="legend-dot high" />
        <span>Higher score</span>
        <span className="legend-note">Click a blip to open file details.</span>
      </div>

      <canvas ref={canvasRef} className="radar-canvas" />

      <div className="radar-meta">
        {hovered ? (
          <>
            <strong>{hovered.path}</strong>
            <span>
              Module: {hovered.module} | Risk: {hovered.risk.toFixed(3)} | Complexity: {hovered.complexity} | LOC:{" "}
              {hovered.loc}
            </span>
            <span>
              Fan-In: {hovered.fanIn} | Fan-Out: {hovered.fanOut} | {hovered.inCycle ? "In cycle" : "No cycle"}
            </span>
          </>
        ) : (
          <span className="muted">Hover a blip to inspect a file.</span>
        )}
      </div>
    </section>
  );
}
