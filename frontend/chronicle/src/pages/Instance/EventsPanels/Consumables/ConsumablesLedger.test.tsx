import { describe, expect, it } from "vitest";
import { createConsumablesLedgerPanel } from "./ConsumablesLedger";
import {
  COMPARISON_TABLE_TOKEN,
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

  it("persists the comparison-table choice as a render-only panel option", () => {
    const panel = createConsumablesLedgerPanel();
    const comparisonOption = togglePanelOptionFlag("va", COMPARISON_TABLE_TOKEN, true);

    expect(panel.renderOnlyOptionTokens).toContain(COMPARISON_TABLE_TOKEN);
    expect(panelOptionTokens(comparisonOption)).toEqual(["va", COMPARISON_TABLE_TOKEN]);
    expect(togglePanelOptionFlag(comparisonOption, COMPARISON_TABLE_TOKEN, false)).toBe("va");
  });
});
