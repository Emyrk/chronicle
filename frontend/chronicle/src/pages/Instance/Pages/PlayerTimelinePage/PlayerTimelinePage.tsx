import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeftRight, FlaskConical } from "lucide-react";
import { useCooldownSpells } from "@/api/cooldownSpells";
import { useMyFavorites } from "@/api/queries";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import type { PanelContext, PanelDefinition } from "../../EventsPanels/types";
import { usePanelAggregation } from "../../EventsPanels/usePanelAggregation";
import {
  RotationTimeline,
  SegButton,
  Segmented,
  type RotationTimelinePlayer,
} from "../../EventsPanels/RotationTimeline/RotationTimeline";
import {
  rotationTimelineProcessor,
  type RotationTimelineEvent,
  type RotationTimelineResult,
} from "../../EventsPanels/RotationTimeline/rotationTimeline.processor";
import {
  playerCasts,
  withAuraProcCasts,
  withConsumeCasts,
  withCooldownBuffEnds,
  withOverrideBuffCasts,
  withoutHiddenCasts,
  type TimelineMetric,
} from "../../EventsPanels/RotationTimeline/derive";
import {
  normalizeSpellName,
  useRotationView,
  type RotationViewInitial,
} from "../../EventsPanels/RotationTimeline/useRotationView";
import { useSmoothReplayTime } from "../../EventsPanels/RotationTimeline/useSmoothReplayTime";
import { useSpellMeta } from "../../EventsPanels/RotationTimeline/useSpellMeta";
import { activeOverrides, findOverride } from "../../EventsPanels/RotationTimeline/spellOverrides";
import { activeAuraProcs } from "../../EventsPanels/RotationTimeline/auraProcs";
import { AuraSection } from "./AuraSection";
import { PanelTray } from "./PanelTray";
import { defaultPlayers } from "./defaultPlayers";
import { PlayerPicker } from "./PlayerPicker";
import { raisedAuraOverrides, useRaisedAuras } from "./useRaisedAuras";
import { PlayerTimelineRules, type CuratedCooldown } from "./PlayerTimelineRules";
import { parsePlayerTimelineState, type PlayerTimelineState } from "./playerTimelineState";

/** Shortcuts the page adds on top of the timeline's own. */
const PAGE_KEYBINDS = [{ keys: "Shift + click", action: "Flip to the rules & assumptions view" }];

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
  /** Total duration of the selected encounters, for the panel tray. */
  durationMs: number;
  /** Saved view state (from a share link); validated here. */
  initialState?: unknown;
  /** Receives the current view state so share links can include it. */
  onStateChange?: (state: PlayerTimelineState) => void;
}

export function PlayerTimelinePage({ context, durationMs, initialState, onStateChange }: PlayerTimelinePageProps) {
  const { selectedEncounterIds } = context;
  const saved = useMemo(() => parsePlayerTimelineState(initialState), [initialState]);
  // Player picks live here, above the per-encounter content, so they survive
  // switching encounters. null slots use the encounter's defaults, NONE leaves B empty.
  const [overrides, setOverrides] = useState<[string | null, string | null]>(() =>
    saved?.players[0] ? [saved.players[0], saved.players[1] ?? NONE] : [null, null],
  );
  // Like the picks, the damage/healing view carries across encounters.
  const [metric, setMetric] = useState<TimelineMetric>(saved?.metric ?? "damage");

  return (
    <div className="flex flex-col gap-3">
      <FeedbackBanner />
      <PanelTray context={context} durationMs={durationMs} />
      {selectedEncounterIds.length !== 1 ? (
        <EncounterPicker context={context} />
      ) : (
        <PlayerTimelineContent
          key={selectedEncounterIds[0]}
          context={context}
          saved={saved}
          onStateChange={onStateChange}
          overrides={overrides}
          setOverrides={setOverrides}
          metric={metric}
          setMetric={setMetric}
        />
      )}
    </div>
  );
}

const DISCORD_URL = "https://discord.gg/gz97ABFVAj";

/** Beta notice, styled like the Overview one: asks every class for feedback. */
function FeedbackBanner() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-4 py-2.5 text-amber-100">
      <FlaskConical className="size-4 shrink-0 text-amber-400" aria-hidden />
      <div className="min-w-0 text-xs">
        <span className="font-semibold text-amber-300">Player Timeline Beta</span>
        <span className="ml-2 text-muted-foreground">
          This page is in active development. Feedback from every class is welcome: missing or extra casts, procs,
          cooldowns, buffs, GCDs and idle time. Share it on{" "}
          <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="font-medium text-foreground underline underline-offset-2">
            Discord
          </a>
          .
        </span>
      </div>
    </div>
  );
}

function EncounterPicker({ context }: { context: PanelContext }) {
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

interface PlayerTimelineContentProps {
  context: PanelContext;
  saved: PlayerTimelineState | null;
  onStateChange?: (state: PlayerTimelineState) => void;
  overrides: [string | null, string | null];
  setOverrides: (overrides: [string | null, string | null]) => void;
  metric: TimelineMetric;
  setMetric: (metric: TimelineMetric) => void;
}

function PlayerTimelineContent({
  context,
  saved,
  onStateChange,
  overrides,
  setOverrides,
  metric,
  setMetric,
}: PlayerTimelineContentProps) {
  const { instance } = context;
  // Healing totals remove overheal only when the log records it.
  const hasServerOverheal = instance.capabilities?.includes("overheal") ?? false;
  const encounterId = context.selectedEncounterIds[0];
  // Window, pin and debuff target only make sense on the encounter they were saved on.
  const sameEncounter = saved?.encounterId === encounterId;
  const [debuffTarget, setDebuffTarget] = useState<string | null>(sameEncounter ? (saved?.debuffTarget ?? null) : null);
  const [damageByPlayer, setDamageByPlayer] = useState<ReadonlyMap<string, number>>(new Map());
  const [healingByPlayer, setHealingByPlayer] = useState<ReadonlyMap<string, number>>(new Map());

  // Default A/B: the top damage dealer and the next player of the same class.
  const ranked = useMemo(
    () =>
      Array.from((metric === "healing" ? healingByPlayer : damageByPlayer).entries())
        .filter(([guid]) => instance.players?.[guid])
        .sort((a, b) => b[1] - a[1]),
    [damageByPlayer, healingByPlayer, metric, instance.players],
  );
  // Favorited characters (name + realm) seed the defaults when nothing was picked.
  const { isAuthenticated } = useAuth();
  const { data: favorites } = useMyFavorites({ enabled: isAuthenticated });
  const isFavorite = useMemo(() => {
    const realm = instance.realm?.toLowerCase();
    const keys = new Set(
      (favorites?.players ?? []).map((f) => `${f.name.toLowerCase()}|${realm ? f.realm_name.toLowerCase() : ""}`),
    );
    return (guid: string) => {
      const name = instance.players?.[guid]?.name;
      return name != null && keys.has(`${name.toLowerCase()}|${realm ?? ""}`);
    };
  }, [favorites, instance.players, instance.realm]);

  const picked = useMemo((): [string | null, string | null] => {
    const [top, next] = defaultPlayers(ranked, (guid) => instance.players?.[guid]?.class, isFavorite);
    // A pick who was not in this encounter falls back to the default here, but
    // stays picked for encounters they were in.
    const present = (guid: string | null) =>
      guid != null && (ranked.length === 0 || ranked.some(([id]) => id === guid)) ? guid : null;
    return [present(overrides[0]) ?? top, overrides[1] === NONE ? null : (present(overrides[1]) ?? next)];
  }, [ranked, overrides, instance.players, isFavorite]);
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
  if (healingByPlayer.size === 0 && result.healingByPlayer.size > 0) {
    setHealingByPlayer(result.healingByPlayer);
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
  const [viewInitial] = useState<RotationViewInitial>(() =>
    saved
      ? {
          align: saved.align,
          follow: saved.follow,
          window: sameEncounter ? saved.window : null,
          pinnedMs: sameEncounter ? saved.pinnedMs : null,
        }
      : {},
  );
  const controlledMetric = useMemo(() => ({ metric, setMetric }), [metric, setMetric]);
  const view = useRotationView(
    durationMs,
    smoothReplayMs == null ? null : Math.min(durationMs, smoothReplayMs),
    viewInitial,
    controlledMetric,
  );

  // Report the view so share links capture it. Replay moves the window on its
  // own, so the saved window is only taken outside replay.
  const replaying = view.nowMs != null;
  const wholeFight = view.startMs <= 0 && view.endMs >= durationMs;
  useEffect(() => {
    onStateChange?.({
      encounterId,
      players: [picked[0], picked[1]],
      align: view.align,
      metric,
      window: replaying || wholeFight ? null : { startMs: view.startMs, endMs: view.endMs },
      pinnedMs: view.pinnedMs,
      follow: view.follow,
      debuffTarget,
    });
  }, [onStateChange, encounterId, picked, view.align, metric, replaying, wholeFight, view.startMs, view.endMs, view.pinnedMs, view.follow, debuffTarget]);

  // Manual spell mutations for this log's flavor (spellOverrides.ts), plus the
  // buffs the viewer raised from Buffs & debuffs.
  const { raised, isRaised, toggleRaised } = useRaisedAuras();
  const spellOverrides = useMemo(() => {
    const idsByName = new Map<string, number[]>();
    for (const guid of picked) {
      for (const seg of (guid && result.players.get(guid)?.aurasOn) || []) {
        if (seg.spellId == null) continue;
        const ids = idsByName.get(normalizeSpellName(seg.spellName)) ?? [];
        if (!ids.includes(seg.spellId)) ids.push(seg.spellId);
        idsByName.set(normalizeSpellName(seg.spellName), ids);
      }
    }
    return [...activeOverrides(instance.flavor ?? []), ...raisedAuraOverrides(raised, idsByName)];
  }, [instance.flavor, raised, picked, result.players]);
  // Auras that count as procs for this log's format (auraProcs.ts).
  const auraProcs = useMemo(() => activeAuraProcs(instance.format), [instance.format]);

  // Player data before cooldown buffs are matched (spell metadata loads from these).
  const basePlayers: RotationTimelinePlayer[] = useMemo(
    () =>
      picked.flatMap((guid) => {
        const data = guid ? result.players.get(guid) : undefined;
        const info = guid ? instance.players?.[guid] : undefined;
        if (!guid || !data || !info) return [];
        const shown = withoutHiddenCasts(withAuraProcCasts(withConsumeCasts(data), auraProcs), spellOverrides);
        return [{ guid, name: info.name, className: info.class, data: withOverrideBuffCasts(shown, spellOverrides, durationMs) }];
      }),
    [picked, result.players, instance.players, spellOverrides, auraProcs, durationMs],
  );

  const spellIds = useMemo(() => {
    const ids: number[] = [];
    for (const p of basePlayers) {
      for (const c of playerCasts(p.data)) ids.push(c.spellId);
      for (const a of p.data.aurasOn) if (a.spellId) ids.push(a.spellId);
      for (const a of p.data.debuffsCast) if (a.spellId) ids.push(a.spellId);
    }
    return ids;
  }, [basePlayers]);
  const { meta, gcd } = useSpellMeta(spellIds);

  const cooldowns = useCooldownSpells();
  const cooldownById = useMemo(() => {
    const byId = new Map<number, { durationMs: number; durationHidden: boolean }>();
    for (const spells of Object.values(cooldowns.data?.byClass ?? {})) {
      for (const spell of spells) {
        if (spell.ignored || spell.cooldown_ms < COOLDOWN_LANE_MIN_MS) continue;
        byId.set(spell.id, { durationMs: spell.duration_hidden ? 0 : spell.duration_ms, durationHidden: spell.duration_hidden });
      }
    }
    return byId;
  }, [cooldowns.data]);
  const cooldownInfo = useCallback(
    (id: number) => {
      // A "show as cooldown" override wins over the curated list.
      const override = findOverride(spellOverrides, id, meta(id).spell?.name?.["0"] ?? null);
      if (override?.showAsCooldown) {
        const spellDuration = meta(id).spell?.duration?.Duration ?? 0;
        return {
          durationMs: override.showAsCooldown.durationMs ?? Math.max(0, spellDuration),
          color: override.color,
          proc: override.proc,
        };
      }
      const curated = cooldownById.get(id);
      return curated ? { durationMs: curated.durationMs } : null;
    },
    [cooldownById, spellOverrides, meta],
  );

  // Cooldowns tint for as long as their buff really lasted (talents, early
  // fades); the duration above is the fallback. Durations hidden on purpose (by
  // an admin, or an override's durationMs: 0) stay untinted.
  const players: RotationTimelinePlayer[] = useMemo(() => {
    const tintsFromAura = (id: number) => {
      const override = findOverride(spellOverrides, id, meta(id).spell?.name?.["0"] ?? null);
      if (override?.showAsCooldown) return override.showAsCooldown.durationMs !== 0;
      const curated = cooldownById.get(id);
      return curated != null && !curated.durationHidden;
    };
    return basePlayers.map((p) => ({ ...p, data: withCooldownBuffEnds(p.data, tintsFromAura, durationMs) }));
  }, [basePlayers, spellOverrides, cooldownById, meta, durationMs]);
  // Every curated entry, before the lane threshold, for the rules view.
  const curatedById = useMemo(() => {
    const byId = new Map<number, CuratedCooldown>();
    for (const spells of Object.values(cooldowns.data?.byClass ?? {})) {
      for (const spell of spells) {
        byId.set(spell.id, { cooldownMs: spell.cooldown_ms, durationMs: spell.duration_ms, ignored: spell.ignored });
      }
    }
    return byId;
  }, [cooldowns.data]);
  const curatedCooldown = useCallback((id: number) => curatedById.get(id) ?? null, [curatedById]);

  // Shift+click flips the page to its rules, like panels flip to their settings.
  const [flipped, setFlipped] = useState(false);

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
      <Segmented label="" title="Damage or healing view">
        <SegButton active={metric === "damage"} onClick={() => setMetric("damage")} title="Damage: DPS, damage lead and damage per cast">
          DPS
        </SegButton>
        <SegButton active={metric === "healing"} onClick={() => setMetric("healing")} title="Healing: HPS, healing lead and healing per cast">
          HPS
        </SegButton>
      </Segmented>
      {metric === "healing" && !hasServerOverheal && (
        <span className="text-[10px] text-muted-foreground" title="This log does not record overheal, so healing totals include it">
          incl. overheal
        </span>
      )}
    </div>
  );

  if (aggregation.error) {
    return <div className="rounded-lg border border-destructive p-4 text-sm">Failed to load events: {aggregation.error.message}</div>;
  }

  const timeline = (
    <div className="overflow-hidden rounded-lg border border-border">
      <RotationTimeline
        players={players}
        view={view}
        spellMeta={meta}
        gcd={gcd}
        cooldownInfo={cooldownInfo}
        unitName={unitName}
        headerStart={pickers}
        extraKeybinds={PAGE_KEYBINDS}
        swingHandKnown={instance.format === "1.12a-cc-addon"}
      >
        {players.length > 0 && (
          <AuraSection
            players={players}
            view={view}
            spellMeta={meta}
            unitName={unitName}
            pickedTarget={debuffTarget}
            onPickTarget={setDebuffTarget}
            isRaised={isRaised}
            onToggleRaised={toggleRaised}
          />
        )}
      </RotationTimeline>
      {(aggregation.loading || aggregation.processing) && players.length === 0 && (
        <div className="p-6 text-center text-sm text-muted-foreground">Loading events…</div>
      )}
    </div>
  );

  return (
    <FlipCard
      flipped={flipped}
      onFlip={() => setFlipped((f) => !f)}
      front={timeline}
      back={
        <div className="overflow-hidden rounded-lg border border-border">
          <PlayerTimelineRules
            players={players}
            spellMeta={meta}
            gcd={gcd}
            cooldownInfo={cooldownInfo}
            curatedCooldown={curatedCooldown}
            overrides={spellOverrides}
            auraProcs={auraProcs}
            isIgnored={view.isIgnored}
            cooldownMinMs={COOLDOWN_LANE_MIN_MS}
            onFlipBack={() => setFlipped(false)}
          />
        </div>
      }
    />
  );
}

/**
 * A two-sided card that turns over on Shift+click, like panels. Both faces
 * share one grid cell, so the card is as tall as the taller face.
 */
function FlipCard({ flipped, onFlip, front, back }: { flipped: boolean; onFlip: () => void; front: ReactNode; back: ReactNode }) {
  return (
    <div
      className="[perspective:2400px]"
      onMouseDown={(e) => {
        if (!e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onFlip();
      }}
    >
      <div
        className={cn(
          "grid transition-transform duration-500 [transform-style:preserve-3d]",
          flipped && "[transform:rotateY(180deg)]",
        )}
      >
        <div className={cn("[grid-area:1/1] [backface-visibility:hidden]", flipped && "pointer-events-none")}>{front}</div>
        <div
          className={cn("[grid-area:1/1] [backface-visibility:hidden] [transform:rotateY(180deg)]", !flipped && "pointer-events-none")}
        >
          {flipped && back}
        </div>
      </div>
    </div>
  );
}
