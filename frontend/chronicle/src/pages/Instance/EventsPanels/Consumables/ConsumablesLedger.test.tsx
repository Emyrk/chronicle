import { describe, expect, it } from "vitest";
import { createConsumablesLedgerPanel } from "./ConsumablesLedger";
import {
  COMPARISON_TABLE_TOKEN,
  PRE_COMBAT_TOKEN,
  panelOptionTokens,
  togglePanelOptionFlag,
} from "./LedgerShared";

describe("Consumes Used filters", () => {
  it("defaults to hiding common food and drink effects with an editable filter", () => {
    const panel = createConsumablesLedgerPanel();

    expect(panel.supportsFiltering).toBe(true);
    expect(panel.defaultFilters).toContainEqual({
      type: "consume_effect",
      value: ["Drink", "Food", "Strong Alcohol"],
      negate: true,
      applyTo: ["consume"],
    });
    expect(panel.fixedFilters).toBeUndefined();
  });

  it("persists the pre-combat choice as a render-only panel option", () => {
    const panel = createConsumablesLedgerPanel();
    const sharedOption = togglePanelOptionFlag("pl:player-guid", PRE_COMBAT_TOKEN, true);

    expect(panel.renderOnlyOptionTokens).toContain(PRE_COMBAT_TOKEN);
    expect(panelOptionTokens(sharedOption)).toEqual(["pl:player-guid", PRE_COMBAT_TOKEN]);
    expect(togglePanelOptionFlag(sharedOption, PRE_COMBAT_TOKEN, false)).toBe("pl:player-guid");
  });

  it("persists the comparison-table choice as a render-only panel option", () => {
    const panel = createConsumablesLedgerPanel();
    const comparisonOption = togglePanelOptionFlag("va", COMPARISON_TABLE_TOKEN, true);

    expect(panel.renderOnlyOptionTokens).toContain(COMPARISON_TABLE_TOKEN);
    expect(panelOptionTokens(comparisonOption)).toEqual(["va", COMPARISON_TABLE_TOKEN]);
    expect(togglePanelOptionFlag(comparisonOption, COMPARISON_TABLE_TOKEN, false)).toBe("va");
  });
});
