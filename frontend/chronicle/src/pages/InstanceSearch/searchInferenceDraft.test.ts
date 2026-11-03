import { describe, expect, it } from "vitest";
import { planSearchDraftUpdate } from "./searchInferenceDraft";

const zone = { field: "instance.name", op: "=", value: "Naxxramas" };

describe("search-page inference draft edits", () => {
  it("uses the form for representable queries when advanced editing is locked", () => {
    const plan = planSearchDraftUpdate({ expected_revision: 4, where: zone }, false, 4);
    expect(plan.mode).toBe("form");
    expect(plan.form?.zone).toBe("Naxxramas");
  });

  it("uses local blocks for advanced queries when unlocked", () => {
    const where = { or: [zone, zone] };
    const plan = planSearchDraftUpdate({ expected_revision: 4, where }, true, 4);
    expect(plan.mode).toBe("blocks");
    expect(plan.where).toEqual(where);
  });

  it("refuses advanced queries while the advanced editor is locked", () => {
    expect(() => planSearchDraftUpdate({ expected_revision: 4, where: { or: [zone, zone] } }, false, 4)).toThrow(/advanced editor/);
  });

  it("rejects a stale revision rather than overwriting the user draft", () => {
    expect(() => planSearchDraftUpdate({ expected_revision: 3, where: zone }, true, 4)).toThrow("stale_state");
  });

  it("rejects invalid and oversized inputs without touching page state", () => {
    expect(() => planSearchDraftUpdate({ expected_revision: 4, where: null }, true, 4)).toThrow();
    expect(() => planSearchDraftUpdate({ expected_revision: 4, where: [zone] }, true, 4)).toThrow();
    expect(() => planSearchDraftUpdate({ expected_revision: 4, where: zone, limit: 10 }, true, 4)).toThrow();
    expect(() => planSearchDraftUpdate({ expected_revision: 4, where: { field: "instance.name", op: "=", value: "x".repeat(20_000) } }, true, 4)).toThrow();
  });
});
