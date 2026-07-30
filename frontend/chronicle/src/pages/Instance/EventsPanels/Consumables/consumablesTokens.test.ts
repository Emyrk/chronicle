import { describe, expect, it } from "vitest";
import { buildConsumablesTokens, parseConsumablesTokens } from "./consumablesTokens";

describe("consumables panelOption tokens", () => {
  it("defaults to showing pre-pull", () => {
    expect(parseConsumablesTokens(null).showPrePull).toBe(true);
    expect(parseConsumablesTokens("").showPrePull).toBe(true);
    expect(parseConsumablesTokens("cb,t:5").showPrePull).toBe(true);
  });

  it("round-trips the pre-pull setting", () => {
    const off = buildConsumablesTokens(null, false);
    expect(off).toBe("pp:off");
    expect(parseConsumablesTokens(off).showPrePull).toBe(false);

    const backOn = buildConsumablesTokens(off, true);
    expect(backOn).toBeNull();
    expect(parseConsumablesTokens(backOn).showPrePull).toBe(true);
  });

  it("preserves tokens owned by EventsPanel", () => {
    const built = buildConsumablesTokens("cb,t:5", false);
    expect(built).toBe("cb,t:5,pp:off");
    expect(parseConsumablesTokens(built).showPrePull).toBe(false);
    expect(buildConsumablesTokens(built, true)).toBe("cb,t:5");
  });
});
