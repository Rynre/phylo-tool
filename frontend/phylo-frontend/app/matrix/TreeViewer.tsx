"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

// --- Newick Parser with support + length ---
function parseNewick(newick: string) {
  let tokens = newick.split(/\s*(;|\(|\)|,|:)\s*/);
  let stack: any[] = [];
  let tree: any = {};

  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i];

    if (token === "(") {
      let subtree: any = {};
      if (!tree.children) tree.children = [];
      tree.children.push(subtree);
      stack.push(tree);
      tree = subtree;
    } else if (token === ",") {
      let subtree: any = {};
      stack[stack.length - 1].children.push(subtree);
      tree = subtree;
    } else if (token === ")") {
      tree = stack.pop();
    } else if (token === ":") {
      // branch length comes next
    } else if (token === ";") {
      // end
    } else if (token.length > 0) {
      let prev = tokens[i - 1];
      if (prev === ":") {
        tree.length = parseFloat(token);
      } else {
        if (!tree.name && tree.children) {
          tree.support = token;
        } else {
          tree.name = token;
        }
      }
    }
  }

  return tree;
}

type LayoutMode = "horizontal" | "rectangular" | "diagonal" | "radial";

export default function TreeViewer({ newick }: { newick: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<LayoutMode>("horizontal");

  const [metrics, setMetrics] = useState({
    totalLength: 0,
    treeHeight: 0,
    longestTip: "",
    longestTipLength: 0,
  });

  const renderTree = () => {
    if (!newick || !ref.current) return;

    ref.current.innerHTML = "";

    const data = parseNewick(newick);
    const root = d3.hierarchy(data, (d: any) => d.children);

    // --- Compute cumulative root-to-tip lengths ---
    root.each((d: any) => {
      if (d.parent) {
        d.length = (d.parent.length || 0) + (d.data.length || 0);
      } else {
        d.length = 0;
      }
    });

    // --- Compute metrics ---
    const totalLength = d3.sum(root.links(), (d: any) => d.target.data.length || 0);
    const treeHeight = d3.max(root.descendants(), (d: any) => d.length) || 0;

    const longest = root
      .leaves()
      .reduce((a: any, b: any) => (a.length > b.length ? a : b));

    setMetrics({
      totalLength,
      treeHeight,
      longestTip: longest.data.name || "(unnamed)",
      longestTipLength: longest.length,
    });

    // --- Layout + rendering ---
    const width = 700;
    const height = 500;
    const margin = { top: 60, right: 150, bottom: 40, left: 80 }; // extra top for metrics

    const svg = d3
      .select(ref.current)
      .append("svg")
      .attr("width", width)
      .attr("height", height);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const zoomLayer = g.append("g");

    svg.call(
      d3.zoom().on("zoom", (event) => {
        zoomLayer.attr("transform", event.transform);
      }) as any
    );

    // --- Layout selection ---
    let treeLayout: any;

    if (layout === "radial") {
      treeLayout = d3
        .cluster()
        .size([2 * Math.PI, Math.min(innerWidth, innerHeight) / 2 - 20]);
      treeLayout(root);
    } else {
      treeLayout = d3.cluster().size([innerHeight, innerWidth]);
      treeLayout(root);
    }

    // --- Use cumulative length for scaling ---
    const maxLength =
      d3.max(root.descendants(), (d: any) => d.length || 0) || 1;

    const xScale = d3
      .scaleLinear()
      .domain([0, maxLength])
      .range([0, innerWidth]);

    // --- Horizontal layout uses cumulative length ---
    if (layout === "horizontal") {
      root.each((d: any) => {
        d.y = xScale(d.length);
      });
    }

    const supportValues = root
      .descendants()
      .map((d: any) => (d.data.support ? +d.data.support : null))
      .filter((d: any) => d !== null) as number[];

    const colorScale =
      supportValues.length > 0
        ? d3
            .scaleSequential(d3.interpolateTurbo)
            .domain([
              d3.min(supportValues) || 0,
              d3.max(supportValues) || 100,
            ])
        : () => "#444";

    const radialPoint = (x: number, y: number) => {
      const angle = x - Math.PI / 2;
      return [Math.cos(angle) * y, Math.sin(angle) * y];
    };

    // --- Metrics inside SVG (downloadable) ---
    const metricsGroup = svg
      .append("g")
      .attr("transform", "translate(10,20)")
      .attr("font-family", "Inter, system-ui, sans-serif")
      .attr("font-size", 12)
      .attr("fill", "#374151");

    metricsGroup.append("text").text(`Tree height: ${treeHeight.toPrecision(4)}`).attr("y", 0);
    metricsGroup.append("text").text(`Total length: ${totalLength.toPrecision(4)}`).attr("y", 18);
    metricsGroup
      .append("text")
      .text(`Longest tip: ${longest.data.name} (${longest.length.toPrecision(4)})`)
      .attr("y", 36);

    // --- Link path selection ---
    const linkPath = (d: any) => {
      if (layout === "radial") {
        const [sx, sy] = radialPoint(d.source.x, d.source.y);
        const [tx, ty] = radialPoint(d.target.x, d.target.y);
        return `M${sx},${sy}L${tx},${ty}`;
      }

      if (layout === "diagonal") {
        return d3
          .linkHorizontal()
          .x((n: any) => n.y)
          .y((n: any) => n.x)(d as any);
      }

      if (layout === "horizontal") {
        return `
          M${d.source.y},${d.source.x}
          L${d.target.y},${d.target.x}
        `;
      }

      // rectangular (elbow)
      return `
        M${d.source.y},${d.source.x}
        L${d.target.y},${d.source.x}
        L${d.target.y},${d.target.x}
      `;
    };

    // --- Tooltip ---
    const tooltip = d3
      .select(ref.current)
      .append("div")
      .style("position", "absolute")
      .style("padding", "4px 8px")
      .style("background", "rgba(0,0,0,0.75)")
      .style("color", "#fff")
      .style("border-radius", "4px")
      .style("font-size", "11px")
      .style("pointer-events", "none")
      .style("opacity", 0);

    // --- Draw links ---
    zoomLayer
      .selectAll(".link")
      .data(root.links())
      .enter()
      .append("path")
      .attr("class", "link")
      .attr("fill", "none")
      .attr("stroke", (d: any) =>
        d.target.data.support
          ? (colorScale as any)(+d.target.data.support)
          : "#444"
      )
      .attr("stroke-width", 1.5)
      .attr("d", (d: any) => linkPath(d));

    // --- Draw nodes ---
    const nodes = zoomLayer
      .selectAll(".node")
      .data(root.descendants())
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", (d: any) => {
        if (layout === "radial") {
          const [x, y] = radialPoint(d.x, d.y);
          return `translate(${x},${y})`;
        }
        return `translate(${d.y},${d.x})`;
      })
      .style("cursor", "pointer")
      .on("click", (event: any, d: any) => {
        if (d.children) {
          d._children = d.children;
          d.children = null;
        } else if (d._children) {
          d.children = d._children;
          d._children = null;
        }
        renderTree();
      })
      .on("mouseover", (event: any, d: any) => {
        const name = d.data.name || "(internal)";
        const len =
          d.data.length !== undefined ? `length: ${d.data.length}` : "";
        const sup =
          d.data.support !== undefined ? `support: ${d.data.support}` : "";
        const text = [name, len, sup].filter(Boolean).join(" | ");

        tooltip
          .style("opacity", 1)
          .html(text)
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY + 10 + "px");
      })
      .on("mousemove", (event: any) => {
        tooltip
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY + 10 + "px");
      })
      .on("mouseout", () => {
        tooltip.style("opacity", 0);
      });

    nodes
      .append("circle")
      .attr("r", 4)
      .attr("fill", (d: any) => (d.children || d._children ? "#333" : "#1976d2"));

    nodes
      .filter((d: any) => !d.children && !d._children)
      .append("text")
      .attr("dx", layout === "radial" ? 6 : 8)
      .attr("dy", 4)
      .style("font-size", "12px")
      .style("text-anchor", layout === "radial" ? "start" : "start")
      .text((d: any) => d.data.name);

    nodes
      .filter((d: any) => d.data.support)
      .append("text")
      .attr("dx", layout === "radial" ? -4 : -4)
      .attr("dy", layout === "radial" ? -6 : -6)
      .style("font-size", "11px")
      .style("fill", "#555")
      .style("text-anchor", "middle")
      .text((d: any) => d.data.support);

    // --- Scale bar ---
    const scaleBarGroup = g.append("g").attr("transform", `translate(0,${innerHeight + 10})`);

    const barLength = maxLength / 5;
    const barPixels = xScale(barLength) - xScale(0);

    scaleBarGroup
      .append("line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", barPixels)
      .attr("y2", 0)
      .attr("stroke", "#000")
      .attr("stroke-width", 1.5);

    scaleBarGroup
      .append("text")
      .attr("x", barPixels / 2)
      .attr("y", 15)
      .style("font-size", "11px")
      .style("text-anchor", "middle")
      .text(`${barLength.toPrecision(2)} substitutions/site`);
  };

  // --- Download SVG (React-controlled, polished) ---
  const downloadSVG = () => {
    const svgNode = ref.current?.querySelector("svg");
    if (!svgNode) return;

    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgNode);

    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "tree_with_metrics.svg";
    a.click();

    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    renderTree();
  }, [newick, layout]);

  return (
    <div
      style={{
        display: "flex",
        gap: "20px",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#333",
      }}
    >
      {/* --- Sidebar Card --- */}
      <div
        style={{
          width: "240px",
          padding: "18px",
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #e5e7eb",
          boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
          height: "fit-content",
        }}
      >
        <h3
          style={{
            marginTop: 0,
            marginBottom: "12px",
            fontSize: "17px",
            fontWeight: 600,
            color: "#1f2937",
          }}
        >
          Tree Metrics
        </h3>

        <div style={{ fontSize: "14px", lineHeight: "1.7" }}>
          <div>
            <strong>Tree height:</strong>{" "}
            {metrics.treeHeight?.toPrecision
              ? metrics.treeHeight.toPrecision(4)
              : "…"}
          </div>

          <div>
            <strong>Total length:</strong>{" "}
            {metrics.totalLength?.toPrecision
              ? metrics.totalLength.toPrecision(4)
              : "…"}
          </div>

          <div>
            <strong>Longest tip:</strong> {metrics.longestTip || "…"} (
            {metrics.longestTipLength?.toPrecision
              ? metrics.longestTipLength.toPrecision(4)
              : "…"}
            )
          </div>
        </div>

        <hr style={{ margin: "18px 0", borderColor: "#eee" }} />

        <label
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "#374151",
          }}
        >
          Layout
        </label>

        <select
          value={layout}
          onChange={(e) => setLayout(e.target.value as LayoutMode)}
          style={{
            width: "100%",
            marginTop: "8px",
            padding: "8px",
            borderRadius: "8px",
            border: "1px solid #d1d5db",
            fontSize: "14px",
            background: "#f9fafb",
          }}
        >
          <option value="horizontal">Horizontal</option>
          <option value="rectangular">Rectangular</option>
          <option value="diagonal">Diagonal</option>
          <option value="radial">Radial</option>
        </select>

        {/* ⭐ Polished Download Button */}
        <button
          onClick={downloadSVG}
          style={{
            marginTop: "20px",
            width: "100%",
            padding: "10px",
            borderRadius: "8px",
            border: "none",
            background: "#2563eb",
            color: "white",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          ⬇️ Download SVG 
        </button>
      </div>

      {/* --- Main Canvas Card --- */}
      <div
        style={{
          flexGrow: 1,
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #e5e7eb",
          boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
          padding: "10px",
          position: "relative",
        }}
      >
        <div
          ref={ref}
          style={{
            width: "100%",
            height: "500px",
            borderRadius: "8px",
            background: "white",
          }}
        />
      </div>
    </div>
  );
}
