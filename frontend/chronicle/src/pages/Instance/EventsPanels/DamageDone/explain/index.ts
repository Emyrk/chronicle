/**
 * Damage Done explainer — summary/tips plus the full lesson set
 * (capability derivation, lessons, example fixture).
 */

import { createElement } from "react";
import type { PanelExplainer } from "../../../PanelExplainer/types";
import type { DamageDoneResult } from "../damageDone.processor";
import { deriveCapabilities, type DamageDoneCapabilities } from "./capabilities";
import { ExampleDamageDonePanel } from "./ExampleDamageDonePanel";
import { DAMAGE_DONE_LESSONS } from "./lessons";

export const damageDoneExplainer: PanelExplainer<DamageDoneResult, DamageDoneCapabilities> = {
  summary:
    "Shows total damage dealt by each player (or enemy) during the selected encounters. " +
    "Useful for comparing DPS performance and identifying top contributors.",

  tips: [
    "Toggle 'Per Second' to see DPS instead of total damage",
    "Click any row to see breakdown by ability and target",
    "Select specific enemies in the Entity panel to see damage only to those targets",
    "Multi-select encounters (Ctrl/Cmd+click) to see combined totals",
    "You can open more than 1 breakout panel!",
    "Click 'By Target' to see the damage breakdown by target instead of by ability",
  ],

  lessonSet: {
    deriveCapabilities,
    lessons: DAMAGE_DONE_LESSONS,
    renderExample: () => createElement(ExampleDamageDonePanel),
  },
};
