import { useMemo } from "react";
import { useSpell } from "@/api/queries";
import { SpellIconWithTooltip } from "@/components/ui/SpellIconWithTooltip";
import { useDatasetId } from "@/hooks/useDatasetId";
import { cn } from "@/lib/utils";
import { useSyncModeContextOptional } from "../../../SyncModeContext";
import type { StripRenderProps } from "../types";
import {
  buildPlayerActions,
  selectPlayerActionWindow,
  type PlayerAction,
} from "./playerActionCursor";
import type {
  PlayerActionEffect,
  PlayerActionTimelineResult,
} from "./playerActionTimeline.processor";

const HISTORY_MILLI = 8_000;
const FUTURE_MILLI = 8_000;
const WINDOW_MILLI = HISTORY_MILLI + FUTURE_MILLI;

function formatRelativeMilli(value: number): string {
  const seconds = Math.max(0, value) / 1000;
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

function PlayerActionIcon({ action }: { action: PlayerAction }) {
  const datasetId = useDatasetId();
  const { data: spell } = useSpell(String(action.spellId), datasetId, { enabled: action.spellId > 0 });

  if (!spell) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-white/10 bg-white/[0.04] text-xs font-semibold text-muted-foreground">
        {action.spellName.charAt(0)}
      </div>
    );
  }

  return <SpellIconWithTooltip spell={spell} size={32} />;
}

function ActionSummary({ action, cursorMilli, active, inFlight }: {
  action: PlayerAction;
  cursorMilli: number;
  active: boolean;
  inFlight: boolean;
}) {
  const timing = active
    ? `${action.channeling ? "channel ends" : "casts"} in ${formatRelativeMilli(action.launchMilli - cursorMilli)}`
    : inFlight && action.impactMilli !== null
      ? `lands in ${formatRelativeMilli(action.impactMilli - cursorMilli)}`
      : action.startMilli > cursorMilli
        ? `next in ${formatRelativeMilli(action.startMilli - cursorMilli)}`
        : action.outcome === "failed"
          ? "cast failed"
          : action.impactMilli !== null
            ? `landed ${formatRelativeMilli(cursorMilli - action.impactMilli)} ago`
            : "last recorded action";

  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded border border-amber-300/20 bg-amber-200/[0.035] px-3 py-2">
      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-200/80">
        {active ? (action.channeling ? "Channel" : "Casting") : inFlight ? "In flight" : "Action"}
      </span>
      <div className="h-7 border-l border-white/10" />
      <PlayerActionIcon action={action} />
      <div className="min-w-0">
        <div className={cn(
          "truncate text-sm font-semibold text-zinc-100",
          action.outcome === "failed" && "text-red-300",
        )}>
          {action.spellName}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">{timing}</div>
      </div>
      {active && action.durationMilli > 0 ? (
        <div className="ml-auto hidden w-28 shrink-0 overflow-hidden rounded-full bg-white/[0.07] sm:block">
          <div
            className="h-1.5 rounded-full bg-amber-300/80 transition-[width]"
            style={{ width: `${Math.min(100, Math.max(0, (cursorMilli - action.startMilli) / action.durationMilli * 100))}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function PeriodicTickMarker({
  effect,
  left,
  targetName,
}: {
  effect: PlayerActionEffect;
  left: number;
  targetName: string;
}) {
  return (
    <span
      className={cn(
        "absolute bottom-1 h-1.5 w-1.5 -translate-x-1/2 rounded-full border shadow-[0_0_5px_currentColor]",
        effect.effectType === "heal"
          ? "border-emerald-100/80 bg-emerald-400 text-emerald-300"
          : "border-violet-100/80 bg-violet-400 text-violet-300",
      )}
      style={{ left: `${left}%` }}
      title={`${effect.spellName} ${effect.effectType === "heal" ? "tick" : "DoT tick"} on ${targetName}: ${effect.amount.toLocaleString()}`}
    />
  );
}

export function PlayerActionTimeline({ result, context, durationMs }: StripRenderProps<PlayerActionTimelineResult>) {
  const sync = useSyncModeContextOptional();
  const selectedPlayerIds = [...context.entitySelection.playerIds];
  const actions = useMemo(() => buildPlayerActions(result.events, result.effects), [result.effects, result.events]);
  const cursorMilli = sync?.enabled && sync.currentTimestamp && sync.encounterBounds
    ? Math.max(0, sync.currentTimestamp.getTime() - sync.encounterBounds.start.getTime())
    : durationMs;
  const actionWindow = useMemo(
    () => selectPlayerActionWindow(actions, cursorMilli, HISTORY_MILLI, FUTURE_MILLI),
    [actions, cursorMilli],
  );

  if (context.selectedEncounterIds.length !== 1) {
    return <TimelineMessage>Select one encounter to view the Player Action Timeline.</TimelineMessage>;
  }
  if (selectedPlayerIds.length !== 1) {
    return <TimelineMessage>Select one player to view the Player Action Timeline.</TimelineMessage>;
  }

  const player = context.instance.players?.[selectedPlayerIds[0]];
  if (!player) return <TimelineMessage>The selected player could not be found.</TimelineMessage>;
  if (actions.length === 0) return <TimelineMessage>No recorded actions for {player.name}.</TimelineMessage>;

  const classColor = `var(--color-class-${player.class.toLowerCase()})`;

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(125px,180px)_minmax(0,1fr)_minmax(210px,300px)] items-center gap-3 px-4 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_8px_currentColor]" style={{ color: classColor, backgroundColor: classColor }} />
          <span className="truncate text-sm font-semibold" style={{ color: classColor }}>{player.name}</span>
        </div>
        <div className="mt-0.5 truncate text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {player.class} · Player Action Timeline
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
          <span>−8s</span>
          <span>replay cursor</span>
          <span>+8s</span>
        </div>
        <div className="relative h-11 overflow-hidden rounded border border-white/[0.08] bg-[#101114]">
          <div className="absolute inset-y-0 left-1/2 z-20 w-px bg-amber-200/90 shadow-[0_0_8px_rgba(253,230,138,.65)]" />
          <div className="absolute inset-x-0 top-[45%] border-t border-white/[0.05]" />
          {actionWindow.visibleActions.map((action) => {
            const left = (action.startMilli - (cursorMilli - HISTORY_MILLI)) / WINDOW_MILLI * 100;
            const width = action.durationMilli / WINDOW_MILLI * 100;
            const launchLeft = (action.launchMilli - (cursorMilli - HISTORY_MILLI)) / WINDOW_MILLI * 100;
            const impactLeft = action.impactMilli === null
              ? null
              : (action.impactMilli - (cursorMilli - HISTORY_MILLI)) / WINDOW_MILLI * 100;
            const active = action.id === actionWindow.activeAction?.id;
            return (
              <div key={action.id}>
                <div
                  className={cn(
                    "absolute top-[45%] h-4 min-w-[4px] -translate-y-1/2 rounded-sm border",
                    action.outcome === "failed"
                      ? "border-red-300/60 bg-red-400/45"
                      : active
                        ? "border-amber-100 bg-amber-300/75 shadow-[0_0_12px_rgba(253,230,138,.45)]"
                        : action.startMilli > cursorMilli
                          ? "border-amber-200/25 bg-amber-200/30"
                          : "border-white/10 bg-zinc-500/35",
                  )}
                  style={{ left: `${left}%`, width: `${Math.max(0.7, width)}%` }}
                  title={`${action.spellName}${action.outcome === "failed" ? " (failed)" : ""}`}
                />
                {action.outcome === "completed" ? (
                  <span
                    className="absolute top-[45%] z-10 h-5 w-px -translate-y-1/2 bg-sky-200/90 shadow-[0_0_6px_rgba(186,230,253,.6)]"
                    style={{ left: `${launchLeft}%` }}
                    title={`${action.spellName} SPELL_GO`}
                  />
                ) : null}
                {action.outcome === "completed" && impactLeft !== null && impactLeft > launchLeft ? (
                  <>
                    <span
                      className="absolute top-[45%] h-px bg-sky-300/45"
                      style={{ left: `${launchLeft}%`, width: `${impactLeft - launchLeft}%` }}
                    />
                    <span
                      className="absolute top-[45%] z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-sky-100/80 bg-sky-400 shadow-[0_0_7px_rgba(56,189,248,.65)]"
                      style={{ left: `${impactLeft}%` }}
                      title={`${action.spellName} landed`}
                    />
                  </>
                ) : null}
              </div>
            );
          })}
          {result.effects.filter((effect) => (
            effect.periodic
            && effect.offsetMilli >= cursorMilli - HISTORY_MILLI
            && effect.offsetMilli <= cursorMilli + FUTURE_MILLI
          )).map((effect) => (
            <PeriodicTickMarker
              key={`${effect.effectType}:${effect.eventIndex}`}
              effect={effect}
              left={(effect.offsetMilli - (cursorMilli - HISTORY_MILLI)) / WINDOW_MILLI * 100}
              targetName={context.instance.players?.[effect.target]?.name ?? context.instance.units?.[effect.target]?.name ?? effect.target}
            />
          ))}
        </div>
      </div>

      {actionWindow.focusAction ? (
        <ActionSummary
          action={actionWindow.focusAction}
          cursorMilli={cursorMilli}
          active={actionWindow.focusAction.id === actionWindow.activeAction?.id}
          inFlight={actionWindow.focusAction.id === actionWindow.inFlightAction?.id}
        />
      ) : (
        <div className="text-xs text-muted-foreground">No nearby recorded action.</div>
      )}
    </div>
  );
}

function TimelineMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center px-4 text-xs text-muted-foreground">{children}</div>;
}
