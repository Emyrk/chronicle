import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MapFloorPicker } from "./MapFloorPicker";
import { MapView2D } from "./MapView2D";
import { DEFAULT_EFFECT_SETTINGS } from "./mapViewSettings";
import type { MapView3DProps } from "./MapView3D";
import { stageView as stageViewFor } from "./replayPlayerModel";
import type { ReplayPlayerState } from "./useReplayPlayer";

const LazyMapView3D = lazy(() => import("./MapView3D"));

/**
 * What a host passes through to the 3D view for the features it turns on
 * (walk, plan, presence, targeting, settings). Everything the scene provides
 * (units, ground, effects, clock, mesh, camera, framing) comes from the player.
 */
export type ReplayViewOptions = Pick<MapView3DProps,
  | "onUnitClick"
  | "effectSettings"
  | "walking"
  | "onWalkingChange"
  | "mobileInput"
  | "adStrafe"
  | "walkAvatar"
  | "livePresence"
  | "presenceSurface"
  | "unitCallouts"
  | "unitRoles"
  | "planItems"
  | "planSelectedId"
  | "planInput"
  | "onCameraCapture"
  | "walkCaptureFrame"
  | "showCompass"
  | "capture"
> & {
  /** A followed unit the host fixes itself (the stories), instead of the player's Follow state. */
  followGuid?: string | null;
  /** Movement trails on the 2D view, in seconds. */
  trailSeconds?: number;
};

export interface ReplayPlayerProps {
  player: ReplayPlayerState;
  /** Host features passed through to the view. */
  view?: ReplayViewOptions;
  /** Above the stage (the Map panel's title-row controls). */
  header?: ReactNode;
  /** Over the stage, after the view, in order (controls, chips, frames, dialogs). */
  overlay?: ReactNode;
  /** Below the stage (the whole run's encounter bar and the notes under it). */
  transport?: ReactNode;
  /** Shown instead of the 3D/2D view (the mobile panel's inert 2D preview). */
  fallback?: ReactNode;
  /** The stage's thin window frame (the full map, inline). */
  framed?: boolean;
  /** No stage box: the view and overlay go straight into the host's own box. */
  bare?: boolean;
  /**
   * The 3D view component. Default: MapView3D, loaded lazily (behind a "Loading 3D view" message). A host that is
   * itself a lazy 3D chunk (the landing, the export) passes the statically imported one: no extra chunk round trip.
   */
  view3d?: ComponentType<MapView3DProps>;
}

/** A map message (loading, no telemetry, no artwork), with whatever the host adds under it. */
export function MapMessage({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 p-6 text-center">
      <MapIcon className="h-8 w-8 text-muted-foreground/50" />
      <div className="text-sm font-medium text-foreground">{title}</div>
      <p className="max-w-sm text-xs text-muted-foreground">{detail}</p>
      {children}
    </div>
  );
}

/** The scene's message while there is nothing to show yet, with its floor picker when another floor may help. */
export function ReplayPlayerMessage({ player }: { player: ReplayPlayerState }) {
  const { scene } = player;
  if (scene.status !== "message") return null;
  return (
    <MapMessage title={scene.title} detail={scene.detail}>
      {scene.floors && scene.setFloorNumber && (
        <MapFloorPicker floors={scene.floors} value={scene.selectedFloorNumber ?? null} manualValue={scene.manualFloorNumber ?? null} uncertain={scene.floorUncertain ?? false} onChange={scene.setFloorNumber} />
      )}
    </MapMessage>
  );
}

/** The replay on the 2D map: the WebGL fallback, and the mobile panel's inert preview. */
export function ReplayPlayerFlatView({ player, trailSeconds }: { player: ReplayPlayerState; trailSeconds?: number }) {
  const ready = player.ready;
  if (!ready) return null;
  return (
    <MapView2D
      ground={ready.ground}
      markers={ready.markers}
      projectSample={ready.projectSample}
      trailSeconds={trailSeconds ?? DEFAULT_EFFECT_SETTINGS.trailSeconds}
      view={player.view}
      onUserViewport={player.onUserViewport}
    />
  );
}

/**
 * The 3D replay: the scene on the 3D view (or the 2D map without WebGL), with
 * the host's chrome in its slots. Renders nothing until the scene is ready:
 * the host shows `ReplayPlayerMessage` then.
 */
export function ReplayPlayer({ player, view = {}, header, overlay, transport, fallback, framed = false, bare = false, view3d }: ReplayPlayerProps) {
  const ready = player.ready;
  if (!ready) return null;
  const { trailSeconds, followGuid, ...viewProps } = view;
  const fields = player.sceneFields;
  const interactive = player.interactive;
  const View3D = view3d ?? LazyMapView3D;
  const view3dElement = (
    <View3D
      {...viewProps}
      ground={ready.ground}
      worldMapId={ready.worldMapId}
      alignmentGround={fields.alignmentGround ? ready.alignmentGround : undefined}
      markers={ready.markers}
      projectSample={ready.projectSample}
      worldCoordinates={fields.worldCoordinates ? player.worldCoordinates : undefined}
      cursorMs={ready.cursorMs}
      playing={ready.playing}
      playbackSpeed={ready.playbackSpeed}
      view={player.view}
      onUserViewport={interactive ? player.onUserViewport : undefined}
      effects={ready.effects}
      bossGuids={ready.bossGuids}
      tankGuids={ready.tankGuids}
      unitModelUrls={player.unitModelUrls}
      onUnavailable={player.markWebglUnavailable}
      dungeonMesh={player.dungeonMesh}
      onDungeonMeshState={player.setMeshState}
      cameraPose={player.camera.pose ?? null}
      cameraPath={player.camera.path?.marks ?? null}
      cameraPathStartMs={player.camera.path?.startMs ?? 0}
      cameraCaptureKey={player.cameraCaptureKey}
      focus={fields.focus ? player.focus : undefined}
      cinematic={player.cinematic}
      followSource={fields.followSource ? ready.followSource : undefined}
      cutKey={player.cutKey}
      topDownKey={player.topDownKey}
      frozen={player.reloading}
      debuffSpellIds={ready.debuffSpellIds}
      followGuid={followGuid !== undefined ? followGuid : interactive ? player.followGuid : undefined}
      onFollowChange={interactive ? player.setFollowGuid : undefined}
      onScene={player.onScene}
    />
  );
  const kind = stageViewFor(player.show3D, player.meshOnly, player.webglFallback);
  const stageView = fallback ?? (kind === "none" ? null : kind === "mesh-only"
    ? <MapMessage title="No map artwork for this instance" detail={`${ready.mapName} has no 2D map; it is 3D only, and this browser could not provide WebGL.`} />
    : kind === "2d"
      ? <ReplayPlayerFlatView player={player} trailSeconds={trailSeconds} />
      : view3d
        ? view3dElement
        : <Suspense fallback={<MapMessage title="Loading 3D view" detail="Fetching the 3D renderer…" />}>{view3dElement}</Suspense>);
  if (bare) return <>{header}{stageView}{overlay}{transport}</>;
  return (
    <>
      {header}
      {/* The card has no padding (hoverHeader): the full map keeps a thin window frame a hair inside it, the others run to the edges. */}
      <div className={cn("group/map relative min-h-0 flex-1 overflow-hidden bg-black/70", framed && "rounded-sm border border-white/15")}>
        {stageView}
        {overlay}
      </div>
      {transport}
    </>
  );
}
