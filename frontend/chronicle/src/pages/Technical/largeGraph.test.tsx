import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LargeGraphInspector } from "./LargeGraphInspector";
import { GRAPH_PAGE_SIZE, metadataPreview, needsBoundedInspector, searchGraphNodes } from "./largeGraph";
import { coerceStateGraph, indexStateGraph, validateStateGraph, type StateGraph } from "./stateGraph";

const graph: StateGraph = {
  version: 1, root: "/root",
  nodes: [
    { path: "/root", kind: "directory" },
    { path: "/root/shared", kind: "value", type: "Shared" },
    ...Array.from({ length: 10000 }, (_, i) => ({ path: `/root/ref-${i}`, kind: "reference" as const, target: "/root/shared", type: "Message" })),
  ],
};

describe("bounded large graph inspection", () => {
  it("selects the safe mode by node, edge or depth count while keeping small catalogs", () => {
    expect(needsBoundedInspector(graph)).toBe(true);
    const small = { ...graph, nodes: graph.nodes.slice(0, 2) };
    expect(needsBoundedInspector(small)).toBe(false);
    expect(needsBoundedInspector({ ...small, dependencies: Array(601).fill({ from: "/root", to: "/root/shared" }) })).toBe(true);
    expect(needsBoundedInspector({ ...small, nodes: [{ path: "/x".repeat(101), kind: "value" }] })).toBe(true);
  });

  it("retains full searchable data and preindexed high-fan-in references", () => {
    const index = indexStateGraph(graph);
    expect(index.referencesTo.get("/root/shared")).toHaveLength(10000);
    expect(searchGraphNodes(graph.nodes, "ref-9999")[0].path).toBe("/root/ref-9999");
    expect(searchGraphNodes(graph.nodes, "Message")).toHaveLength(10000);
    expect(searchGraphNodes(graph.nodes, "")).toBe(graph.nodes);
  });

  it("renders bounded node and adjacency pages, not an SVG or expanded full tree", () => {
    const markup = renderToStaticMarkup(<LargeGraphInspector index={indexStateGraph(graph)} selected="/root/shared" onSelect={() => {}} />);
    expect(markup).toContain("safe inspection mode");
    expect(markup).not.toContain("<svg");
    expect((markup.match(/<li\b/g) ?? []).length).toBeLessThanOrEqual(GRAPH_PAGE_SIZE * 2);
    expect(markup).not.toContain("ref-9999");
    expect(markup.length).toBeLessThan(40000);
  });

  it("exposes reference following and back navigation for nodes beyond the first page", () => {
    const markup = renderToStaticMarkup(<LargeGraphInspector index={indexStateGraph(graph)} selected="/root/ref-9999" onSelect={() => {}} />);
    expect(markup).toContain("Follow reference: /root/shared");
    expect(markup).toContain("Back to previous node");
  });

  it("retains schema/path/reference diagnostics while only deferring recursive cycles", () => {
    expect(coerceStateGraph({ nodes: "invalid" }).graph).toBeUndefined();
    const malformed: StateGraph = { ...graph, nodes: [...graph.nodes, { path: "invalid", kind: "reference", type: "Shared", target: "/missing" }], dependencies: [{ from: "/root", to: "/root/shared" }, { from: "/root/shared", to: "/root" }] };
    const index = indexStateGraph(malformed);
    const issues = validateStateGraph(malformed, { skipCycleDetection: true, index });
    expect(issues.some((issue) => issue.message.includes("Missing target"))).toBe(true);
    expect(issues.some((issue) => issue.path === "invalid")).toBe(true);
    expect(issues.some((issue) => issue.message.includes("Dependency cycle"))).toBe(false);
    expect(validateStateGraph(malformed).some((issue) => issue.message.includes("Dependency cycle"))).toBe(true);
    const markup = renderToStaticMarkup(<LargeGraphInspector index={index} issues={issues} onSelect={() => {}} />);
    expect(markup).toContain("Structural, path and reference checks remain active");
    expect(markup).toContain("Validation issues");
  });

  it("bounds metadata traversal and output before serialization", () => {
    const preview = metadataPreview({ entries: Array(100000).fill({ body: "x".repeat(10000) }), nested: { a: { b: { c: { d: 1 } } } } });
    expect(preview.length).toBeLessThanOrEqual(16000);
    expect(preview).toContain("more items");
    expect(preview).not.toContain("x".repeat(501));
  });
});
