import type { Lesson } from "../../../PanelExplainer/types";
import type { EquipmentCapabilities } from "./capabilities";

type EquipmentLesson = Lesson<EquipmentCapabilities>;

export const EQUIPMENT_LESSONS: EquipmentLesson[] = [
  {
    id: "understand-gear",
    title: "Read gear and enchants",
    group: "essentials",
    description: (caps) => caps.hasGear ? "Scan every equipped slot, quality, and enchant at a glance." : "Needs combatant information from ChronicleCompanion.",
    deriveState: (caps) => caps.hasGear ? "available" : "example-required",
    instruction: "Choose a player, then scan the two-column slot list. Item colors show quality, and green subtitles show permanent enchants.",
    bullets: [
      "Every row maps to a fixed equipment slot",
      "Item names and borders use WoW quality colors",
      "Green subtitles identify permanent enchants",
    ],
    video: { load: () => import("./videos/UnderstandGear.video"), durationInFrames: 380, fps: 30, width: 1280, height: 720 },
  },
  {
    id: "read-talents",
    title: "Read a talent build",
    group: "essentials",
    description: (caps) => caps.hasTalents ? "See the exact points spent in every talent tree." : "This selection has no captured talent data.",
    deriveState: (caps) => caps.hasTalents ? "available" : caps.hasPlayers ? "limited" : "example-required",
    instruction: "Open Talents to inspect the captured build. The summary beside the player name shows points per tree, and the builder link opens the same allocation.",
    bullets: [
      "The point summary shows allocation across all three trees",
      "Rank badges reveal exactly where each point was spent",
      "Open the build in the talent builder for a larger view",
    ],
    video: { load: () => import("./videos/ReadTalents.video"), durationInFrames: 410, fps: 30, width: 1280, height: 720 },
  },
  {
    id: "compare-players",
    title: "Compare raid members",
    group: "advanced",
    description: (caps) => caps.hasMultiplePlayers ? "Search the roster and switch players without leaving the panel." : "Works best with several captured raid members.",
    deriveState: (caps) => caps.hasMultiplePlayers ? "available" : caps.hasPlayers ? "limited" : "example-required",
    instruction: "Open the player selector, type a name, and switch between raid members. The selected player and subtab stay encoded in the panel URL.",
    bullets: [
      "Search the class-colored roster by player name",
      "Switch players to compare the same slots and talent summary",
      "Your selected player and tab persist in the panel URL",
    ],
    video: { load: () => import("./videos/ComparePlayers.video"), durationInFrames: 440, fps: 30, width: 1280, height: 720 },
  },
];
