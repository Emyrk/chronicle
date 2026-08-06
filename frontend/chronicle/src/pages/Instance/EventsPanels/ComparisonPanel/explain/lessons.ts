import type { Lesson } from "../../../PanelExplainer/types";
import type { ComparisonCapabilities } from "./capabilities";

const comparePanels: Lesson<ComparisonCapabilities> = {
  id: "compare-panels",
  title: "Compare two or more panels",
  group: "essentials",
  description: (caps) =>
    caps.hasRaidRoster
      ? "Choose two or more metric panels, then read each row as a colored share of the combined total."
      : "Choose two or more metric panels to build a shared, color-coded comparison.",
  deriveState: () => "available",
  instruction:
    "Add at least two source panels. Their border colors identify the stacked segments, and Matched only hides rows that do not appear in every source.",
  bullets: [
    "Select at least two panels that publish metric bar data",
    "Each source panel's border color identifies its share",
    "Add a third source or use Matched only to narrow the comparison",
  ],
  video: {
    load: () => import("./videos/ComparePanels.video"),
    durationInFrames: 500,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

const compareHunters: Lesson<ComparisonCapabilities> = {
  id: "compare-hunters",
  title: "Compare two focused hunters",
  group: "advanced",
  description: () =>
    "Focus a different hunter in each Damage Done panel, then compare their ability breakdowns side by side.",
  deriveState: () => "available",
  instruction:
    "Open two Damage Done panels, focus one hunter in each (right-click a player row), then pick both focused panels in Comparison. Their per-ability bars stack so you can see where each hunter spends damage.",
  bullets: [
    "Focus a different hunter in each Damage Done panel",
    "Select both focused panels in the Comparison picker",
    "Stacked bars show each hunter's share of every ability",
    "Matched only filters to abilities both hunters use",
  ],
  video: {
    load: () => import("./videos/CompareHunters.video"),
    durationInFrames: 470,
    fps: 30,
    width: 1280,
    height: 720,
  },
};

export const COMPARISON_LESSONS = [comparePanels, compareHunters];
