import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { CheckCircle } from "lucide-react";
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import { EncounterPhaseStrip, type EncounterPhaseStripVariant } from "./EncounterPhaseStrip";
import type { Encounter, EncounterPhase } from "./InstancePage";
import { formatDurationMs } from "./phaseTimeRange";

const START = Date.parse("2026-11-10T20:00:00Z");

/** Builds an encounter whose phases run back to back with the given names and durations (seconds). */
function encounterWithPhases(name: string, spec: readonly [string, number][]): Encounter {
  let offset = 0;
  const phases: EncounterPhase[] = spec.map(([phaseName, seconds], order) => {
    const start = offset;
    offset += seconds * 1000;
    return {
      id: `${name}-phase-${order}`,
      encounter_id: name,
      key: phaseName.toLowerCase().replace(/\s+/g, "_"),
      name: phaseName,
      order,
      start_offset_ms: start,
      end_offset_ms: offset,
      start_time: new Date(START + start).toISOString(),
      end_time: new Date(START + offset).toISOString(),
      kill_type: "clean",
    };
  });
  return {
    id: name,
    name,
    boss: true,
    mapId: 0,
    kill_type: "clean",
    start_time: new Date(START).toISOString(),
    end_time: new Date(START + offset).toISOString(),
    phases,
  };
}

/** Mirrors the selected boss row in the instance sidebar (267px wide, minus its right padding). */
function SelectedEncounterRow({
  encounter,
  width,
  variant = "chips",
}: {
  encounter: Encounter;
  width: number;
  variant?: EncounterPhaseStripVariant;
}) {
  const [activePhaseId, setActivePhaseId] = useState<string | null>(null);
  const phases = encounter.phases ?? [];
  const durationMs = Date.parse(encounter.end_time) - Date.parse(encounter.start_time);
  return (
    <div style={{ width }}>
      <div className="rounded-md bg-primary-darker text-primary-foreground border-l-3 border-l-primary-foreground/70 shadow-sm">
        <div className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm">
          <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
          <span className="flex-1 truncate font-semibold">{encounter.name}</span>
          <span className="shrink-0 font-mono text-xs opacity-70">{formatDurationMs(durationMs)}</span>
        </div>
        <EncounterPhaseStrip
          encounter={encounter}
          phases={phases}
          activePhaseId={activePhaseId}
          variant={variant}
          onSelectPhase={(range) => {
            const match = phases.find((p) => p.start_offset_ms === range.start_offset_ms);
            setActivePhaseId((current) => (current === match?.id ? null : match?.id ?? null));
          }}
        />
      </div>
    </div>
  );
}

const meta = {
  title: "Instance/EncounterPhaseStrip",
  component: SelectedEncounterRow,
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="min-h-64 bg-background p-8 pt-24 text-foreground">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
  parameters: { layout: "fullscreen" },
  args: { width: 251 },
  argTypes: {
    width: { control: { type: "range", min: 200, max: 600, step: 1 } },
    variant: { control: "inline-radio", options: ["chips", "list", "bar"] },
  },
} satisfies Meta<typeof SelectedEncounterRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const TwoPhases: Story = {
  args: {
    encounter: encounterWithPhases("Onyxia", [["Phase 1", 95], ["Phase 2", 140], ["Phase 3", 70]]),
  },
};

/** The Lich King: five phases plus transitions, the case from the bug report. */
export const LichKing: Story = {
  args: {
    encounter: encounterWithPhases("The Lich King", [
      ["Phase 1", 160],
      ["Transition 1", 62],
      ["Phase 2", 190],
      ["Transition 2", 62],
      ["Phase 3", 215],
      ["Frostmourne", 50],
      ["Phase 3", 7],
    ]),
  },
};

/** Ten short phases with long names. */
export const ManyPhases: Story = {
  args: {
    encounter: encounterWithPhases("Kel'Thuzad", [
      ["Phase 1 – Adds", 230],
      ["Phase 2", 60],
      ["Frost Blast", 15],
      ["Phase 2", 45],
      ["Chains", 20],
      ["Phase 2", 70],
      ["Guardians", 30],
      ["Phase 3", 90],
      ["Shadow Fissures", 25],
      ["Phase 3 – Burn", 40],
    ]),
  },
};

/** One very long phase next to several tiny ones. */
export const LopsidedPhases: Story = {
  args: {
    encounter: encounterWithPhases("Ragnaros", [
      ["Phase 1", 600],
      ["Submerge", 5],
      ["Sons", 5],
      ["Emerge", 5],
      ["Phase 2", 3],
    ]),
  },
};

const VARIANTS: { variant: EncounterPhaseStripVariant; label: string }[] = [
  { variant: "chips", label: "Current (chips)" },
  { variant: "list", label: "Option 1: list" },
  { variant: "bar", label: "Option 3: segmented bar" },
];

/** Every layout prototype against every fixture. Click phases to see the selected state. */
export const Comparison: Story = {
  args: { encounter: LichKing.args!.encounter! },
  render: ({ width }) => (
    <div className="grid gap-x-10 gap-y-8" style={{ gridTemplateColumns: `repeat(3, ${width}px)` }}>
      {VARIANTS.map(({ label }) => (
        <h3 key={label} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </h3>
      ))}
      {[TwoPhases, LichKing, ManyPhases, LopsidedPhases].flatMap((story) =>
        VARIANTS.map(({ variant }) => (
          <SelectedEncounterRow
            key={`${story.args!.encounter!.id}-${variant}`}
            encounter={story.args!.encounter!}
            width={width}
            variant={variant}
          />
        )),
      )}
    </div>
  ),
};

export const WideSidebar: Story = {
  args: { ...LichKing.args, width: 480 },
};
