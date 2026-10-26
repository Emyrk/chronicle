import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useInstance } from "@/api/queries";
import { InstanceEventsProvider, useInstanceEventsContext, type CachedStream, type StreamType } from "@/hooks/instanceEvents";
import { transformToInstance } from "@/pages/Instance/transformInstance";
import type { Instance } from "@/pages/Instance/InstancePage";
import { processIncrementally } from "@/pages/Instance/EventsPanels/mainThreadProcessor";
import type { SerializableProcessorContext } from "@/pages/Instance/EventsPanels/processorTypes";
import type { PanelRenderProps } from "@/pages/Instance/EventsPanels/types";
import { dungeonMeshLiquid, dungeonMeshUrl } from "@/pages/Instance/EventsPanels/Map/dungeonMeshes";
import { mapProcessor, type MapResult } from "@/pages/Instance/EventsPanels/Map/map.processor";
import { FULL_MAP_VIEWPORT } from "@/pages/Instance/EventsPanels/Map/mapModel";
import type { DungeonMeshRequest, DungeonMeshState, MapSceneFocus } from "@/pages/Instance/EventsPanels/Map/MapScene3D";
import MapView3D from "@/pages/Instance/EventsPanels/Map/MapView3D";
import { previewSpeed, useMapScene } from "@/pages/Instance/EventsPanels/Map/useMapScene";
import { encounterJumps } from "@/pages/Instance/EventsPanels/Map/wholeRun";
import type { HeroReplay } from "./heroReplay";

// The Map panel's streams without auras: those only tint debuffed players,
// and they are by far the biggest download (1.3 MB of 1.6 MB on the Ruins run).
const HERO_STREAMS: StreamType[] = [...mapProcessor.streams.filter((stream) => stream !== "aura"), "unit_classification"];
/** The hero's clock ticks this often; the 3D view extrapolates between ticks. */
const TICK_MS = 250;
/** Fastest the whole run plays: quick enough to show the run, slow enough to read the fights. */
const HERO_MAX_SPEED = 4;
const NO_PLAN_ITEMS: [] = [];

interface LandingHero3DProps {
  instanceId: string;
  /** Where in the run (ms from its start) the replay begins. */
  startOffsetMs: number;
  /** The hero is on screen and the tab visible: the clock runs. Otherwise the clock and the scene's frame loop stop. */
  active: boolean;
  /** The replay's state for the scrubber once the mesh is up and the scene shows, or null (not yet, or it failed). */
  onReplay: (replay: HeroReplay | null) => void;
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
function useHeroRun(instance: Instance | null) {
  const events = useInstanceEventsContext();
  const selectedEncounterIds = useMemo(
    () => instance?.encounters.filter((encounter) => encounter.kill_type !== "wipe" && encounter.kill_type !== "reset").map((encounter) => encounter.id) ?? [],
    [instance],
  );
  return useQuery({
    queryKey: ["landing-hero-run", instance?.id],
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

function HeroScene({ instance, startOffsetMs, active, onReplay }: Omit<LandingHero3DProps, "instanceId"> & { instance: Instance }) {
  const run = useHeroRun(instance);
  const result = run.data?.result ?? null;
  const span = useMemo(() => {
    if (!result || result.encounters.size === 0) return null;
    const encounters = [...result.encounters.values()];
    const startMs = Math.min(...encounters.map((encounter) => encounter.startMs));
    const endMs = Math.max(...encounters.map((encounter) => encounter.endMs));
    // Each encounter's span in run time, in order.
    const playable = encounters
      .map((encounter): [number, number] => [encounter.startMs - startMs, encounter.endMs - startMs])
      .sort((left, right) => left[0] - right[0]);
    return { startMs, endMs, durationMs: Math.max(1, endMs - startMs), playable };
  }, [result]);
  const speed = span ? previewSpeed(span.durationMs, HERO_MAX_SPEED) : 1;

  // The hero's own clock, in run time; useMapScene's preview loops it over the run.
  const [runMs, setRunMs] = useState(startOffsetMs);
  const [userPlaying, setUserPlaying] = useState(true);
  const [meshState, setMeshState] = useState<DungeonMeshState>("loading");
  const [unavailable, setUnavailable] = useState(false);
  const playing = userPlaying && active && meshState === "ready";
  useEffect(() => {
    if (!playing || !span) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      // Capped, so a throttled timer never leaps the replay ahead.
      const step = Math.min(now - last, 4 * TICK_MS) * speed;
      last = now;
      setRunMs((ms) => playableRunMs(playableRunMs(ms, span.playable, span.durationMs) + step, span.playable, span.durationMs));
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [playing, span, speed]);

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
  // Always the mesh's own projection: the landing never shows the 2D tiles, not even while the mesh loads.
  const scene = useMapScene(props, {
    rawDungeonProjection: true,
    wholeRun: true,
    preview: { elapsedMs: (span ? playableRunMs(runMs, span.playable, span.durationMs) : runMs) / speed, playing, maxSpeed: HERO_MAX_SPEED },
  });
  // Should the scene still lose its units for a moment, the last ready one stays up (frozen) rather than the view
  // unmounting; as in the Map panel, re-held only when what it shows changes (the frozen view ignores its per-tick data).
  const live = scene.status === "ready" ? scene : null;
  const [held, setHeld] = useState<typeof live>(null);
  if (live && (!held || held.mapName !== live.mapName || held.mesh !== live.mesh)) setHeld(live);
  const ready = live ?? held;

  // Then the camera framing: the whole-run Follow, as the Map panel's default framing.
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

  const jumps = useMemo(
    () => span ? encounterJumps(instance.encounters, result!.encounters, span.startMs, span.endMs) : [],
    [instance.encounters, result, span],
  );
  const effects = ready?.effects ?? null;
  const deaths = useMemo(() => {
    if (!effects || !span) return [];
    return [...effects.deathsByUnit.entries()]
      .filter(([guid]) => instance.players?.[guid])
      .flatMap(([, times]) => times.map((time) => (time - span.startMs) / span.durationMs))
      .filter((fraction) => fraction >= 0 && fraction <= 1);
  }, [effects, instance.players, span]);

  const shown = ready !== null && meshState === "ready" && !unavailable;
  const togglePlay = useCallback(() => setUserPlaying((current) => !current), []);
  const jumpToBoss = useCallback((id: string) => {
    const jump = jumps.find((candidate) => candidate.id === id);
    if (!jump || !span) return;
    setRunMs(jump.timestampMs - span.startMs);
    setUserPlaying(true);
  }, [jumps, span]);
  const cursorMs = ready?.cursorMs ?? null;
  useEffect(() => {
    if (!shown || !span || cursorMs === null) {
      onReplay(null);
      return;
    }
    const activeBoss = jumps.filter((jump) => jump.timestampMs <= cursorMs).at(-1) ?? null;
    onReplay({
      playing: userPlaying,
      elapsedMs: cursorMs - span.startMs,
      durationMs: span.durationMs,
      bosses: jumps.map((jump) => ({ id: jump.id, name: jump.name, fraction: jump.fraction })),
      activeBossId: activeBoss?.id ?? null,
      deaths,
      togglePlay,
      jumpToBoss,
    });
  }, [cursorMs, deaths, jumpToBoss, jumps, onReplay, shown, span, togglePlay, userPlaying]);
  useEffect(() => () => onReplay(null), [onReplay]);

  if (!ready || unavailable) return null;
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
        debuffSpellIds={ready.debuffSpellIds}
        planItems={NO_PLAN_ITEMS}
        frozen={!live}
      />
    </div>
  );
}

/** The landing hero's live layer: the featured run replayed in 3D, muted and looping. */
export default function LandingHero3D({ instanceId, ...props }: LandingHero3DProps) {
  const { data: apiInstance } = useInstance(instanceId);
  const instance = useMemo(() => apiInstance ? transformToInstance(apiInstance) : null, [apiInstance]);
  return (
    <InstanceEventsProvider instanceId={instanceId}>
      {instance && <HeroScene instance={instance} {...props} />}
    </InstanceEventsProvider>
  );
}
