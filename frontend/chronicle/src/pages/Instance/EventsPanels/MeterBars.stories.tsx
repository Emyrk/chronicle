import type { Meta, StoryObj } from "@storybook/react-vite";
import type { PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { formatNumber } from "@/lib/format";
import { MeterBars } from "./MeterBars";

// Hakkar kill (ZG, 128.9 s): damage done per player.
const HAKKAR_SECONDS = 128.9;
const damage: [string, string, number][] = [
  ["Katq", "WARRIOR", 79553], ["Stevexd", "WARRIOR", 70177], ["Redpala", "PALADIN", 68287], ["Zoidra", "HUNTER", 67723],
  ["Soller", "SHAMAN", 60980], ["Fristee", "MAGE", 56637], ["Ahsomon", "WARLOCK", 45164], ["Foxygon", "PALADIN", 41841],
  ["Racca", "WARRIOR", 24127], ["Lightlessa", "PRIEST", 2000], ["Okokwf", "SHAMAN", 1672],
];
const toRows = (rows: [string, string, number][]): PlayerMetricChartData[] =>
  rows.map(([playerName, className, value]) => ({ playerID: playerName, playerName, className, specialization: "", value }));

// Threat estimate on the same pull: Katq tanking (1.3 × 1.15), other warriors 0.8.
const TANK = "Katq";
const RANGED = new Set(["MAGE", "WARLOCK", "HUNTER", "PRIEST"]);
const threat = toRows(damage.map(([name, cls, value]) => [name, cls, Math.round(value * (name === TANK ? 1.495 : cls === "WARRIOR" ? 0.8 : 1))]));
const tankThreat = threat.find((row) => row.playerName === TANK)!.value;
// Pull aggro on the boss table: one ranged DPS over 130%.
const pulling = threat.map((row) => (row.playerName === "Fristee" ? { ...row, value: Math.round(tankThreat * 1.34) } : row));

function Column({ children }: { children: React.ReactNode }) {
  return <div className="w-[320px] rounded-md border border-white/10 bg-card p-3">{children}</div>;
}

const meta = {
  title: "Instance/MeterBars",
  component: MeterBars,
  parameters: { layout: "centered" },
  decorators: [(Story) => <Column><Story /></Column>],
  args: { data: toRows(damage), openLabel: "Open the Damage tab", onOpen: () => {} },
} satisfies Meta<typeof MeterBars>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Watch preset's bars, unchanged. */
export const Bars: Story = {};

/** Values mode: DPS + % share, top five, "+N more". */
export const DpsValues: Story = {
  args: {
    values: { formatValue: (value) => formatNumber(value / HAKKAR_SECONDS, 1) },
  },
};

const threatValues = (data: PlayerMetricChartData[]) => {
  const scaleMax = (tankThreat * 1.3) / 0.55; // 130% of the tank sits at 55% of a 320 px row, clear of the value columns
  return {
    data,
    openLabel: "Open the Threat tab",
    values: {
      formatValue: (value: number) => formatNumber(value, 1),
      shareBase: tankThreat,
      formatShare: (share: number) => `${Math.round(share * 100)}%`,
      scaleMax,
      tagFor: (row: PlayerMetricChartData) => {
        if (row.playerName === TANK) return { label: "tank" };
        const limit = RANGED.has(row.className) ? 1.3 : 1.1;
        return row.value / tankThreat >= limit ? { label: "pulls", color: "#ec1337" } : undefined;
      },
      markers: [
        { value: tankThreat * 1.1, color: "#f0a8a8", label: "110% melee" },
        { value: tankThreat * 1.3, color: "#ec1337", label: "130% ranged" },
      ],
    },
  };
};

/** Threat-shaped: value + % of tank, TANK tag, 110% / 130% pull-aggro lines. */
export const ThreatValues: Story = { args: threatValues(threat) };

/** A ranged DPS over 130% of the tank gets the PULLS tag. */
export const ThreatPulling: Story = { args: threatValues(pulling) };

/** Values mode with no click target: "+N more" is plain text. */
export const DpsValuesStatic: Story = {
  args: { onOpen: undefined, values: { formatValue: (value) => formatNumber(value / HAKKAR_SECONDS, 1) } },
};
