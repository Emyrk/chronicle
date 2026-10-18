import { describe, expect, it } from "vitest";
import {
  coneBearing,
  emptyPlan,
  movePlanItem,
  planDistance,
  planItemAt,
  planItemDistance,
  readMapPlan,
  readPlanItem,
  type PlanItem,
} from "./mapPlan";

describe("readPlanItem", () => {
  it("accepts each kind and rejects malformed items", () => {
    expect(readPlanItem({ id: "a", kind: "marker", at: { x: 1, y: 2 }, icon: "skull" })).toEqual({ id: "a", kind: "marker", at: { x: 1, y: 2 }, icon: "skull" });
    expect(readPlanItem({ id: "a", kind: "marker", at: { x: 1, y: 2 }, icon: "banana" })).toBeNull();
    expect(readPlanItem({ id: "b", kind: "arrow", points: [{ x: 0, y: 0 }], color: "#ff0000" })).toBeNull();
    expect(readPlanItem({ id: "b", kind: "arrow", points: [{ x: 0, y: 0 }, { x: 1, y: 1, z: 3 }], color: "#ff0000" })?.kind).toBe("arrow");
    expect(readPlanItem({ id: "c", kind: "circle", at: { x: 0, y: 0 }, radius: 0, color: "#ffffff" })).toBeNull();
    expect(readPlanItem({ id: "c", kind: "circle", at: { x: 0, y: 0 }, radius: 8, color: "red" })).toBeNull();
    expect(readPlanItem({ id: "d", kind: "cone", at: { x: 0, y: 0 }, radius: 10, width: 90, facing: 1, color: "#ffffff" })?.kind).toBe("cone");
    expect(readPlanItem({ id: "e", kind: "text", at: { x: 0, y: 0 }, text: "x".repeat(81), color: "#ffffff" })).toBeNull();
    expect(readPlanItem({ id: "f", kind: "token", at: { x: 0, y: 0 }, label: "Tank", color: "#c79c6e", guid: "0x1" })).toEqual(
      { id: "f", kind: "token", at: { x: 0, y: 0 }, label: "Tank", color: "#c79c6e", guid: "0x1" },
    );
    expect(readPlanItem({ id: "g", kind: "pen", points: [{ x: Number.NaN, y: 0 }], color: "#ffffff" })).toBeNull();
  });
});

describe("readMapPlan", () => {
  it("keeps valid steps and items, dropping the rest", () => {
    const plan = readMapPlan({
      version: 1,
      mapId: 309,
      steps: [
        { id: "s1", name: "Pull", items: [{ id: "a", kind: "marker", at: { x: 1, y: 2 }, icon: "star" }, { id: "bad", kind: "nope" }] },
        { id: "s2", name: 7, items: [] },
      ],
    });
    expect(plan).toEqual({ version: 1, mapId: 309, steps: [{ id: "s1", name: "Pull", items: [{ id: "a", kind: "marker", at: { x: 1, y: 2 }, icon: "star" }] }] });
    expect(readMapPlan({ version: 2, mapId: 1, steps: [] })).toBeNull();
    expect(readMapPlan({ version: 1, mapId: 1, steps: [] })).toBeNull();
  });

  it("starts an empty plan with one step", () => {
    const plan = emptyPlan(309);
    expect(plan.steps).toHaveLength(1);
    expect(readMapPlan(plan)).toEqual(plan);
  });
});

describe("hit testing", () => {
  const circle: PlanItem = { id: "c", kind: "circle", at: { x: 0, y: 0 }, radius: 8, color: "#ffffff" };
  const arrow: PlanItem = { id: "a", kind: "arrow", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], color: "#ffffff" };
  const cone: PlanItem = { id: "k", kind: "cone", at: { x: 0, y: 0 }, radius: 10, width: 90, facing: 0, color: "#ffffff" };
  const rect: PlanItem = { id: "r", kind: "rect", from: { x: 0, y: 0 }, to: { x: 4, y: 4 }, color: "#ffffff" };

  it("measures how far a point is from each shape", () => {
    expect(planItemDistance(circle, { x: 3, y: 0 })).toBe(0);
    expect(planItemDistance(circle, { x: 10, y: 0 })).toBe(2);
    expect(planItemDistance(arrow, { x: 5, y: 3 })).toBe(3);
    expect(planItemDistance(arrow, { x: 13, y: 4 })).toBe(5);
    expect(planItemDistance(cone, { x: 5, y: 1 })).toBe(0);
    expect(planItemDistance(cone, { x: -5, y: 0 })).toBeGreaterThan(0);
    expect(planItemDistance(rect, { x: 2, y: 2 })).toBe(0);
    expect(planItemDistance(rect, { x: 7, y: 8 })).toBe(5);
  });

  it("picks the topmost item in reach", () => {
    expect(planItemAt([circle, arrow], { x: 5, y: 0.2 }, 0.5)?.id).toBe("a");
    expect(planItemAt([circle, arrow], { x: 30, y: 30 }, 0.5)).toBeNull();
  });
});

describe("geometry", () => {
  it("moves every point of an item", () => {
    expect(movePlanItem({ id: "a", kind: "arrow", points: [{ x: 0, y: 0 }, { x: 1, y: 1, z: 5 }], color: "#ffffff" }, 2, 3)).toEqual(
      { id: "a", kind: "arrow", points: [{ x: 2, y: 3 }, { x: 3, y: 4, z: 5 }], color: "#ffffff" },
    );
  });

  it("measures yards and WoW bearings", () => {
    expect(planDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(coneBearing({ x: 0, y: 0 }, { x: 5, y: 0 })).toBe(0);
    expect(coneBearing({ x: 0, y: 0 }, { x: 0, y: 5 })).toBeCloseTo(Math.PI / 2);
  });
});
