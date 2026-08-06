import { createElement } from "react";
import type { PanelExplainer } from "../../../PanelExplainer/types";
import { EquipmentDemo } from "../Equipment.demo";
import type { EquipmentResult } from "../equipment.processor";
import { deriveCapabilities, type EquipmentCapabilities } from "./capabilities";
import { EQUIPMENT_LESSONS } from "./lessons";

export const equipmentExplainer: PanelExplainer<EquipmentResult, EquipmentCapabilities> = {
  summary: "Shows each raid member's captured gear, enchants, character details, and talent allocation from combatant information in the log.",
  tips: [
    "Use the class-colored player selector to search the raid roster",
    "Green text beneath an item identifies its permanent enchant",
    "The points beside a player name summarize their three talent trees",
    "Open Talents to inspect exact ranks or jump to the talent builder",
    "Equipment data requires ChronicleCompanion combatant information and a reparse",
  ],
  lessonSet: {
    deriveCapabilities,
    lessons: EQUIPMENT_LESSONS,
    renderExample: () => createElement("div", { className: "grid h-full place-items-center rounded-lg border border-border bg-card" }, createElement(EquipmentDemo)),
  },
};
