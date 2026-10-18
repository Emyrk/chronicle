/* eslint-disable react-refresh/only-export-components -- strip definitions and their renderers are intentionally colocated */
import { Activity, Coins, Timer } from "lucide-react";
import { useMemo } from "react";
import { useConsumableDisambiguations } from "@/api/queries";
import type { ConsumableDisambiguation } from "@/api/typesGenerated";
import { cn } from "@/lib/utils";
import { useDatasetId } from "@/hooks/useDatasetId";
import { ReplayTransportBar, usePlayerDeathTimes } from "../../ReplayControlOverlay";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import { useReplayToggleKey } from "../../replayToggleKey";
import { usePlayerLifeState } from "../usePlayerLifeState";
import { CoinAmount } from "../Consumables/CoinAmount";
import { buildConsumableDisambiguationMap, resolveConsumableUse } from "../Consumables/consumableDisambiguation";
import { consumablesLedgerProcessor, type ConsumablesResult } from "../Consumables/consumables.processor";
import { aggregateConsumablesLedger, ledgerCoverage } from "../Consumables/consumablesLedgerLogic";
import { useConsumablePrices } from "../Consumables/useConsumablePrices";
import { statusProcessor, type StatusResult } from "../Status/status.processor";
import {
  createStatusRaidHealthModel,
  statusRaidHealthAt,
  statusRaidHealthTimeline,
} from "../Status/statusRaidHealth";
import { useActualRaidDurabilityModel } from "../Status/useRaidDurabilityModel";
import { selectStatusEncounter, statusCursorMilli } from "../Status/statusTimeline";
import {
  raidDurabilityMode,
  replayStripVariant,
  stripOptionValue,
  stripTitleMode,
} from "./stripOptions";
import { raidHealthColor } from "./raidHealthColor";
import { replayControllerProcessor, type ReplayControllerResult } from "./replayController.processor";
import { ReplayControllerStrip } from "./ReplayControllerStrip";
import { stripReplayProgress } from "./stripReplay";
import type { StripDefinition, StripRenderProps, StripType } from "./types";

const HORIZONTAL_ONLY = ["horizontal"] as const;
const DEFAULT_SIZE = {
  minLength: 6,
  preferredLength: 12,
  minThickness: 1,
  preferredThickness: 1,
  maxThickness: 2,
};

/** The Replay strip's Slider variant: the floating overlay's transport bar. */
function ReplaySliderStrip() {
  const sync = useSyncModeContextOptional();
  const deaths = usePlayerDeathTimes();
  useReplayToggleKey(() => {
    if (!sync?.enabled || sync.externalDriver !== "none") return null;
    if (sync.isPlaying) {
      sync.pause();
      return "pause";
    }
    sync.play();
    return "play";
  });

  return <ReplayTransportBar deaths={deaths} />;
}

function ReplayStrip(props: StripRenderProps<ReplayControllerResult>) {
  const variant = replayStripVariant(props.panelOption);
  return variant === "slider" ? <ReplaySliderStrip /> : <ReplayControllerStrip {...props} bars={variant} />;
}

function ConsumablesCostStrip({ result, context, loading, panelOption }: StripRenderProps<ConsumablesResult>) {
  const datasetId = useDatasetId();
  const { data: disambiguations } = useConsumableDisambiguations(datasetId);
  const disambiguationMap = useMemo(
    () => buildConsumableDisambiguationMap(disambiguations as ConsumableDisambiguation[] | undefined),
    [disambiguations],
  );
  const resolvedUses = useMemo(
    () => [...result.uses.values()].map((use) => resolveConsumableUse(use, disambiguationMap)),
    [disambiguationMap, result.uses],
  );
  const prices = useConsumablePrices(context.instance.id, resolvedUses);
  const ledger = useMemo(
    () => aggregateConsumablesLedger(resolvedUses, prices),
    [prices, resolvedUses],
  );
  const coverage = ledgerCoverage(ledger);
  const label = stripOptionValue(panelOption, "t:") ?? "Raid Consume Cost";

  let summary = `${ledger.totalUses.toLocaleString()} consume${ledger.totalUses === 1 ? "" : "s"}`;
  if (coverage.showGold) summary += ` · ${coverage.label}`;

  return (
    <StripFrame label={label} summary={summary}>
      <div className="flex h-10 items-center justify-end border border-white/[0.07] bg-[#111316] px-4">
        {coverage.showGold ? (
          <CoinAmount copper={ledger.totalCopper} className="text-2xl font-semibold tracking-tight" />
        ) : (
          <span className="text-sm font-medium text-muted-foreground">
            {loading ? "Loading…" : "No price data"}
          </span>
        )}
      </div>
    </StripFrame>
  );
}

function RaidDurabilityStrip({ result, context, panelOption }: StripRenderProps<StatusResult>) {
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
  const estimatedModel = useMemo(() => createStatusRaidHealthModel(
    encounter ? Array.from(encounter.units.values()).filter((unit) => unit.kind === "player") : [],
    lifeTransitions,
  ), [encounter, lifeTransitions]);
  const actualSupported = context.instance.capabilities?.includes("unit-resources") ?? false;
  const mode = raidDurabilityMode(panelOption, actualSupported);
  const actualRaidHealth = useActualRaidDurabilityModel(
    context,
    encounter?.encounterId ?? null,
    mode === "actual",
  );
  const usesActual = mode === "actual" && actualRaidHealth.available;
  const model = usesActual ? actualRaidHealth.model : estimatedModel;

  if (!encounter || model.unitCount === 0) {
    return <StripEmpty label={`${usesActual ? "Actual" : "Estimated"} raid durability`} />;
  }

  const titleMode = stripTitleMode(panelOption);
  const title = stripOptionValue(panelOption, "t:") ?? "Raid Durability";
  const cursorMilli = statusCursorMilli(encounter, sync?.currentTimestamp ?? null, sync?.enabled ?? false);
  const current = statusRaidHealthAt(model, cursorMilli);
  const replayProgress = stripReplayProgress(
    sync?.enabled ?? false,
    sync?.currentTimestamp ?? null,
    sync?.encounterBounds ?? null,
  );
  const buckets = statusRaidHealthTimeline(model, encounter.startMilli, encounter.endMilli, 96);

  const bars = (
    <StripBars
      values={buckets.map((bucket) => bucket.percent)}
      colors={buckets.map((bucket) => raidHealthColor(bucket.percent))}
      max={100}
      title={(index) => `${Math.round(buckets[index]?.percent ?? 0)}% ${usesActual ? "actual" : "estimated"} durability`}
      replayProgress={replayProgress}
      className="h-full"
    />
  );

  if (titleMode === "large") {
    return (
      <div className="grid h-full min-h-0 grid-cols-[minmax(150px,220px)_minmax(0,1fr)] items-center gap-2 px-5 py-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {title}
          </span>
          <span className="truncate text-[9px] text-muted-foreground/70">
            {current.alive}/{current.total} active · {usesActual ? "sampled health" : "encounter estimate"}
          </span>
        </div>
        {bars}
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 p-2">
      {titleMode === "overlay" ? (
        <div className="pointer-events-none absolute bottom-3 left-4 z-20 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
          {title}
        </div>
      ) : null}
      {bars}
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
    <div className="grid h-full min-h-0 grid-cols-[minmax(150px,220px)_minmax(0,1fr)] items-center gap-2 px-5 py-2">
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
  replayProgress,
}: {
  values: number[];
  colors: string[];
  max: number;
  title: (index: number) => string;
  className?: string;
  replayProgress?: number | null;
}) {
  return (
    <div className={cn("relative h-10 overflow-hidden border border-white/[0.07] bg-[#111316] px-1.5 pb-1 pt-1.5", className)}>
      <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-white/[0.06]" />
      <div className="relative flex h-full items-end gap-px">
        {values.map((value, index) => {
          const isFuture = replayProgress !== null && replayProgress !== undefined
            && (index + 0.5) / Math.max(1, values.length) > replayProgress;
          return (
            <span
              key={index}
              className={cn(
                "min-w-0 flex-1 rounded-t-[1px] transition-opacity",
                colors[index],
                isFuture && "opacity-25",
              )}
              style={{ height: `${Math.max(2, value / Math.max(1, max) * 100)}%` }}
              title={title(index)}
            />
          );
        })}
      </div>
      {replayProgress !== null && replayProgress !== undefined ? (
        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-px bg-white/80 shadow-[0_0_5px_rgba(255,255,255,.55)]"
          style={{ left: `${replayProgress * 100}%` }}
        />
      ) : null}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const STRIPS: Record<StripType, StripDefinition<any, any>> = {
  replay: {
    ...replayControllerProcessor,
    id: "replay_strip",
    label: "Replay",
    icon: <Timer className="h-4 w-4" />,
    keybinds: [],
    syncDataMode: "full",
    supportedOrientations: HORIZONTAL_ONLY,
    defaultOrientation: "horizontal",
    size: DEFAULT_SIZE,
    hoverChrome: "above",
    render: (props) => <ReplayStrip {...props} />,
  },
  raid_durability: {
    ...statusProcessor,
    id: "raid_durability_strip",
    label: "Raid Durability",
    icon: <Activity className="h-4 w-4" />,
    keybinds: [],
    syncDataMode: "full",
    supportedOrientations: HORIZONTAL_ONLY,
    defaultOrientation: "horizontal",
    size: DEFAULT_SIZE,
    render: (props) => <RaidDurabilityStrip {...props} />,
  },
  consumables_cost: {
    ...consumablesLedgerProcessor,
    label: "Raid Consume Cost",
    icon: <Coins className="h-4 w-4" />,
    keybinds: [],
    supportsFiltering: true,
    defaultFilters: [
      { type: "source_type" as const, value: ["player"], applyTo: ["consume"] },
    ],
    supportedOrientations: HORIZONTAL_ONLY,
    defaultOrientation: "horizontal",
    size: DEFAULT_SIZE,
    render: (props) => <ConsumablesCostStrip {...props} />,
  },
};

export function isStripType(value: string | undefined): value is StripType {
  return Boolean(value && value in STRIPS);
}

// Saved layouts may name strips that became variants of another.
const LEGACY_STRIP_TYPES: Record<string, StripType> = {
  // The Replay strip's Durability variant (its default).
  replay_controller: "replay",
};

/** A saved layout's strip type, mapping retired types to their replacement; null when unknown. */
export function resolveStripType(value: string | undefined): StripType | null {
  if (isStripType(value)) return value;
  return value ? LEGACY_STRIP_TYPES[value] ?? null : null;
}
