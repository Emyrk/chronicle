import { describe, expect, it } from "vitest";
import { indexStateGraph, type StateGraph } from "./stateGraph";
import { IMPLEMENTATION_TYPES, isSemanticObject, objectRelations } from "./semanticGraph";

// Exact serialized-type census from the supplied snapshot, counts only, no payload data.
const hiddenCounts: Record<string, number> = {
  "period.Moment": 861, "messages.Damage": 514, "period.WorkingPeriod.Inactivity": 249,
  "characters.Base.Inactivity": 204, "parsernext/vanilla.PreparedSpell": 175,
  "vanilla.Base.Totem": 152, "messages.Timeout": 135, "messages.Slain": 124,
  "messages.ResourceChange": 80, "vanilla.TotemPeriod": 38, "messages.Aura": 1,
};

describe("semantic graph classification", () => {
  it("hides the 2533 exact low-level value types from the actual snapshot census", () => {
    expect(Object.values(hiddenCounts).reduce((a, b) => a + b, 0)).toBe(2533);
    expect(IMPLEMENTATION_TYPES.size).toBe(Object.keys(hiddenCounts).length);
    for (const type of Object.keys(hiddenCounts)) expect(isSemanticObject({ path: "/owner", kind: "value", type })).toBe(false);
  });

  it.each(["chronicle.complete-file-session", "encounters.State", "characters.Characters", "characters.Common", "vanilla.Totem", "consumers.ordered", "encounterevents.Events", "auras.Tracking", "loot.FinalLoot", "unknown.PeriodTracker", "messages.FutureMeaningfulType"])("keeps meaningful or unknown type %s visible", (type) => {
    expect(isSemanticObject({ path: "/owner", kind: "value", type })).toBe(true);
  });

  it("keeps aliases out of the default list and resolves contextual period links without duplicates", () => {
    const graph: StateGraph = { version: 1, root: "/owners", nodes: [
      { path: "/owners", kind: "directory" },
      { path: "/owners/character", kind: "value", type: "characters.Common" },
      { path: "/owners/base", kind: "value", type: "characters.Base.Inactivity" },
      { path: "/owners/period", kind: "value", type: "period.WorkingPeriod.Inactivity" },
      { path: "/owners/character/ref0", kind: "reference", target: "/owners/base", type: "characters.Base.Inactivity" },
      { path: "/owners/character/ref1", kind: "reference", target: "/owners/base", type: "characters.Base.Inactivity" },
      { path: "/owners/base/ref0", kind: "reference", target: "/owners/period", type: "period.WorkingPeriod.Inactivity" },
    ] };
    expect(graph.nodes.filter(isSemanticObject).map((node) => node.path)).toEqual(["/owners/character"]);
    const index = indexStateGraph(graph);
    expect(objectRelations(index, "/owners/character").implementation).toEqual(["/owners/base"]);
    expect(objectRelations(index, "/owners/base").implementation).toEqual(["/owners/period"]);
    expect(objectRelations(index, "/owners/base").owners).toEqual(["/owners/character"]);
    expect(graph.nodes).toHaveLength(7); // Raw mode retains every original node.
  });
});
