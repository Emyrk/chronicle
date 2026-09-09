import { describe, expect, it } from "vitest";
import { buildConsumablesTokens, parseConsumablesTokens } from "./consumablesTokens";

describe("consumables panelOption tokens", () => {
  it("defaults to showing pre-combat uses and pre-pots", () => {
    expect(parseConsumablesTokens(null)).toEqual({ showPreCombat: true, showPrePot: true });
    expect(parseConsumablesTokens("")).toEqual({ showPreCombat: true, showPrePot: true });
    expect(parseConsumablesTokens("cb,t:5")).toEqual({ showPreCombat: true, showPrePot: true });
  });

  it("round-trips each timing filter independently", () => {
    const preCombatOff = buildConsumablesTokens(null, { showPreCombat: false, showPrePot: true });
    expect(preCombatOff).toBe("pc:off");
    expect(parseConsumablesTokens(preCombatOff)).toEqual({ showPreCombat: false, showPrePot: true });

    const bothOff = buildConsumablesTokens(preCombatOff, { showPreCombat: false, showPrePot: false });
    expect(bothOff).toBe("pc:off,pp:off");
    expect(parseConsumablesTokens(bothOff)).toEqual({ showPreCombat: false, showPrePot: false });

    const backOn = buildConsumablesTokens(bothOff, { showPreCombat: true, showPrePot: true });
    expect(backOn).toBeNull();
  });

  it("preserves tokens owned by EventsPanel", () => {
    const built = buildConsumablesTokens("cb,t:5", { showPreCombat: false, showPrePot: true });
    expect(built).toBe("cb,t:5,pc:off");
    expect(buildConsumablesTokens(built, { showPreCombat: true, showPrePot: false })).toBe("cb,t:5,pp:off");
  });
});
