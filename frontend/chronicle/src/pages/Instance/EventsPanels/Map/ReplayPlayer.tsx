import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Loader2, Map as MapIcon, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MapFloorPicker } from "./MapFloorPicker";
import { MapView2D } from "./MapView2D";
import { DEFAULT_EFFECT_SETTINGS } from "./mapViewSettings";
import type { MapView3DProps } from "./MapView3D";
import { DUNGEON_3D_COPY } from "./dungeon3DModel";
import { stageView as stageViewFor, viewInputFor } from "./replayPlayerModel";
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
  /** The 3D map notice's wording: the full sentence (default), or just the fact on a small stage (the mini map). */
  noticeCopy?: "full" | "short";
  /** Where the 3D map notice sits: under the top chips (default), or below a host's own top row (the mobile world's controls). */
  noticePlacement?: "top" | "below-controls";
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
export function ReplayPlayer({ player, view = {}, header, overlay, transport, fallback, framed = false, bare = false, view3d, noticeCopy = "full", noticePlacement = "top" }: ReplayPlayerProps) {
  const ready = player.ready;
  if (!ready) return null;
  const { trailSeconds, followGuid, onUnitClick, ...viewProps } = view;
  const fields = player.sceneFields;
  const interactive = player.interactive;
  const input = viewInputFor(interactive, { onUnitClick, followGuid, playerFollowGuid: player.followGuid });
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
      onUnitClick={input.onUnitClick}
      followGuid={input.followGuid}
      onFollowChange={input.followChanges ? player.setFollowGuid : undefined}
      onCameraOwnerChange={input.followChanges ? player.onCameraOwnerChange : undefined}
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
  // What the map says about the 3D dungeon, only while the 3D view is the stage (not over a fallback or the 2D map).
  const showsDungeon = !fallback && kind === "3d";
  const cover = showsDungeon && player.dungeon3D.cover ? <DungeonCover player={player} /> : null;
  const notice = showsDungeon && player.dungeon3D.notice ? <DungeonNotice player={player} copy={noticeCopy} placement={noticePlacement} /> : null;
  if (bare) return <>{header}{stageView}{cover}{overlay}{notice}{transport}</>;
  return (
    <>
      {header}
      {/* The card has no padding (hoverHeader): the full map keeps a thin window frame a hair inside it, the others run to the edges. */}
      <div className={cn("group/map relative min-h-0 flex-1 overflow-hidden bg-black/70", framed && "rounded-sm border border-white/15")}>
        {stageView}
        {cover}
        {overlay}
        {notice}
      </div>
      {transport}
    </>
  );
}

const retryButtonClass = "flex shrink-0 items-center gap-1 rounded-sm bg-white/10 px-1.5 py-0.5 font-medium text-white hover:bg-white/20 disabled:opacity-40";

/**
 * A 3D-only dungeon (no flat map) that is still loading or failed: a plain cover
 * instead of units on an empty ground. Under the map's controls (z-25), so the
 * frames and buttons stay usable.
 */
function DungeonCover({ player }: { player: ReplayPlayerState }) {
  const failed = player.dungeon3D.cover === "failed";
  return (
    <div className="absolute inset-0 z-[25] flex flex-col items-center justify-center gap-2 bg-black p-4 text-center text-xs text-white/75">
      {failed ? (
        <>
          <p className="font-medium text-white/90">{DUNGEON_3D_COPY.coverFailed}</p>
          <p>{DUNGEON_3D_COPY.coverFailedDetail}</p>
          <button type="button" onClick={player.retryDungeon} disabled={!player.dungeon3D.canRetry} className={retryButtonClass}>
            <RotateCcw className="h-3 w-3" />
            {DUNGEON_3D_COPY.retry}
          </button>
        </>
      ) : (
        <p className="flex items-center gap-1.5" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {DUNGEON_3D_COPY.coverLoading}
        </p>
      )}
    </div>
  );
}

/**
 * The 3D map failed and the flat map shows: a small notice under the top chips, with Retry and dismiss. One line,
 * truncated (the full sentence in its title), at most the stage's width less 3rem each side: clear of the right-hand
 * button column (Settings, Walk, Plan at right-2, w-7) and nowhere near the camera row at the bottom left.
 */
function DungeonNotice({ player, copy, placement }: { player: ReplayPlayerState; copy: "full" | "short"; placement: "top" | "below-controls" }) {
  const text = copy === "short" ? DUNGEON_3D_COPY.noticeShort : DUNGEON_3D_COPY.notice;
  return (
    <div
      role="status"
      title={DUNGEON_3D_COPY.notice}
      className={cn(
        "absolute left-1/2 z-40 flex max-w-[calc(100%-6rem)] -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-sm bg-black/80 py-0.5 pl-2 pr-0.5 text-[11px] text-white/80 shadow-[0_4px_16px_rgba(0,0,0,.5)]",
        // Below the mobile world's top row (3rem buttons at the safe-area top + 0.75rem), so they never overlap.
        placement === "below-controls" ? "top-[calc(max(0.75rem,env(safe-area-inset-top))+3.75rem)]" : "top-9",
      )}
    >
      <span className="min-w-0 truncate">{text}</span>
      <button type="button" onClick={player.retryDungeon} disabled={!player.dungeon3D.canRetry} className={retryButtonClass}>
        <RotateCcw className="h-3 w-3" />
        {DUNGEON_3D_COPY.retry}
      </button>
      <button
        type="button"
        onClick={player.dismissDungeonNotice}
        aria-label={DUNGEON_3D_COPY.dismiss}
        title={DUNGEON_3D_COPY.dismiss}
        className="grid h-5 w-5 shrink-0 place-items-center rounded-sm text-white/60 hover:bg-white/10 hover:text-white"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
