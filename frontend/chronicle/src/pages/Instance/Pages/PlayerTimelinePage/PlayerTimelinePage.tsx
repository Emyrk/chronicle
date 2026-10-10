import { useCallback, useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useCooldownSpells } from "@/api/cooldownSpells";
import { Button } from "@/components/ui/button";
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
import { useRotationView } from "../../EventsPanels/RotationTimeline/useRotationView";
import { useSmoothReplayTime } from "../../EventsPanels/RotationTimeline/useSmoothReplayTime";
import { useSpellMeta } from "../../EventsPanels/RotationTimeline/useSpellMeta";
import { AuraSection } from "./AuraSection";
import { PlayerPicker } from "./PlayerPicker";

/** Picker value meaning "no second player". */
const NONE = "none";

/** Casts of spells with at least this cooldown are drawn as cooldowns (squares on the rail). */
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
  const cooldownById = useMemo(() => {
    const byId = new Map<number, { durationMs: number }>();
    for (const spells of Object.values(cooldowns.data?.byClass ?? {})) {
      for (const spell of spells) {
        if (spell.ignored || spell.cooldown_ms < COOLDOWN_LANE_MIN_MS) continue;
        byId.set(spell.id, { durationMs: spell.duration_hidden ? 0 : spell.duration_ms });
      }
    }
    return byId;
  }, [cooldowns.data]);
  const cooldownInfo = useCallback((id: number) => cooldownById.get(id) ?? null, [cooldownById]);

  const unitName = useCallback(
    (guid: string) => instance.players?.[guid]?.name ?? instance.units?.[guid]?.name ?? guid,
    [instance.players, instance.units],
  );

  const instancePlayers = instance.players ?? {};
  const pickers = (
    <div className="flex items-center gap-2.5">
      <PlayerPicker slot={0} value={picked[0]} ranked={ranked} players={instancePlayers} onChange={(g) => setPicked([g, picked[1]])} />
      <span className="text-xs text-muted-foreground">vs</span>
      <PlayerPicker
        slot={1}
        value={picked[1]}
        ranked={ranked}
        players={instancePlayers}
        allowNone
        onChange={(g) => setPicked([picked[0], g ?? NONE])}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setPicked([picked[1], picked[0]])}
        aria-label="Swap players"
        title="Swap players"
        className="text-muted-foreground"
      >
        <ArrowLeftRight className="size-3.5" />
      </Button>
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
        cooldownInfo={cooldownInfo}
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
