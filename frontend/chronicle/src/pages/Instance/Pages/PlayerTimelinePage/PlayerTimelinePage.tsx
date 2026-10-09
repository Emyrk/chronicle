import { useCallback, useMemo, useState } from "react";
import { ArrowLeftRight, ChevronDown } from "lucide-react";
import { useCooldownSpells } from "@/api/cooldownSpells";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import { formatNumber } from "@/lib/format";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import type { PanelContext, PanelDefinition } from "../../EventsPanels/types";
import { usePanelAggregation } from "../../EventsPanels/usePanelAggregation";
import { RotationTimeline, type RotationTimelinePlayer } from "../../EventsPanels/RotationTimeline/RotationTimeline";
import {
  rotationTimelineProcessor,
  type RotationTimelineEvent,
  type RotationTimelineResult,
} from "../../EventsPanels/RotationTimeline/rotationTimeline.processor";
import { playerCasts } from "../../EventsPanels/RotationTimeline/derive";
import { SLOT_COLORS, SLOT_LABELS } from "../../EventsPanels/RotationTimeline/format";
import { useRotationView } from "../../EventsPanels/RotationTimeline/useRotationView";
import { useSmoothReplayTime } from "../../EventsPanels/RotationTimeline/useSmoothReplayTime";
import { useSpellMeta } from "../../EventsPanels/RotationTimeline/useSpellMeta";
import { AuraSection } from "./AuraSection";

/** Picker value meaning "no second player". */
const NONE = "none";

/** Casts of spells with at least this cooldown go to the cooldown lane. */
const COOLDOWN_LANE_MIN_MS = 30_000;

const ROTATION_TIMELINE_PANEL: PanelDefinition<RotationTimelineResult, RotationTimelineEvent> = {
  ...rotationTimelineProcessor,
  label: "Player Timeline",
  icon: null,
  syncDataMode: "full",
  render: () => null,
};

interface PlayerTimelinePageProps {
  context: PanelContext;
}

export function PlayerTimelinePage({ context }: PlayerTimelinePageProps) {
  const { selectedEncounterIds } = context;

  if (selectedEncounterIds.length !== 1) {
    return <EncounterPicker context={context} />;
  }
  return <PlayerTimelineContent key={selectedEncounterIds[0]} context={context} />;
}

function EncounterPicker({ context }: PlayerTimelinePageProps) {
  const encounters = context.instance.encounters.filter((e) => e.boss);
  const list = encounters.length > 0 ? encounters : context.instance.encounters;
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="text-lg font-semibold">Pick one encounter</p>
      <p className="mt-1 text-sm text-muted-foreground">
        The player timeline compares two players within a single pull.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {list.map((enc) => (
          <Button key={enc.id} variant="outline" size="sm" onClick={() => context.onSelectEncounters?.([enc.id])}>
            {enc.name}
          </Button>
        ))}
      </div>
    </div>
  );
}

function PlayerTimelineContent({ context }: PlayerTimelinePageProps) {
  const { instance } = context;
  // Explicit picks; null slots fall back to the defaults below, NONE leaves B empty.
  const [overrides, setOverrides] = useState<[string | null, string | null]>([null, null]);
  const [damageByPlayer, setDamageByPlayer] = useState<ReadonlyMap<string, number>>(new Map());

  // Default A/B: the top damage dealer and the next player of the same class.
  const ranked = useMemo(
    () =>
      Array.from(damageByPlayer.entries())
        .filter(([guid]) => instance.players?.[guid])
        .sort((a, b) => b[1] - a[1]),
    [damageByPlayer, instance.players],
  );
  const picked = useMemo((): [string | null, string | null] => {
    const top = ranked[0]?.[0] ?? null;
    const cls = top ? instance.players?.[top]?.class : undefined;
    const next = ranked.find(([guid]) => guid !== top && instance.players?.[guid]?.class === cls)?.[0] ?? null;
    return [overrides[0] ?? top, overrides[1] === NONE ? null : (overrides[1] ?? next)];
  }, [ranked, overrides, instance.players]);
  const setPicked = setOverrides;

  const focusKey = picked.filter((g): g is string => g != null).join(",");
  const panelContextData = useMemo(() => ({ focus: focusKey ? focusKey.split(",") : [] }), [focusKey]);

  const aggregation = usePanelAggregation<RotationTimelineResult>({
    panel: ROTATION_TIMELINE_PANEL,
    context,
    panelContext: panelContextData,
    panelContextKey: focusKey,
  });
  const result = aggregation.result;

  // Damage totals do not depend on the focus; keep the first non-empty set so
  // the defaults above are stable while a new focus is processed.
  if (damageByPlayer.size === 0 && result.damageByPlayer.size > 0) {
    setDamageByPlayer(result.damageByPlayer);
  }

  const encounter = instance.encounters.find((e) => e.id === context.selectedEncounterIds[0]);
  const encounterMs = encounter ? new Date(encounter.end_time).getTime() - new Date(encounter.start_time).getTime() : 0;
  const durationMs = Math.max(result.lastOffsetMs, encounterMs, 1000);
  const sync = useSyncModeContextOptional();
  const replayMs =
    sync?.enabled && sync.currentTimestamp && result.firstTimestampMs != null
      ? Math.min(durationMs, Math.max(0, sync.currentTimestamp.getTime() - result.firstTimestampMs))
      : null;
  const smoothReplayMs = useSmoothReplayTime(replayMs, Boolean(sync?.isPlaying), sync?.playbackSpeed ?? 1);
  const view = useRotationView(durationMs, smoothReplayMs == null ? null : Math.min(durationMs, smoothReplayMs));

  const players: RotationTimelinePlayer[] = useMemo(
    () =>
      picked.flatMap((guid) => {
        const data = guid ? result.players.get(guid) : undefined;
        const info = guid ? instance.players?.[guid] : undefined;
        if (!guid || !data || !info) return [];
        return [{ guid, name: info.name, className: info.class, data }];
      }),
    [picked, result.players, instance.players],
  );

  const spellIds = useMemo(() => {
    const ids: number[] = [];
    for (const p of players) {
      for (const c of playerCasts(p.data)) ids.push(c.spellId);
      for (const a of p.data.aurasOn) if (a.spellId) ids.push(a.spellId);
      for (const a of p.data.debuffsCast) if (a.spellId) ids.push(a.spellId);
    }
    return ids;
  }, [players]);
  const { meta, gcd } = useSpellMeta(spellIds);

  const cooldowns = useCooldownSpells();
  const cooldownIds = useMemo(() => {
    const ids = new Set<number>();
    for (const spells of Object.values(cooldowns.data?.byClass ?? {})) {
      for (const spell of spells) {
        if (!spell.ignored && spell.cooldown_ms >= COOLDOWN_LANE_MIN_MS) ids.add(spell.id);
      }
    }
    return ids;
  }, [cooldowns.data]);
  const isCooldown = useCallback((id: number) => cooldownIds.has(id), [cooldownIds]);

  const unitName = useCallback(
    (guid: string) => instance.players?.[guid]?.name ?? instance.units?.[guid]?.name ?? guid,
    [instance.players, instance.units],
  );

  const pickers = (
    <div className="flex items-center gap-1.5">
      <PlayerPicker slot={0} value={picked[0]} ranked={ranked} context={context} onChange={(g) => setPicked([g, picked[1]])} />
      <Button variant="ghost" size="sm" onClick={() => setPicked([picked[1], picked[0]])} className="text-[11px] text-muted-foreground">
        vs <ArrowLeftRight className="size-3" />
      </Button>
      <PlayerPicker
        slot={1}
        value={picked[1]}
        ranked={ranked}
        context={context}
        allowNone
        onChange={(g) => setPicked([picked[0], g ?? NONE])}
      />
    </div>
  );

  if (aggregation.error) {
    return <div className="rounded-lg border border-destructive p-4 text-sm">Failed to load events: {aggregation.error.message}</div>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <RotationTimeline
        players={players}
        view={view}
        spellMeta={meta}
        gcd={gcd}
        isCooldown={isCooldown}
        unitName={unitName}
        headerStart={pickers}
      >
        {players.length > 0 && <AuraSection players={players} view={view} spellMeta={meta} unitName={unitName} />}
      </RotationTimeline>
      {(aggregation.loading || aggregation.processing) && players.length === 0 && (
        <div className="p-6 text-center text-sm text-muted-foreground">Loading events…</div>
      )}
    </div>
  );
}

interface PlayerPickerProps {
  slot: number;
  value: string | null;
  ranked: [string, number][];
  context: PanelContext;
  /** Offer a "None" entry, which calls onChange(null). */
  allowNone?: boolean;
  onChange: (guid: string | null) => void;
}

function PlayerPicker({ slot, value, ranked, context, allowNone, onChange }: PlayerPickerProps) {
  const players = context.instance.players ?? {};
  const current = value ? players[value] : undefined;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span
            className="flex size-4 items-center justify-center rounded-[3px] text-[10px] font-bold text-background"
            style={{ background: SLOT_COLORS[slot] }}
          >
            {SLOT_LABELS[slot]}
          </span>
          <span className="font-semibold" style={{ color: current ? `var(--color-class-${current.class.toLowerCase()})` : undefined }}>
            {current?.name ?? (allowNone ? "None" : "Pick player")}
          </span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="styled-scrollbar max-h-96 overflow-y-auto">
        {allowNone && (
          <DropdownMenuItem onSelect={() => onChange(null)} className="text-muted-foreground">
            None
          </DropdownMenuItem>
        )}
        {ranked.map(([guid, damage]) => {
          const p = players[guid];
          if (!p) return null;
          return (
            <DropdownMenuItem key={guid} onSelect={() => onChange(guid)} className="flex justify-between gap-6">
              <span style={{ color: `var(--color-class-${p.class.toLowerCase()})` }}>{p.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{formatNumber(damage)}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
