import { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";
import type { AnalysisModel } from "../types";

interface TreemapViewProps {
  model: AnalysisModel;
  riskByPath?: ReadonlyMap<string, number>;
  onFileSelected: (path: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  loc: number;
  risk: number;
  children: TreeNode[];
}

function createTree(model: AnalysisModel, riskByPath?: ReadonlyMap<string, number>): TreeNode {
  const root: TreeNode = {
    name: "root",
    path: "",
    loc: 0,
    risk: 0,
    children: []
  };

  for (const file of model.files) {
    const segments = file.path.split("/");
    let cursor = root;

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index] ?? "";
      const isLeaf = index === segments.length - 1;
      const nodePath = segments.slice(0, index + 1).join("/");

      let child = cursor.children.find((entry) => entry.name === segment);
      if (!child) {
        child = {
          name: segment,
          path: nodePath,
          loc: 0,
          risk: 0,
          children: []
        };
        cursor.children.push(child);
      }

      if (isLeaf) {
        child.loc = file.loc;
        child.risk = riskByPath?.get(file.path) ?? file.riskScore;
      }

      cursor = child;
    }
  }

  return root;
}

export function TreemapView({ model, riskByPath, onFileSelected }: TreemapViewProps): JSX.Element {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const riskRange = useMemo(() => {
    if (model.files.length === 0) {
      return { min: 0, max: 1 };
    }

    const values = model.files.map((file) => riskByPath?.get(file.path) ?? file.riskScore);
    return {
      min: Math.min(...values),
      max: Math.max(...values)
    };
  }, [model.files, riskByPath]);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = 900;
    const height = 420;

    const color = d3
      .scaleLinear<string>()
      .domain([riskRange.min, riskRange.max || riskRange.min + 1])
      .range(["#0c7f76", "#e3522b"]);

    const hierarchyRoot = d3
      .hierarchy(createTree(model, riskByPath))
      .sum((node) => node.loc)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const layout = d3.treemap<TreeNode>().size([width, height]).paddingInner(1);
    const rectRoot = layout(hierarchyRoot);

    const leaves = rectRoot.leaves();
    const group = svg.append("g");

    group
      .selectAll("rect")
      .data(leaves)
      .join("rect")
      .attr("x", (node) => node.x0)
      .attr("y", (node) => node.y0)
      .attr("width", (node) => Math.max(0, node.x1 - node.x0))
      .attr("height", (node) => Math.max(0, node.y1 - node.y0))
      .attr("fill", (node) => color(node.data.risk))
      .attr("stroke", "#121918")
      .attr("stroke-width", 0.7)
      .style("cursor", "pointer")
      .on("click", (_, node) => {
        if (node.data.children.length === 0) {
          onFileSelected(node.data.path);
        }
      });

    group
      .selectAll("text")
      .data(leaves)
      .join("text")
      .attr("x", (node) => node.x0 + 4)
      .attr("y", (node) => node.y0 + 14)
      .attr("fill", "#f8f4e8")
      .attr("font-size", 11)
      .text((node) => {
        const label = node.data.name;
        if (node.x1 - node.x0 < 80 || node.y1 - node.y0 < 20) {
          return "";
        }
        return label;
      });
  }, [model, onFileSelected, riskByPath, riskRange.max, riskRange.min]);

  return (
    <section className="panel">
      <h3>Treemap Heatmap</h3>
      <svg ref={svgRef} width="100%" viewBox="0 0 900 420" role="img" aria-label="Complexity treemap" />
    </section>
  );
}
