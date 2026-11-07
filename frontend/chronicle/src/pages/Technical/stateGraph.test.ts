import { describe, expect, it } from "vitest";
import targetJSON from "../../../../../docs/logparse-snapshots/catalog/target.json";
import {
  coerceStateGraph,
  indexStateGraph,
  layoutStateGraph,
  parseStateGraph,
  shortType,
  validateStateGraph,
  type StateGraph,
} from "./stateGraph";

function target(): StateGraph {
  const { graph, issues } = coerceStateGraph(targetJSON);
  expect(issues).toEqual([]);
  return graph!;
}

describe("state graph model", () => {
  it("accepts the committed target catalog", () => {
    expect(validateStateGraph(target())).toEqual([]);
  });

  it("reports invalid JSON without throwing", () => {
    const { graph, issues } = parseStateGraph("{");
    expect(graph).toBeUndefined();
    expect(issues[0].message).toMatch(/Invalid JSON/);
  });

  it("collects validation issues", () => {
    const graph: StateGraph = {
      version: 1,
      root: "/root",
      nodes: [
        { path: "/root", kind: "directory" },
        { path: "/root/a", kind: "value", type: "A" },
        { path: "/root/b", kind: "value", type: "B" },
        { path: "/root/ref", kind: "reference", type: "A", target: "/root/b" },
        { path: "/root/missing/child", kind: "value", type: "C" },
      ],
      dependencies: [
        { from: "/root/a", to: "/root/b" },
        { from: "/root/b", to: "/root/a" },
      ],
    };
    const messages = validateStateGraph(graph).map((issue) => issue.message);
    expect(messages).toContain("Expects type A, target has B");
    expect(messages).toContain("Missing parent /root/missing");
    expect(messages.some((m) => m.startsWith("Dependency cycle"))).toBe(true);
  });

  it("layers dependents above their dependencies and folds references onto owners", () => {
    const layout = layoutStateGraph(indexStateGraph(target()));
    const layer = (p: string) => layout.boxes.find((box) => box.path === p)!.layer;
    expect(layer("/root/parse-state")).toBeLessThan(layer("/root/instances/0000"));
    expect(layer("/root/instances/0000")).toBeLessThan(layer("/root/shared/units"));

    const parseStateToInstance = layout.edges.find(
      (edge) => edge.from === "/root/parse-state" && edge.to === "/root/instances/0000",
    )!;
    expect(parseStateToInstance.dependency).toBe(false);
    expect(parseStateToInstance.references).toEqual([
      "/root/parse-state/current-instance",
      "/root/parse-state/instances/0000",
    ]);
    const unitsEdge = layout.edges.find((edge) => edge.from === "/root/parse-state" && edge.to === "/root/shared/units")!;
    expect(unitsEdge.dependency).toBe(true);
    expect(unitsEdge.references).toEqual(["/root/parse-state/units"]);
  });

  it("shortens Go type names", () => {
    expect(shortType("github.com/Emyrk/chronicle/combatlog/parser/common/unitdb.Units")).toBe("unitdb.Units");
  });
});
