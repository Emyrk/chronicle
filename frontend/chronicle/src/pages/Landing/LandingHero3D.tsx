import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useInstance } from "@/api/queries";
import { InstanceEventsProvider, useInstanceEventsContext, type CachedStream, type StreamType } from "@/hooks/instanceEvents";
import { transformToInstance } from "@/pages/Instance/transformInstance";
import type { Instance } from "@/pages/Instance/InstancePage";
import { deathsProcessor, type DeathEvent, type DeathsResult } from "@/pages/Instance/EventsPanels/Deaths/deaths.processor";
import { processIncrementally } from "@/pages/Instance/EventsPanels/mainThreadProcessor";
import type { SerializableProcessorContext } from "@/pages/Instance/EventsPanels/processorTypes";
import type { PanelRenderProps } from "@/pages/Instance/EventsPanels/types";
import { dungeonMeshLiquid, dungeonMeshUrl } from "@/pages/Instance/EventsPanels/Map/dungeonMeshes";
import { mapProcessor, type MapResult } from "@/pages/Instance/EventsPanels/Map/map.processor";
import { FULL_MAP_VIEWPORT } from "@/pages/Instance/EventsPanels/Map/mapModel";
import type { DungeonMeshRequest, DungeonMeshState, MapSceneFocus } from "@/pages/Instance/EventsPanels/Map/MapScene3D";
import { MapView2D } from "@/pages/Instance/EventsPanels/Map/MapView2D";
import MapView3D from "@/pages/Instance/EventsPanels/Map/MapView3D";
import { previewSpeed, useMapScene } from "@/pages/Instance/EventsPanels/Map/useMapScene";
import type { HeroDeathBeat, HeroDeathRecap, HeroReplay, HeroWindow } from "./heroReplay";

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

function serializableContext(instance: Instance, selectedEncounterIds: string[]): SerializableProcessorContext {
  return {
    players: Object.fromEntries(Object.entries(instance.players ?? {})
      .map(([guid, player]) => [guid, { name: player.name, class: player.class, level: player.level }])),
    units: Object.fromEntries(Object.entries(instance.units ?? {})
      .map(([guid, unit]) => [guid, { name: unit.name, owner: unit.owner?.toString() ?? null, entry: unit.entry }])),
    selectedEncounterIds,
    entitySelection: { enemyIds: [], playerIds: [] },
    capabilities: instance.capabilities ?? [],
    positionCoordinateSpace: instance.positionCoordinateSpace,
  };
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
    killingBlow: death.attribution?.sourceName || lastHit?.ability || null,
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

function HeroScene({ instance, startOffsetMs, pull = null, active, onPullEnd, onReplay, still = false }: Omit<LandingHero3DProps, "instanceId"> & { instance: Instance }) {
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
  const result = run.data?.result ?? null;
  const span = useMemo(() => {
    if (!result || result.encounters.size === 0) return null;
    if (encounterId && pullStartOffsetMs !== null && pullEndOffsetMs !== null) {
      const encounter = result.encounters.get(encounterId);
      if (!encounter) return null;
      // One span, the window: nothing to skip inside one pull.
      const startMs = instanceStartMs + pullStartOffsetMs;
      const durationMs = Math.max(1, pullEndOffsetMs - pullStartOffsetMs);
      return { startMs, endMs: startMs + durationMs, durationMs, playable: [[0, durationMs]] as [number, number][], encounterStartMs: encounter.startMs, encounterEndMs: encounter.endMs };
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
  const speed = pull ? HERO_PULL_SPEED : span ? previewSpeed(span.durationMs, HERO_MAX_SPEED) : 1;

  // The hero's own clock, in run time (window time for a pull); useMapScene's preview loops it over the run.
  const [runMs, setRunMs] = useState(pull ? 0 : startOffsetMs);
  const [userPlaying, setUserPlaying] = useState(true);
  const [meshState, setMeshState] = useState<DungeonMeshState>("loading");
  const [unavailable, setUnavailable] = useState(false);
  // Bumped on a jump (a boss chip, a death): the camera cuts to the new shot rather than gliding there.
  const [cutKey, setCutKey] = useState(0);
  const playing = userPlaying && active && meshState === "ready";
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
  // and loops at its last, so outside them (the lead-in, the window's tail) the scene holds the nearest sample.
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
  const dungeonMesh = useMemo((): DungeonMeshRequest | null =>
    mesh && iconBaseUrl ? { url: dungeonMeshUrl(mesh, iconBaseUrl), bounds: mesh.bounds, liquid: dungeonMeshLiquid(mesh) } : null,
  [iconBaseUrl, mesh]);

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
  // A pull reports the hero's clock: it moves through the lead-in, where the scene holds the pull's first sample.
  const currentMs = cursorMs === null ? null : pull ? playableMs : cursorMs - instanceStartMs;
  useEffect(() => {
    if (!shown || !span || currentMs === null) {
      onReplay(null);
      return;
    }
    onReplay({ currentMs, playing: userPlaying, togglePlay, seek, deathRecaps });
  }, [currentMs, deathRecaps, onReplay, seek, shown, span, togglePlay, userPlaying]);
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
      aria-hidden
      className="pointer-events-none absolute inset-0 transition-opacity duration-700"
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
        view={{ viewport: autoFit ?? FULL_MAP_VIEWPORT, key: "hero" }}
        effects={ready.effects}
        bossGuids={ready.bossGuids}
        tankGuids={ready.tankGuids}
        onUnavailable={() => setUnavailable(true)}
        dungeonMesh={dungeonMesh}
        onDungeonMeshState={setMeshState}
        focus={focus}
        cinematic
        cutKey={cutKey}
        debuffSpellIds={ready.debuffSpellIds}
        planItems={NO_PLAN_ITEMS}
        frozen={!live}
      />
    </div>
  );
}

/** The landing hero's live layer: the featured run's boss pull (or the whole run) replayed in 3D, muted and looping. */
export default function LandingHero3D({ instanceId, ...props }: LandingHero3DProps) {
  const { data: apiInstance } = useInstance(instanceId);
  const instance = useMemo(() => apiInstance ? transformToInstance(apiInstance) : null, [apiInstance]);
  return (
    <InstanceEventsProvider instanceId={instanceId}>
      {instance && <HeroScene instance={instance} {...props} />}
    </InstanceEventsProvider>
  );
}
