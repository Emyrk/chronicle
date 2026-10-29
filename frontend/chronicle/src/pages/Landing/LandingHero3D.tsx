import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { InstanceEventsProvider, useInstanceEventsContext, type CachedStream, type StreamType } from "@/hooks/instanceEvents";
import type { Instance } from "@/pages/Instance/InstancePage";
import { deathsProcessor, type DeathEvent, type DeathsResult } from "@/pages/Instance/EventsPanels/Deaths/deaths.processor";
import { processIncrementally } from "@/pages/Instance/EventsPanels/mainThreadProcessor";
import { damageDoneProcessor, type DamageDoneResult } from "@/pages/Instance/EventsPanels/DamageDone/damageDone.processor";
import { unifiedHealingProcessor, type UnifiedHealingResult } from "@/pages/Instance/EventsPanels/processors/healing.processor";
import type { PanelRenderProps } from "@/pages/Instance/EventsPanels/types";
import { dungeonMeshLiquid, dungeonMeshUrl } from "@/pages/Instance/EventsPanels/Map/dungeonMeshes";
import { mapProcessor, type MapResult } from "@/pages/Instance/EventsPanels/Map/map.processor";
import { FULL_MAP_VIEWPORT, type MapViewport } from "@/pages/Instance/EventsPanels/Map/mapModel";
import type { DungeonMeshRequest, DungeonMeshState, MapSceneFocus } from "@/pages/Instance/EventsPanels/Map/MapScene3D";
import { MapView2D } from "@/pages/Instance/EventsPanels/Map/MapView2D";
import MapView3D from "@/pages/Instance/EventsPanels/Map/MapView3D";
import { previewSpeed, useMapScene } from "@/pages/Instance/EventsPanels/Map/useMapScene";
import { liveHeroRun } from "./explore3D";
import { serializableContext, type HeroDeathBeat, type HeroDeathRecap, type HeroReplay, type HeroWindow } from "./heroReplay";
import { meterTotals, type HeroMeterData } from "./heroMeter";
import { HeroRaidFramesCard, HeroThreatCard } from "./HeroStats";
import { useHeroStats } from "./useHeroStats";
import { useLandingInstance } from "./useLandingInstance";

// The Map panel's streams without auras: those only tint debuffed players,
// and they are by far the biggest download (1.3 MB of 1.6 MB on the Ruins run).
const HERO_STREAMS: StreamType[] = [...mapProcessor.streams.filter((stream) => stream !== "aura"), "unit_classification"];
/** The hero's clock ticks this often; the 3D view extrapolates between ticks. */
const TICK_MS = 250;
/** Fastest the whole run plays: quick enough to show the run, slow enough to read the fights. */
const HERO_MAX_SPEED = 4;
/** A boss pull plays in real time, as the run page's Watch tab does. */
const HERO_PULL_SPEED = 1;
const NO_PLAN_ITEMS: [] = [];
// The hero draws neither the encounter route nor movement trails.
const NO_ROUTE: [] = [];
// The deaths processor's streams the replay already fetched, so the death cards' recaps download nothing more.
const HERO_DEATH_STREAMS = deathsProcessor.streams.filter((stream) => HERO_STREAMS.includes(stream));
// The glass meter's panels on the streams the replay already fetched (healing without absorbs and mana gains).
const HERO_DAMAGE_STREAMS = damageDoneProcessor.streams.filter((stream) => HERO_STREAMS.includes(stream));
const HERO_HEALING_STREAMS = unifiedHealingProcessor.streams.filter((stream) => HERO_STREAMS.includes(stream));
/** A death card's strip covers this long before the death. */
const DEATH_STRIP_MS = 10_000;

interface LandingHero3DProps {
  instanceId: string;
  /** Where in the run (ms from its start) the replay begins. */
  startOffsetMs: number;
  /**
   * The boss pull to loop instead of the whole run, framed like the Watch tab's Map panel on that pull.
   * The replay then reports and seeks in ms from the window's start.
   */
  pull?: HeroWindow | null;
  /** The hero is on screen and the tab visible: the clock runs. Otherwise the clock and the scene's frame loop stop. */
  active: boolean;
  /** Called each time the pull reaches its end (the clock then loops back to the window's start). */
  onPullEnd?: () => void;
  /** The replay's state for the scrubber once the mesh is up and the scene shows, or null (not yet, or it failed). */
  onReplay: (replay: HeroReplay | null) => void;
  /** A replay still (the run-still page): a map without a mesh, or whose mesh failed, shows its 2D tiles. */
  still?: boolean;
  /**
   * The Explore modal's scene: the visitor drives the camera (orbit, pan, zoom; clicking a player follows them),
   * as on the run page's Map panel. Off, the hero's backdrop: the cinematic camera only, no pointer input.
   */
  explore?: boolean;
  /** Starts paused (reduced motion in the Explore modal). */
  startPaused?: boolean;
  /** Where in the pull's window the replay begins, in ms (the hero's position when the Explore modal takes over). */
  initialMs?: number;
}

/**
 * Where the clock may be, in run time: inside an encounter. Between pulls the
 * log has no positions and the scene has no one to show, so a time in a gap
 * moves on to the next encounter's start (past the last, back to the first).
 */
function playableRunMs(ms: number, encounters: readonly [number, number][], durationMs: number): number {
  const at = ((ms % durationMs) + durationMs) % durationMs;
  for (const [start, end] of encounters) {
    if (at < start) return start;
    if (at <= end) return at;
  }
  return encounters[0]?.[0] ?? at;
}

// Positions first: the featured run's streams, through the Map panel's processor (on the main thread, yielding).
function useHeroRun(instance: Instance | null, encounterId: string | null) {
  const events = useInstanceEventsContext();
  // The pull alone when one plays; else every encounter, wipes in: the death dots and a boss's first pull often land in one.
  const selectedEncounterIds = useMemo(
    () => encounterId
      ? [encounterId]
      : instance?.encounters.filter((encounter) => encounter.kill_type !== "reset").map((encounter) => encounter.id) ?? [],
    [encounterId, instance],
  );
  return useQuery({
    queryKey: ["landing-hero-run", instance?.id, encounterId],
    enabled: instance !== null,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const fetched = await Promise.all(HERO_STREAMS.map(async (type) => [type, await events.fetchStream(type)] as [StreamType, CachedStream]));
      const processed = await processIncrementally<MapResult>({
        panelId: mapProcessor.id,
        streams: new Map(fetched),
        context: serializableContext(instance!, selectedEncounterIds),
        stopAtTimestamp: null,
        previousState: null,
      });
      if (processed.error) throw new Error(processed.error);
      return { result: processed.result, totalEvents: processed.processedCount, selectedEncounterIds };
    },
  });
}

/** The death card's view of a recap: hits and heals on the victim in the last ten seconds, the last hit the killing blow. */
function heroDeathRecap(death: DeathEvent, instanceStartMs: number): HeroDeathRecap {
  const beats: HeroDeathBeat[] = [];
  let lastHit: { beat: HeroDeathBeat; ability: string } | null = null;
  for (const entry of death.recap) {
    const beforeMs = death.offsetMilli - entry.offsetMilli;
    if (beforeMs > DEATH_STRIP_MS || entry.amount <= 0) continue;
    if (entry.type === "damage") {
      const beat: HeroDeathBeat = { beforeMs, kind: "hit", amount: entry.amount };
      beats.push(beat);
      lastHit = { beat, ability: entry.sourceName };
    } else if (entry.type === "heal" || entry.type === "resource_change") {
      beats.push({ beforeMs, kind: "heal", amount: entry.amount });
    }
  }
  if (lastHit) lastHit.beat.kind = "killing_blow";
  return {
    offsetMs: death.dateMilli - instanceStartMs,
    victimName: death.playerName,
    victimClass: death.className,
    killerName: death.killerName || null,
    killingBlow: death.attribution?.sourceName || lastHit?.ability || null,
    killingBlowAmount: death.attribution?.amount ?? lastHit?.beat.amount ?? null,
    beats,
  };
}

// After the positions: the Instance page's death recaps, through its deaths processor.
function useHeroDeaths(instance: Instance, encounterId: string | null, enabled: boolean) {
  const events = useInstanceEventsContext();
  return useQuery({
    queryKey: ["landing-hero-deaths", instance.id, encounterId],
    enabled,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const fetched = await Promise.all(HERO_DEATH_STREAMS.map(async (type) => [type, await events.fetchStream(type)] as [StreamType, CachedStream]));
      const processed = await processIncrementally<DeathsResult>({
        panelId: "death_log",
        streams: new Map(fetched),
        // The pull, or every encounter: the processor skips unselected ones, and any of them can hold a death.
        context: serializableContext(instance, encounterId ? [encounterId] : instance.encounters.map((encounter) => encounter.id)),
        stopAtTimestamp: null,
        previousState: null,
      });
      if (processed.error) throw new Error(processed.error);
      const instanceStartMs = Date.parse(instance.startTime);
      return processed.result.DeathEvents.map((death) => heroDeathRecap(death, instanceStartMs));
    },
  });
}

// After the positions: the run page's Damage Done and Healing Done panels' processors, summed per player.
function useHeroMeterAmounts(instance: Instance, encounterIds: string[] | undefined, enabled: boolean) {
  const events = useInstanceEventsContext();
  return useQuery({
    queryKey: ["landing-hero-meter", instance.id, encounterIds],
    enabled: enabled && encounterIds !== undefined,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const load = async (streams: StreamType[]) =>
        new Map(await Promise.all(streams.map(async (type) => [type, await events.fetchStream(type)] as [StreamType, CachedStream])));
      const context = serializableContext(instance, encounterIds!);
      const [damage, healing] = await Promise.all([
        processIncrementally<DamageDoneResult>({ panelId: "damage_done", streams: await load(HERO_DAMAGE_STREAMS), context, stopAtTimestamp: null, previousState: null }),
        processIncrementally<UnifiedHealingResult>({ panelId: "healing_done", streams: await load(HERO_HEALING_STREAMS), context, stopAtTimestamp: null, previousState: null }),
      ]);
      if (damage.error) throw new Error(damage.error);
      if (healing.error) throw new Error(healing.error);
      // Players only, summed over the selected encounters.
      const sum = (perEncounter: (encounterId: string) => Iterable<[string, number]>) => {
        const totals = new Map<string, number>();
        for (const encounterId of encounterIds!) {
          for (const [guid, amount] of perEncounter(encounterId)) totals.set(guid, (totals.get(guid) ?? 0) + amount);
        }
        return [...totals].flatMap(([guid, amount]) => {
          const player = instance.players?.[guid];
          return player ? [{ name: player.name, className: player.class, amount }] : [];
        });
      };
      return {
        damage: sum((encounterId) => [...damage.result.EncounterDamage.get(encounterId)?.values() ?? []]
          .map((unit): [string, number] => [unit.playerID, [...unit.target.values()].reduce((total, amount) => total + amount, 0)])),
        healing: sum((encounterId) => [...healing.result.EncounterHealingByHealer.get(encounterId)?.values() ?? []]
          .map((healer): [string, number] => [healer.playerID, healer.effectiveTotal])),
      };
    },
  });
}

export function HeroScene({ instance, startOffsetMs, pull = null, active, onPullEnd, onReplay, still = false, explore = false, startPaused = false, initialMs = 0 }: Omit<LandingHero3DProps, "instanceId"> & { instance: Instance }) {
  const encounterId = pull?.encounterId ?? null;
  const run = useHeroRun(instance, encounterId);
  const processedRecaps = useHeroDeaths(instance, encounterId, run.isSuccess).data ?? null;
  // The scrubber's times are offsets from the instance's start (the featured run's), or from the window's start.
  const instanceStartMs = Date.parse(instance.startTime);
  const pullStartOffsetMs = pull?.startOffsetMs ?? null;
  const pullEndOffsetMs = pull?.endOffsetMs ?? null;
  const deathRecaps = useMemo(() => pullStartOffsetMs === null
    ? processedRecaps
    : processedRecaps?.map((recap) => ({ ...recap, offsetMs: recap.offsetMs - pullStartOffsetMs })) ?? null,
  [processedRecaps, pullStartOffsetMs]);
  const liveRun = useMemo(() => liveHeroRun(instance, processedRecaps), [instance, processedRecaps]);
  const result = run.data?.result ?? null;
  const meterAmounts = useHeroMeterAmounts(instance, run.data?.selectedEncounterIds, run.isSuccess).data ?? null;
  const span = useMemo(() => {
    if (!result || result.encounters.size === 0) return null;
    if (encounterId && pullStartOffsetMs !== null && pullEndOffsetMs !== null) {
      const encounter = result.encounters.get(encounterId);
      if (!encounter) return null;
      // One span, the window, played from the pull's first position sample: the log's positions can start a second
      // or two after the pull, and the scene would hold still until then.
      const startMs = instanceStartMs + pullStartOffsetMs;
      const durationMs = Math.max(1, pullEndOffsetMs - pullStartOffsetMs);
      let firstSampleMs = Infinity;
      for (const samples of encounter.positionsByUnit.values()) firstSampleMs = Math.min(firstSampleMs, samples[0]?.timestampMs ?? Infinity);
      const playFromMs = Number.isFinite(firstSampleMs) ? Math.min(Math.max(0, firstSampleMs - startMs), durationMs - 1) : 0;
      return { startMs, endMs: startMs + durationMs, durationMs, playable: [[playFromMs, durationMs]] as [number, number][], encounterStartMs: encounter.startMs, encounterEndMs: encounter.endMs };
    }
    const encounters = [...result.encounters.values()];
    const startMs = Math.min(...encounters.map((encounter) => encounter.startMs));
    const endMs = Math.max(...encounters.map((encounter) => encounter.endMs));
    // Each encounter's span in run time, in order.
    const playable = encounters
      .map((encounter): [number, number] => [encounter.startMs - startMs, encounter.endMs - startMs])
      .sort((left, right) => left[0] - right[0]);
    return { startMs, endMs, durationMs: Math.max(1, endMs - startMs), playable, encounterStartMs: startMs, encounterEndMs: endMs };
  }, [encounterId, instanceStartMs, pullEndOffsetMs, pullStartOffsetMs, result]);
  // The meter's rates over the time fought: the pull, or every encounter of the run.
  const meter = useMemo((): HeroMeterData | null => {
    if (!meterAmounts || !result) return null;
    const encounters = [...result.encounters.values()];
    const foughtMs = encounterId
      ? (span ? span.encounterEndMs - span.encounterStartMs : 0)
      : encounters.reduce((total, encounter) => total + encounter.endMs - encounter.startMs, 0);
    return {
      damage: meterTotals(meterAmounts.damage, foughtMs),
      healing: meterTotals(meterAmounts.healing, foughtMs),
      deaths: (deathRecaps ?? []).map((recap) => ({
        victim: recap.victimName,
        className: recap.victimClass,
        atMs: recap.offsetMs,
        ability: recap.killingBlow,
        amount: recap.killingBlowAmount,
        source: recap.killerName,
      })),
    };
  }, [deathRecaps, encounterId, meterAmounts, result, span]);
  const speed = pull ? HERO_PULL_SPEED : span ? previewSpeed(span.durationMs, HERO_MAX_SPEED) : 1;

  // The hero's own clock, in run time (window time for a pull); useMapScene's preview loops it over the run.
  const [runMs, setRunMs] = useState(pull ? initialMs : startOffsetMs);
  const [userPlaying, setUserPlaying] = useState(!startPaused);
  const [meshState, setMeshState] = useState<DungeonMeshState>("loading");
  const [unavailable, setUnavailable] = useState(false);
  // Bumped on a jump (a boss chip, a death): the camera cuts to the new shot rather than gliding there.
  const [cutKey, setCutKey] = useState(0);
  const playing = userPlaying && active && meshState === "ready";
  // Explore: once the visitor orbits, pans or zooms, the camera holds their view (the Director stands down);
  // clicking a player follows them (the Director on that unit), as on the run page's Map panel.
  const [userView, setUserView] = useState<MapViewport | null>(null);
  const [viewRevision, setViewRevision] = useState(0);
  const [followGuid, setFollowGuid] = useState<string | null>(null);
  // Another pull (the boss rail) plays from its window's start, framed afresh.
  const [clockPull, setClockPull] = useState(encounterId);
  if (clockPull !== encounterId) {
    setClockPull(encounterId);
    setRunMs(0);
    setUserPlaying(!startPaused);
    setUserView(null);
    setFollowGuid(null);
  }
  // The clock and the end callback as the timer reads them, without restarting it.
  const runMsRef = useRef(runMs);
  const onPullEndRef = useRef(onPullEnd);
  useEffect(() => {
    runMsRef.current = runMs;
    onPullEndRef.current = onPullEnd;
  });
  useEffect(() => {
    if (!playing || !span) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      // Capped, so a throttled timer never leaps the replay ahead.
      const step = Math.min(now - last, 4 * TICK_MS) * speed;
      last = now;
      if (encounterId && playableRunMs(runMsRef.current, span.playable, span.durationMs) + step >= span.durationMs) onPullEndRef.current?.();
      setRunMs((ms) => playableRunMs(playableRunMs(ms, span.playable, span.durationMs) + step, span.playable, span.durationMs));
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [encounterId, playing, span, speed]);

  const props = useMemo((): PanelRenderProps<MapResult> => ({
    result: result ?? mapProcessor.createState(),
    totalEvents: run.data?.totalEvents ?? 0,
    processingTimeMs: null,
    durationMs: span?.durationMs ?? 0,
    perSecond: false,
    checkboxChecked: false,
    loading: !result,
    processing: false,
    error: null,
    context: {
      instance,
      selectedEncounterIds: run.data?.selectedEncounterIds ?? [],
      entitySelection: { enemyIds: new Set(), playerIds: new Set() },
    },
  }), [instance, result, run.data, span]);
  const playableMs = span ? playableRunMs(runMs, span.playable, span.durationMs) : runMs;
  // Always the mesh's own projection: the landing never shows the 2D tiles, not even while the mesh loads.
  // A pull is the single encounter the Watch tab's Map panel shows; its preview runs from the encounter's first sample
  // and loops at its last, so outside them (any lead-in, the window's tail) the scene holds the nearest sample.
  const pullElapsedMs = span
    ? Math.min(Math.max(0, span.startMs + playableMs - span.encounterStartMs), Math.max(0, span.encounterEndMs - span.encounterStartMs - 1))
    : 0;
  const scene = useMapScene(props, {
    rawDungeonProjection: true,
    wholeRun: !pull,
    preview: pull
      ? { elapsedMs: pullElapsedMs, playing, maxSpeed: HERO_PULL_SPEED }
      : { elapsedMs: playableMs / speed, playing, maxSpeed: HERO_MAX_SPEED },
  });
  // Should the scene still lose its units for a moment, the last ready one stays up (frozen) rather than the view
  // unmounting; as in the Map panel, re-held only when what it shows changes (the frozen view ignores its per-tick data).
  const live = scene.status === "ready" ? scene : null;
  const [held, setHeld] = useState<typeof live>(null);
  if (live && (!held || held.mapName !== live.mapName || held.mesh !== live.mesh)) setHeld(live);
  const ready = live ?? held;
  // The camera cuts to another pull once its scene is up (until then the last pull's view holds, frozen).
  const [cutPull, setCutPull] = useState(encounterId);
  const livePull = live && run.data ? encounterId : null;
  if (livePull !== null && livePull !== cutPull) {
    setCutPull(livePull);
    setCutKey((key) => key + 1);
  }

  // Then the camera framing, as the Map panel's default: on a boss pull the fight (the Director frames it, cinematic below),
  // across the whole run the party Follow.
  const autoFit = ready?.fitByDefault ? ready.autoFit : null;
  const focusCentre = ready?.focusCentre ?? null;
  const focusZoom = autoFit?.zoom ?? null;
  const focus = useMemo((): MapSceneFocus | null =>
    focusCentre && focusZoom !== null ? { centre: focusCentre, zoom: focusZoom } : null,
  [focusCentre, focusZoom]);
  // Then the GLB, through the scene's dungeonMeshBytes path.
  const mesh = ready?.mesh ?? null;
  const iconBaseUrl = instance.iconBaseUrl;
  // Explore on a map without a mesh: its tiles are the ground, ready at once (the backdrop shows nothing instead).
  if (explore && ready !== null && mesh === null && meshState !== "ready") setMeshState("ready");
  const dungeonMesh = useMemo((): DungeonMeshRequest | null =>
    mesh && iconBaseUrl ? { url: dungeonMeshUrl(mesh, iconBaseUrl), bounds: mesh.bounds, liquid: dungeonMeshLiquid(mesh) } : null,
  [iconBaseUrl, mesh]);

  const cinematic = !explore || userView === null;
  const followGroup = () => {
    setUserView(null);
    setFollowGuid(null);
    setViewRevision((revision) => revision + 1);
  };
  // Clicking the followed player again lets go; following takes the camera back from the visitor.
  const followUnit = (guid: string) => {
    if (followGuid === guid) {
      setFollowGuid(null);
      return;
    }
    if (userView) {
      setUserView(null);
      setViewRevision((revision) => revision + 1);
    }
    setFollowGuid(guid);
  };
  const followedName = followGuid ? instance.players?.[followGuid]?.name ?? instance.units?.[followGuid]?.name ?? null : null;

  const stillTiles = still && ready !== null && (ready.mesh === null || meshState === "failed");
  const shown = ready !== null && (meshState === "ready" || stillTiles) && !unavailable;
  const togglePlay = useCallback(() => setUserPlaying((current) => !current), []);
  const seek = useCallback((offsetMs: number, options?: { cut?: boolean }) => {
    if (!span) return;
    setRunMs(pull ? Math.min(span.durationMs, Math.max(0, offsetMs)) : instanceStartMs + offsetMs - span.startMs);
    setUserPlaying(true);
    if (options?.cut) setCutKey((key) => key + 1);
  }, [instanceStartMs, pull, span]);
  const cursorMs = ready?.cursorMs ?? null;
  // A pull reports the hero's clock, from the pull's first position sample (the clock skips the frames before it).
  const currentMs = cursorMs === null ? null : pull ? playableMs : cursorMs - instanceStartMs;
  // The live stats follow the hero's clock from the pull's start (chips, the scrubber and deaths move it through `seek`):
  // the meter's damage and the threat table at the cursor, and the raid frames. Explore's modal shows them too.
  const stats = useHeroStats(instance, encounterId, shown && span && currentMs !== null ? span.startMs + playableMs : null, HERO_STREAMS);
  const cursorDamage = stats?.damage ?? null;
  const breakouts = stats?.breakouts ?? null;
  // The run page link's run, and on a pull the per-player breakouts a bar click drills into.
  const liveMeter = useMemo(() => meter && {
    ...meter,
    ...(cursorDamage ? { damage: cursorDamage } : {}),
    breakouts,
    run: { id: instance.id, slug: instance.slug },
  }, [breakouts, cursorDamage, instance, meter]);
  const renderRaidFrames = useMemo(() => stats?.frames
    ? (onSwitch: (() => void) | null) => <HeroRaidFramesCard instance={instance} stats={stats} onSwitch={onSwitch} />
    : null, [instance, stats]);
  const renderThreat = useMemo(() => stats?.threat?.rows.length
    ? (onSwitch: (() => void) | null) => <HeroThreatCard stats={stats} onSwitch={onSwitch} />
    : null, [stats]);
  useEffect(() => {
    if (!shown || !span || currentMs === null) {
      onReplay(null);
      return;
    }
    onReplay({ run: liveRun, currentMs, playing: userPlaying, togglePlay, seek, deathRecaps, meter: liveMeter, renderRaidFrames, renderThreat });
  }, [currentMs, deathRecaps, liveMeter, liveRun, onReplay, renderRaidFrames, renderThreat, seek, shown, span, togglePlay, userPlaying]);
  useEffect(() => () => onReplay(null), [onReplay]);

  if (!ready || unavailable) return null;
  // A still of a map without a mesh: the Map panel's flat 2D view, framed on the party.
  if (stillTiles) {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <MapView2D ground={ready.ground} markers={ready.markers} routePoints={NO_ROUTE} projectSample={ready.projectSample} trailSeconds={0} view={{ viewport: autoFit ?? FULL_MAP_VIEWPORT, key: "still" }} />
      </div>
    );
  }
  return (
    // Fades in over the poster (which stays underneath) once the mesh is up; until then nothing new shows.
    <div
      aria-hidden={!explore}
      className={`absolute inset-0 transition-opacity duration-700 ${explore ? "" : "pointer-events-none"}`}
      style={{ opacity: shown ? 1 : 0 }}
    >
      <MapView3D
        ground={ready.ground}
        markers={ready.markers}
        routePoints={NO_ROUTE}
        projectSample={ready.projectSample}
        cursorMs={ready.cursorMs}
        playing={ready.playing}
        playbackSpeed={ready.playbackSpeed}
        view={{ viewport: userView ?? autoFit ?? FULL_MAP_VIEWPORT, key: explore ? `explore-${viewRevision}` : "hero" }}
        onUserViewport={explore ? setUserView : undefined}
        onUnitClick={explore ? followUnit : undefined}
        followGuid={explore ? followGuid : undefined}
        onFollowChange={explore ? setFollowGuid : undefined}
        effects={ready.effects}
        bossGuids={ready.bossGuids}
        tankGuids={ready.tankGuids}
        onUnavailable={() => setUnavailable(true)}
        dungeonMesh={dungeonMesh}
        // Explore keeps playing on the tiles should the mesh fail.
        onDungeonMeshState={explore ? (state) => setMeshState(state === "failed" ? "ready" : state) : setMeshState}
        focus={focus}
        cinematic={cinematic}
        cutKey={cutKey}
        debuffSpellIds={ready.debuffSpellIds}
        planItems={NO_PLAN_ITEMS}
        frozen={!live}
        // The compass only where the camera is free (Explore): on the hero backdrop and the still it sits over the overlays.
        showCompass={explore}
      />
      {explore && shown && (
        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-md border bg-background/80 px-2.5 py-1.5 text-xs text-foreground shadow-lg backdrop-blur-sm lg:left-4 lg:top-4">
          {followedName && <span>Following <span className="font-semibold">{followedName}</span></span>}
          <button type="button" onClick={followGroup} className="rounded-sm border bg-card px-2 py-1 text-xs hover:border-primary">
            Follow the group
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The landing hero's live layer: the featured run's boss pull (or the whole run) replayed in 3D, muted and looping.
 * `children` render inside the run's stream cache: the Explore modal, taking over the hero's loaded run.
 */
export default function LandingHero3D({ instanceId, children, ...props }: LandingHero3DProps & { children?: ReactNode }) {
  const instance = useLandingInstance(instanceId);
  return (
    <InstanceEventsProvider instanceId={instanceId}>
      {instance && <HeroScene instance={instance} {...props} />}
      {children}
    </InstanceEventsProvider>
  );
}
