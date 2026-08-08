import type { Lesson } from "../../../PanelExplainer/types";
import type { ConsumablesCapabilities } from "./capabilities";

const readPlayerView: Lesson<ConsumablesCapabilities> = {
  id: "read-consumables",
  title: "Read one player's consumes",
  group: "essentials",
  description: (caps) =>
    caps.hasUses
      ? "Choose a player, compare their use count with the roster, and read each item's fight coverage."
      : "Choose a player and read their consumable usage item by item.",
  deriveState: (caps) => (caps.hasUses ? "available" : "example-required"),
  instruction:
    "Search for a consumable, then use the player header and roster strip to compare usage. Each item row shows uses and how many fights included it.",
  bullets: [
    "Use search to find a specific consumable",
    "Pick a player or step through the roster",
    "Roster bars compare use counts across the raid",
    "Item rows show uses and fight coverage",
  ],
  video: {
    load: () => import("./videos/ReadPlayer.video"),
    durationInFrames: 380,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const viewAll: Lesson<ConsumablesCapabilities> = {
  id: "view-all-consumables",
  title: "View every player at once",
  group: "essentials",
  description: (caps) =>
    caps.hasMultiplePlayers
      ? "Switch from one player to a table that shows every raider's total and item-by-item counts."
      : "Use View All to compare consumable totals across the raid.",
  deriveState: (caps) => (caps.hasMultiplePlayers ? "available" : "example-required"),
  instruction:
    "Click View All beside the player controls. Each row is one raider, with their total and a chip for every consumable they used.",
  bullets: [
    "Open View All from the player header",
    "Each row shows one player's total",
    "Consumable chips show item-by-item counts",
  ],
  video: {
    load: () => import("./videos/ViewAll.video"),
    durationInFrames: 410,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const raidWide: Lesson<ConsumablesCapabilities> = {
  id: "raid-wide-consumables",
  title: "Review the raid-wide ledger",
  group: "essentials",
  description: (caps) =>
    caps.hasMultiplePlayers
      ? "Switch to Raid Wide to rank every consumable by total uses and number of players."
      : "Switch to Raid Wide to aggregate every player's consumables into one ledger.",
  deriveState: (caps) => (caps.hasMultiplePlayers ? "available" : "example-required"),
  instruction:
    "Raid Wide combines the selected encounters. The header totals all uses, each row ranks an item, and the subtitle shows how many players used it.",
  bullets: [
    "Toggle Raid Wide to combine every player",
    "Rows rank items by total uses",
    "The subtitle shows how many players contributed",
  ],
  video: {
    load: () => import("./videos/RaidWide.video"),
    durationInFrames: 410,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const inspectItem: Lesson<ConsumablesCapabilities> = {
  id: "inspect-consumable",
  title: "Inspect an item's usage",
  group: "advanced",
  description: (caps) =>
    caps.hasMultipleEncounters
      ? "Open an item row to see which selected fights included it, or who used it raid-wide."
      : "Open an item row to inspect the uses behind its total.",
  deriveState: (caps) => (caps.hasMultipleItems ? "available" : "example-required"),
  instruction:
    "Click an item row. In player view, the breakout lists uses by encounter. In Raid Wide, it compares users and calls out raiders with zero uses.",
  bullets: [
    "Click any item row to open a breakout",
    "Player view breaks the item down by fight",
    "Raid Wide compares users and non-users",
  ],
  video: {
    load: () => import("./videos/InspectItem.video"),
    durationInFrames: 440,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const unresolved: Lesson<ConsumablesCapabilities> = {
  id: "unresolved-consumables",
  title: "Understand unresolved consumes",
  group: "advanced",
  description: (caps) =>
    caps.hasAmbiguousUses
      ? "The Ambiguous section preserves detected effects when the log cannot prove one item."
      : "Learn how Chronicle displays effects that cannot be tied to one item.",
  deriveState: (caps) => (caps.hasAmbiguousUses ? "available" : "example-required"),
  instruction:
    "Unresolved effects stay below the main ledger instead of being guessed into an item row. Candidate items appear when the effect matches more than one consumable.",
  bullets: [
    "Ambiguous effects stay separate from confirmed items",
    "Candidate items show what could match",
    "No price is assigned until one item is known",
  ],
  video: {
    load: () => import("./videos/Unresolved.video"),
    durationInFrames: 350,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

export const CONSUMABLES_LEDGER_LESSONS = [
  readPlayerView,
  viewAll,
  raidWide,
  inspectItem,
  unresolved,
];
