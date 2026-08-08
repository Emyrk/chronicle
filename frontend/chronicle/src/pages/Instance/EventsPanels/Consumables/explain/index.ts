import { createElement } from "react";
import type { PanelExplainer } from "../../../PanelExplainer/types";
import type { ConsumablesResult } from "../consumables.processor";
import { deriveCapabilities, type ConsumablesCapabilities } from "./capabilities";
import { ExampleConsumablesLedgerPanel } from "./ExampleConsumablesLedgerPanel";
import { CONSUMABLES_LEDGER_LESSONS } from "./lessons";

export const consumablesLedgerExplainer: PanelExplainer<
  ConsumablesResult,
  ConsumablesCapabilities
> = {
  summary:
    "Shows consumables used by one player or across the raid, with per-item counts, encounter coverage, and unresolved evidence kept separate from confirmed items.",
  tips: [
    "Step through players with the arrows or choose a name from the player picker",
    "Use the roster strip to spot players with unusually high, low, or zero usage",
    "Toggle Raid Wide to rank consumables by total uses and number of users",
    "Click an item row to inspect its encounter or player breakdown",
    "Filter before aggregation to recalculate rows, totals, and roster bars together",
    "Ambiguous effects are shown separately instead of being guessed into an item",
  ],
  lessonSet: {
    deriveCapabilities,
    lessons: CONSUMABLES_LEDGER_LESSONS,
    renderExample: () => createElement(ExampleConsumablesLedgerPanel),
  },
};
