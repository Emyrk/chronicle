/* eslint-disable react-refresh/only-export-components -- strip definitions and their renderers are intentionally colocated */
import { Activity, Swords } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import { usePlayerLifeState } from "../usePlayerLifeState";
import { statusProcessor, type StatusResult } from "../Status/status.processor";
import {
  createStatusRaidHealthModel,
  statusRaidHealthTimeline,
} from "../Status/statusRaidHealth";
import { selectStatusEncounter } from "../Status/statusTimeline";
import type { PanelFilter } from "../processors/filters";
import {
  totalDamageBuckets,
  totalDamageDoneStripProcessor,
  type TotalDamageDoneResult,
} from "./totalDamageDone.processor";
import type { StripDefinition, StripRenderProps, StripType } from "./types";

const HORIZONTAL_ONLY = ["horizontal"] as const;
const DEFAULT_SIZE = {
  minLength: 6,
  preferredLength: 12,
  minThickness: 1,
  preferredThickness: 1,
  maxThickness: 2,
};

function raidHealthColor(percent: number): string {
  if (percent < 25) return "bg-red-500/80";
  if (percent < 55) return "bg-amber-500/65";
  return "bg-emerald-500/60";
}

function RaidDurabilityStrip({ result, context }: StripRenderProps<StatusResult>) {
  const sync = useSyncModeContextOptional();
  const playerLife = usePlayerLifeState(context);
  const encounter = useMemo(
    () => selectStatusEncounter(result.encounters, context.selectedEncounterIds, sync?.currentTimestamp?.getTime() ?? null),
    [context.selectedEncounterIds, result.encounters, sync?.currentTimestamp],
  );
  const lifeTransitions = useMemo(() => {
    if (!encounter || playerLife.loading || playerLife.error) return undefined;
    return new Map(Object.keys(context.instance.players ?? {}).map((playerId) => [
      playerId,
      playerLife.state.transitions(encounter.encounterId, playerId),
    ]));
  }, [context.instance.players, encounter, playerLife.error, playerLife.loading, playerLife.state]);
  const model = useMemo(() => createStatusRaidHealthModel(
    encounter ? Array.from(encounter.units.values()).filter((unit) => unit.kind === "player") : [],
    lifeTransitions,
  ), [encounter, lifeTransitions]);

  if (!encounter || model.unitCount === 0) {
    return <StripEmpty label="Estimated raid durability" />;
  }

  const buckets = statusRaidHealthTimeline(model, encounter.startMilli, encounter.endMilli, 96);

  return (
    <div className="h-full min-h-0 p-2">
      <StripBars
        values={buckets.map((bucket) => bucket.percent)}
        colors={buckets.map((bucket) => raidHealthColor(bucket.percent))}
        max={100}
        title={(index) => `${Math.round(buckets[index]?.percent ?? 0)}% estimated durability`}
        className="h-full"
      />
    </div>
  );
}

function TotalDamageDoneStrip({ result, context }: StripRenderProps<TotalDamageDoneResult>) {
  const buckets = useMemo(
    () => totalDamageBuckets(result, context.selectedEncounterIds, 96),
    [context.selectedEncounterIds, result],
  );
  const max = Math.max(1, ...buckets.map((bucket) => bucket.amount));

  return (
    <div className="h-full min-h-0 p-2">
      <StripBars
        values={buckets.map((bucket) => bucket.amount)}
        colors={buckets.map(() => "bg-blue-500/70")}
        max={max}
        title={(index) => `${formatNumber(buckets[index]?.amount ?? 0)} damage`}
        className="h-full"
      />
    </div>
  );
}

function StripEmpty({ label }: { label: string }) {
  return (
    <StripFrame label={label} summary="No matching data">
      <div className="h-10 border border-white/[0.07] bg-[#111316]" />
    </StripFrame>
  );
}

function StripFrame({
  label,
  summary,
  children,
}: {
  label: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(180px,0.9fr)_minmax(320px,4fr)] items-center gap-4 px-5 py-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
        <span className="truncate text-[9px] text-muted-foreground/70">{summary}</span>
      </div>
      {children}
    </div>
  );
}

function StripBars({
  values,
  colors,
  max,
  title,
  className,
}: {
  values: number[];
  colors: string[];
  max: number;
  title: (index: number) => string;
  className?: string;
}) {
  return (
    <div className={cn("relative h-10 overflow-hidden border border-white/[0.07] bg-[#111316] px-1.5 pb-1 pt-1.5", className)}>
      <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-white/[0.06]" />
      <div className="relative flex h-full items-end gap-px">
        {values.map((value, index) => (
          <span
            key={index}
            className={cn("min-w-0 flex-1 rounded-t-[1px]", colors[index])}
            style={{ height: `${Math.max(2, value / Math.max(1, max) * 100)}%` }}
            title={title(index)}
          />
        ))}
      </div>
    </div>
  );
}

const damageFilters: PanelFilter[] = [
  { type: "source_type", value: ["player", "pet"], applyTo: ["damage"] },
  { type: "target_type", value: ["player", "pet"], negate: true, applyTo: ["damage"] },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const STRIPS: Record<StripType, StripDefinition<any, any>> = {
  raid_durability: {
    ...statusProcessor,
    id: "raid_durability_strip",
    label: "Raid Durability",
    icon: <Activity className="h-4 w-4" />,
    syncDataMode: "full",
    supportedOrientations: HORIZONTAL_ONLY,
    defaultOrientation: "horizontal",
    size: DEFAULT_SIZE,
    render: (props) => <RaidDurabilityStrip {...props} />,
  },
  total_damage_done: {
    ...totalDamageDoneStripProcessor,
    label: "Total Damage Done",
    icon: <Swords className="h-4 w-4" />,
    supportsFiltering: true,
    fixedFilters: damageFilters,
    supportedOrientations: HORIZONTAL_ONLY,
    defaultOrientation: "horizontal",
    size: DEFAULT_SIZE,
    render: (props) => <TotalDamageDoneStrip {...props} />,
  },
};

export function isStripType(value: string | undefined): value is StripType {
  return Boolean(value && value in STRIPS);
}
