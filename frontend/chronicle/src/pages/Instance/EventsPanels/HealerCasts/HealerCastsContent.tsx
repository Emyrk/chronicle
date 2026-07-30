import { HeartPulse } from "lucide-react";
import { Fragment, useMemo } from "react";
import { useSpell } from "@/api/queries";
import { RelativeHealthBar } from "@/components/ui/RelativeHealthBar/RelativeHealthBar";
import { SpellIconWithTooltip } from "@/components/ui/SpellIconWithTooltip";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDatasetId } from "@/hooks/useDatasetId";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import type { PanelContext, PanelRenderProps } from "../types";
import { useInferredRoles } from "../Roles/useInferredRoles";
import { createStatusPanel } from "../Status/Status";
import type { StatusResult } from "../Status/status.processor";
import { statusUnitRelativeHealthBounds } from "../Status/statusTimeline";
import { usePanelAggregation } from "../usePanelAggregation";
import { usePlayerLifeState } from "../usePlayerLifeState";
import {
  healerCastComposition,
  healerCastStateAt,
  isTransientOffHealer,
  normalizedCastStarts,
  selectHealerCastsEncounter,
  type HealerCastsResult,
} from "./healerCasts.processor";
import { healerTargetHealthSnapshot } from "./healerTargetHealth";

function CastSpell({ spellId, spellName }: { spellId: number | null; spellName: string }) {
  const datasetId = useDatasetId();
  const { data: spell } = useSpell(
    spellId && spellId > 0 ? String(spellId) : "",
    datasetId,
    { enabled: spellId !== null && spellId > 0 },
  );

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {spell ? (
        <SpellIconWithTooltip spell={spell} size={16} className="size-4 shrink-0" />
      ) : (
        <span className="size-4 shrink-0 rounded-sm border border-white/10 bg-black/25" />
      )}
      <span className="truncate">{spellName}</span>
    </span>
  );
}

const CAST_PLACEMENT_COLORS: Record<number, string> = {
  1: "text-emerald-400",
  2: "text-sky-400",
  3: "text-violet-400",
  4: "text-slate-300",
};

function castPlacementColor(placement: number | null): string {
  if (placement === null) return "text-muted-foreground/60";
  return CAST_PLACEMENT_COLORS[placement] ?? "text-muted-foreground/60";
}

function classColor(className: string): string {
  if (!className || className === "UNKNOWN") return "var(--color-muted-foreground)";
  return `var(--color-class-${className.toLowerCase()})`;
}

function resolveUnitName(
  unitId: string,
  players: PanelRenderProps<HealerCastsResult>["context"]["instance"]["players"],
  units: PanelRenderProps<HealerCastsResult>["context"]["instance"]["units"],
): string {
  if (!unitId) return "No target";
  return players?.[unitId]?.name ?? units?.[unitId]?.name ?? "Unknown target";
}

export function HealerCastsContent({ result, context }: PanelRenderProps<HealerCastsResult>) {
  const sync = useSyncModeContextOptional();
  const inferredRoles = useInferredRoles(context);
  const playerLife = usePlayerLifeState(context);
  const encounterIdsKey = context.selectedEncounterIds.slice().sort().join(",");
  const instanceId = context.instance.id;
  const statusContext = useMemo<PanelContext>(() => ({
    instance: context.instance,
    selectedEncounterIds: context.selectedEncounterIds,
    entitySelection: {
      enemyIds: new Set<string>(),
      playerIds: new Set<string>(),
    },
  // Target health needs the complete raid, independent of Healer Casts selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [encounterIdsKey, instanceId]);
  const statusPanel = useMemo(() => createStatusPanel(), []);
  const statusAggregation = usePanelAggregation<StatusResult>({
    panel: statusPanel,
    context: statusContext,
  });
  const encounter = useMemo(
    () => selectHealerCastsEncounter(
      result.encounters,
      context.selectedEncounterIds,
      sync?.currentTimestamp?.getTime() ?? null,
    ),
    [context.selectedEncounterIds, result.encounters, sync?.currentTimestamp],
  );
  const cursorMilli = encounter
    ? (sync?.enabled && sync.currentTimestamp
        ? Math.max(encounter.startMilli, sync.currentTimestamp.getTime())
        : encounter.endMilli)
    : null;
  const selectedPlayers = context.entitySelection.playerIds;
  const healers = useMemo(() => Object.entries(context.instance.players ?? {})
    .filter(([playerId]) => inferredRoles.roles.get(playerId)?.role === "healer")
    .filter(([playerId]) => selectedPlayers.size === 0 || selectedPlayers.has(playerId))
    .sort(([, a], [, b]) => a.name.localeCompare(b.name)), [context.instance.players, inferredRoles.roles, selectedPlayers]);
  const offHealers = useMemo(() => {
    if (!encounter || cursorMilli === null) return [];
    return Object.entries(context.instance.players ?? {})
      .filter(([playerId]) => inferredRoles.roles.get(playerId)?.role !== "healer")
      .filter(([playerId]) => selectedPlayers.size === 0 || selectedPlayers.has(playerId))
      .filter(([playerId]) => isTransientOffHealer(
        healerCastStateAt(encounter.castsByPlayer.get(playerId) ?? [], cursorMilli),
      ))
      .sort(([, a], [, b]) => a.name.localeCompare(b.name));
  }, [context.instance.players, cursorMilli, encounter, inferredRoles.roles, selectedPlayers]);
  const displayRows = useMemo(() => {
    const rows = [
      ...healers.map(([playerId, player]) => ({ playerId, player, offHealing: false })),
      ...offHealers.map(([playerId, player]) => ({ playerId, player, offHealing: true })),
    ].map((row) => ({
      ...row,
      castState: encounter && cursorMilli !== null
        ? healerCastStateAt(encounter.castsByPlayer.get(row.playerId) ?? [], cursorMilli)
        : null,
    }));
    const starts = normalizedCastStarts(rows.flatMap((row) => row.castState ? [row.castState] : []));
    let startIndex = 0;
    return rows.map((row) => {
      const start = row.castState ? starts[startIndex++] : null;
      return {
        ...row,
        startOffsetSeconds: start?.offsetSeconds ?? null,
        startPlacement: start?.placement ?? null,
      };
    });
  }, [cursorMilli, encounter, healers, offHealers]);
  const statusEncounter = encounter
    ? statusAggregation.result.encounters.get(encounter.encounterId) ?? null
    : null;
  const targetHealthBounds = useMemo(() => {
    if (!statusEncounter) return new Map();
    return new Map(Array.from(statusEncounter.units.values())
      .filter((unit) => unit.kind === "player")
      .map((unit) => [
        unit.unitId,
        statusUnitRelativeHealthBounds(
          unit,
          playerLife.loading || playerLife.error
            ? undefined
            : playerLife.state.transitions(statusEncounter.encounterId, unit.unitId),
        ),
      ]));
  }, [playerLife.error, playerLife.loading, playerLife.state, statusEncounter]);

  if (inferredRoles.loading || inferredRoles.processing) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Identifying healers…
      </div>
    );
  }

  if (inferredRoles.error) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-xs text-destructive">
        Healer roles could not be inferred for this encounter.
      </div>
    );
  }

  if (healers.length === 0 && offHealers.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-xs text-muted-foreground">
        <HeartPulse className="h-5 w-5 opacity-50" />
        <span>No healers were inferred for the selected encounter.</span>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background/20">
      <div className="grid min-w-[618px] grid-cols-[132px_250px_220px] gap-2 border-b border-border/40 px-4 py-2 text-[9px] uppercase tracking-[0.13em] text-muted-foreground">
        <span className="pl-9">Healer</span>
        <span>Current cast</span>
        <span>Target</span>
      </div>
      {!encounter || cursorMilli === null ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-muted-foreground">
          No cast data is available for the selected encounter.
        </div>
      ) : (
        <div className="styled-scrollbar min-h-0 flex-1 overflow-auto p-2">
          {displayRows.map(({
            playerId,
            player,
            offHealing,
            castState,
            startOffsetSeconds,
            startPlacement,
          }, rowIndex) => {
            if (!castState) return null;
            const cast = castState.cast;
            const impactTargetIds = castState.impact?.targetIds ?? [];
            const targetId = impactTargetIds.length === 1 ? impactTargetIds[0] : cast?.targetId ?? "";
            const targetName = impactTargetIds.length > 1
              ? `${impactTargetIds.length} targets`
              : cast
                ? resolveUnitName(targetId, context.instance.players, context.instance.units)
                : "—";
            const targetClass = targetId ? context.instance.players?.[targetId]?.class : null;
            const targetLifeTransitions = targetId && !playerLife.loading && !playerLife.error && statusEncounter
              ? playerLife.state.transitions(statusEncounter.encounterId, targetId)
              : undefined;
            const targetHealth = castState.status !== "idle" && targetId && impactTargetIds.length <= 1
              ? healerTargetHealthSnapshot(
                  statusEncounter,
                  targetId,
                  cursorMilli,
                  targetLifeTransitions,
                  targetHealthBounds.get(targetId),
                )
              : null;
            const composition = castState.impact ? healerCastComposition(castState.impact) : null;
            const impactTitle = castState.impact
              ? [
                  `${formatNumber(castState.impact.effective)} effective healing`,
                  castState.impact.overheal > 0 ? `${formatNumber(castState.impact.overheal)} overhealing` : null,
                  castState.impact.absorbed > 0 ? `${formatNumber(castState.impact.absorbed)} absorbed` : null,
                ].filter(Boolean).join(" · ")
              : undefined;
            return (
              <Fragment key={playerId}>
                {offHealing && rowIndex === healers.length ? (
                  <div className="flex min-w-[618px] items-center gap-2 px-2 py-1 text-[8px] uppercase tracking-[0.14em] text-muted-foreground/65">
                    <span className="h-px flex-1 bg-border/40" />
                    <span>Off-healing</span>
                    <span className="h-px flex-1 bg-border/40" />
                  </div>
                ) : null}
                <div
                  className="grid min-h-9 min-w-[618px] grid-cols-[132px_250px_220px] items-center gap-2 border-b border-border/20 px-2 py-1 last:border-b-0"
                >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "w-7 shrink-0 text-right font-mono text-[10px] font-medium tabular-nums",
                      castPlacementColor(startPlacement),
                    )}
                    title={startOffsetSeconds === null
                      ? undefined
                      : `Started ${startOffsetSeconds.toFixed(1)} seconds after the first displayed cast`}
                  >
                    {startOffsetSeconds === null
                      ? ""
                      : startOffsetSeconds === 0
                        ? "0.0"
                        : `+${startOffsetSeconds.toFixed(1)}`}
                  </span>
                  <span className="min-w-0 truncate text-xs font-semibold" style={{ color: classColor(player.class) }}>
                    {player.name}
                  </span>
                </span>
                <div
                  className={cn(
                    "relative h-7 min-w-0 overflow-hidden rounded-sm border bg-muted/25 transition-opacity duration-75",
                    castState.status === "casting" && !castState.willCancel && "border-emerald-400/50",
                    castState.status === "completed" && "border-emerald-300/70",
                    castState.willCancel && "border-dotted border-red-400/80",
                    castState.status === "idle" && "border-border/35",
                  )}
                  style={{ opacity: castState.opacity }}
                  title={impactTitle}
                >
                  {castState.status !== "idle" && castState.progress > 0 ? (
                    <div
                      className={cn(
                        "absolute bottom-1.5 left-0 top-0 transition-[width] duration-75",
                        castState.status === "cancelled" ? "bg-red-500/45" : "bg-emerald-500/45",
                      )}
                      style={{ width: `${castState.progress * 100}%` }}
                    />
                  ) : null}
                  {composition && castState.status !== "cancelled" ? (
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-1.5 border-t border-black/60 bg-black/45"
                      aria-hidden="true"
                    >
                      <div
                        className="absolute inset-y-0 left-0 bg-emerald-400/75"
                        style={{ width: `${composition.effectivePercent}%` }}
                      />
                      {composition.overhealPercent > 0 ? (
                        <div
                          className="absolute inset-y-0 right-0 border-l border-amber-200/60 bg-[repeating-linear-gradient(120deg,rgba(251,191,36,0.75)_0_2px,rgba(120,83,16,0.18)_2px_5px)]"
                          style={{ width: `${composition.overhealPercent}%` }}
                        />
                      ) : null}
                    </div>
                  ) : null}
                  <div className="absolute inset-x-0 bottom-1.5 top-0 z-10 flex min-w-0 items-center justify-between gap-2 px-2 text-[11px] [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]">
                    <span className={cn("min-w-0 flex-1", castState.status === "idle" && "text-muted-foreground/70")}>
                      {cast ? <CastSpell spellId={cast.spellId} spellName={cast.spellName} /> : "Idle"}
                    </span>
                    {(castState.status === "casting" || castState.status === "completed") && castState.impact ? (
                      <span
                        className="flex shrink-0 items-center gap-1.5 font-mono text-[9px] font-semibold"
                        aria-label={`${formatNumber(castState.impact.effective)} effective healing, ${formatNumber(castState.impact.overheal)} overhealing`}
                      >
                        <span className="text-emerald-200">+{formatNumber(castState.impact.effective)}</span>
                        {castState.impact.overheal > 0 ? (
                          <span className="text-amber-200/90">+{formatNumber(castState.impact.overheal)} OH</span>
                        ) : null}
                      </span>
                    ) : castState.status === "casting" && cast ? (
                      <span className="shrink-0 font-mono text-[9px] text-emerald-100/80">
                        {Math.max(0, (
                          cast.timestampMilli
                          + cast.durationMilli
                          - cursorMilli
                        ) / 1_000).toFixed(1)}s
                      </span>
                    ) : castState.status === "completed" ? (
                      <span className="shrink-0 font-mono text-[9px] font-semibold text-emerald-200">
                        Landed
                      </span>
                    ) : castState.status === "cancelled" ? (
                      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-red-300">
                        Cancelled
                      </span>
                    ) : null}
                  </div>
                </div>
                <div
                  className="flex w-[220px] items-center gap-2 overflow-hidden transition-opacity duration-75"
                  style={{ opacity: castState.opacity }}
                >
                  <span
                    className={cn(
                      "w-[100px] shrink-0 truncate text-xs",
                      castState.status !== "idle" ? "font-medium" : "text-muted-foreground/65",
                    )}
                    style={targetClass ? { color: classColor(targetClass) } : undefined}
                    title={targetName}
                  >
                    {cast ? `▸ ${targetName}` : targetName}
                  </span>
                  {targetHealth ? (
                    <RelativeHealthBar
                      messages={targetHealth.relativeHealthMessages}
                      state={targetHealth.relativeHealthState}
                      bounds={targetHealth.relativeHealthBounds}
                      zeroPercent={68}
                      className="w-[112px] shrink-0 [&>div:first-child]:h-4 [&>div:last-child]:hidden"
                    />
                  ) : null}
                </div>
              </div>
              </Fragment>
            );
          })}
          {offHealers.length === 0 ? (
            <div className="flex min-w-[618px] items-center gap-2 px-2 py-1 text-[8px] uppercase tracking-[0.14em] text-muted-foreground/65">
              <span className="h-px flex-1 bg-border/40" />
              <span>Off-healing</span>
              <span className="h-px flex-1 bg-border/40" />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
