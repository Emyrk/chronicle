import type { PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import type { ChartDataEntry } from "../../ChartDataRegistry";
import type { PanelRenderProps } from "../../types";
import { getFixturePanelContext } from "../../DamageDone/explain/fixture";
import type { ComparisonResult } from "../comparison.processor";

export const COMPARISON_FIXTURE_DURATION_MS = 120_000;

const PLAYERS = [
  ["mage", "Aeloria", "mage"],
  ["warlock", "Morthos", "warlock"],
  ["rogue", "Shade", "rogue"],
  ["warrior", "Ironward", "warrior"],
  ["hunter", "Thorn", "hunter"],
  ["priest", "Seraphine", "priest"],
] as const;

function metricData(values: number[]): PlayerMetricChartData[] {
  return PLAYERS.slice(0, values.length).map(
    ([playerID, playerName, className], index) => ({
      playerID,
      playerName,
      className,
      specialization: "",
      value: values[index],
    }),
  );
}

export function getComparisonFixtureEntries(): Map<string, ChartDataEntry> {
  const entries: ChartDataEntry[] = [
    {
      panelId: "panel-1",
      panelIndex: 0,
      panelType: "damage_done",
      label: "Damage Done",
      borderColor: "#facc15",
      data: metricData([386000, 341000, 318000, 292000, 251000, 0]),
    },
    {
      panelId: "panel-2",
      panelIndex: 1,
      panelType: "healing_done",
      label: "Healing Done",
      borderColor: "#4ade80",
      data: metricData([42000, 28000, 18000, 71000, 36000, 264000]),
    },
    {
      panelId: "panel-3",
      panelIndex: 2,
      panelType: "damage_taken",
      label: "Damage Taken",
      borderColor: "#60a5fa",
      data: metricData([126000, 94000, 181000, 238000, 112000, 76000]),
    },
  ];

  return new Map(entries.map((entry) => [entry.panelId, entry]));
}

// ── Hunter focus comparison ──
// Two Damage Done panels, each focused on a different hunter.
// Chart data shows per-ability breakdown (mirrors the real focused-panel shape).

function abilityData(
  abilities: [string, number][],
  barClass: string,
): PlayerMetricChartData[] {
  return abilities.map(([name, value]) => ({
    playerID: name,
    playerName: name,
    className: barClass,
    specialization: "",
    value,
  }));
}

export function getHunterComparisonEntries(): Map<string, ChartDataEntry> {
  const entries: ChartDataEntry[] = [
    {
      panelId: "panel-1",
      panelIndex: 0,
      panelType: "damage_done",
      label: "Thorn",
      borderColor: "#facc15",
      data: abilityData(
        [
          ["Auto Shot", 89000],
          ["Aimed Shot", 64000],
          ["Multi-Shot", 47000],
          ["Serpent Sting", 29000],
          ["Arcane Shot", 16000],
        ],
        "hunter",
      ),
    },
    {
      panelId: "panel-2",
      panelIndex: 1,
      panelType: "damage_done",
      label: "Wildmark",
      borderColor: "#60a5fa",
      data: abilityData(
        [
          ["Auto Shot", 94000],
          ["Aimed Shot", 38000],
          ["Multi-Shot", 53000],
          ["Raptor Strike", 24000],
          ["Serpent Sting", 32000],
        ],
        "hunter",
      ),
    },
  ];

  return new Map(entries.map((entry) => [entry.panelId, entry]));
}

export function getComparisonFixtureRenderProps(
  panelOption: string | null,
): PanelRenderProps<ComparisonResult> {
  return {
    result: {},
    totalEvents: 0,
    processingTimeMs: 0,
    durationMs: COMPARISON_FIXTURE_DURATION_MS,
    perSecond: false,
    checkboxChecked: false,
    loading: false,
    processing: false,
    error: null,
    context: getFixturePanelContext(),
    panelOption,
    setPanelOption: () => {},
    panelIndex: 3,
    panelId: "panel-4",
  };
}
