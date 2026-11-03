import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SyncModeProvider, useSyncModeContext } from "../../SyncModeContext";
import type { PanelRenderProps } from "../types";
import type { PublishedUnitModelUrls } from "./bossMinis";
import type { DirectorUnit } from "./cameraDirector";
import { buildDroneTrack, dronePoseAt, fightMsAtVideoMs, RENDER_SPEEDS, speedFileName, videoFrameRange, type RenderSpeed } from "./droneCamera";
import type { MapResult } from "./map.processor";
import { FULL_MAP_VIEWPORT, replayPositionAt, type ReplayMapSource } from "./mapModel";
import type { DungeonMeshRequest, DungeonMeshState, MapScene3D } from "./MapScene3D";
import type { EffectSettings } from "./mapViewSettings";
import MapView3D from "./MapView3D";
import { isDeadAt } from "./replayEffects";
import { useMapScene } from "./useMapScene";
import { exportCanvasVideo, pickVideoOutput, VIDEO_FPS, type CanvasVideoExportResult, type VideoOutputConfig } from "./videoExport";

/** Longest a frame waits for lazily loaded art (icons, minis) before it is drawn without it. */
const ASSET_WAIT_MS = 10_000;
const ASSET_POLL_MS = 50;

export interface VideoRenderResult extends CanvasVideoExportResult {
  frameCount: number;
}

export interface VideoRenderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The Map panel's props: the processed encounter the video replays. */
  panelProps: PanelRenderProps<MapResult>;
  mapSource?: ReplayMapSource;
  showHiddenUnits?: boolean;
  dungeonMesh: DungeonMeshRequest;
  unitModelUrls?: PublishedUnitModelUrls;
  effectSettings?: EffectSettings;
  /** The boss, for the title. */
  title: string;
  /** The download's file name (…mp4). */
  fileName: string;
  /** Render only this slice of the video (ms into the output video, after speed-up); the whole fight otherwise. For tests and capture scripts. */
  range?: { fromMs: number; toMs: number } | null;
  /** Called with the finished video. */
  onRendered?: (result: VideoRenderResult) => void;
}

type RenderProgress =
  | { phase: "preparing"; detail: string }
  | { phase: "rendering"; done: number; total: number; startedAt: number; lastFrameAt: number; pausedMs: number; pausedAt: number | null }
  | { phase: "done"; result: VideoRenderResult; url: string }
  | { phase: "error"; message: string };

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * "Render video": replays one boss fight off screen at a fixed output size
 * with the drone camera, and encodes it to MP4 in the browser. The canvas
 * shows each frame as it is drawn but takes no input.
 *
 * The render starts as soon as the dialog opens; changing the speed restarts
 * it (the loaded scene and dungeon mesh are kept).
 */
export default function VideoRenderDialog({ open, onOpenChange, title, fileName: baseFileName, ...stageProps }: VideoRenderDialogProps) {
  const [output, setOutput] = useState<VideoOutputConfig | null>(null);
  const [progress, setProgress] = useState<RenderProgress>({ phase: "preparing", detail: "Checking video encoding…" });
  const [speed, setSpeed] = useState<RenderSpeed>(1);
  const rendering = progress.phase === "rendering" || progress.phase === "preparing";
  const fileName = speedFileName(baseFileName, speed);

  const changeSpeed = (next: RenderSpeed) => {
    if (next === speed) return;
    setSpeed(next);
    // A finished video belongs to the old speed: render again (the stage remounts).
    if (progress.phase === "done") setProgress({ phase: "preparing", detail: "Loading the fight…" });
  };

  useEffect(() => {
    let cancelled = false;
    void pickVideoOutput().then((config) => {
      if (cancelled) return;
      if (config) setOutput(config);
      else setProgress({ phase: "error", message: "This browser cannot encode video (WebCodecs H.264, VP9 or AV1)." });
    }, (error: unknown) => {
      if (!cancelled) setProgress({ phase: "error", message: String(error) });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const doneUrl = progress.phase === "done" ? progress.url : null;
  useEffect(() => () => {
    if (doneUrl) URL.revokeObjectURL(doneUrl);
  }, [doneUrl]);

  const file = progress.phase === "done" ? new File([progress.result.blob], fileName, { type: "video/mp4" }) : null;
  const canShare = file !== null && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

  let status: React.ReactNode = null;
  if (progress.phase === "preparing") {
    status = <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />{progress.detail}</span>;
  } else if (progress.phase === "rendering") {
    const elapsed = progress.lastFrameAt - progress.startedAt - progress.pausedMs;
    const eta = progress.done > 0 ? (elapsed / progress.done) * (progress.total - progress.done) : null;
    status = (
      <span>
        {speed}× · Frame {progress.done} / {progress.total}
        {eta !== null && <> · about {formatDuration(eta)} left</>}
        {progress.pausedAt !== null && <span className="text-amber-300"> · paused while this tab is hidden</span>}
      </span>
    );
  } else if (progress.phase === "done") {
    const { result } = progress;
    status = (
      <span>
        {result.width}×{result.height} · {speed}× · {result.codec.toUpperCase()} · {result.frameCount} frames · {(result.blob.size / 1e6).toFixed(1)} MB · rendered in {formatDuration(result.elapsedMs)}
      </span>
    );
  } else {
    status = <span className="text-destructive">{progress.message}</span>;
  }

  const fraction = progress.phase === "rendering" ? progress.done / Math.max(1, progress.total) : progress.phase === "done" ? 1 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[min(960px,calc(100vw-2rem))] gap-3"
        // An outside click must not throw away a long render; Esc and Cancel still close.
        onInteractOutside={(event) => {
          if (rendering) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Render video · {title}</DialogTitle>
          <DialogDescription>
            The whole fight with an automatic drone camera, encoded to MP4 in your browser.
          </DialogDescription>
        </DialogHeader>
        {/* The frames as they render: CSS-scaled from the fixed output size, no input. */}
        <div className="pointer-events-none relative aspect-video w-full select-none overflow-hidden rounded-sm border border-white/10 bg-black" aria-hidden>
          {output && progress.phase !== "error" && progress.phase !== "done" && (
            <SyncModeProvider>
              <RenderStage {...stageProps} output={output} speed={speed} onProgress={setProgress} />
            </SyncModeProvider>
          )}
          {doneUrl && (
            <div className="absolute inset-0 grid place-items-center text-sm text-white/70">Done: download the MP4 below.</div>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Speed</span>
          <div className="flex gap-1" role="radiogroup" aria-label="Video speed">
            {RENDER_SPEEDS.map((option) => (
              <Button
                key={option}
                role="radio"
                aria-checked={option === speed}
                variant={option === speed ? "default" : "outline"}
                size="sm"
                className="h-7 px-2.5"
                disabled={progress.phase === "error"}
                onClick={() => changeSpeed(option)}
              >
                {option}×
              </Button>
            ))}
          </div>
          <span>{speed === 1 ? "Real time" : "Shorter video, quicker render"}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-primary transition-[width]" style={{ width: `${fraction * 100}%` }} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          {status}
          <div className="flex items-center gap-2">
            {progress.phase === "done" ? (
              <>
                {canShare && file && (
                  <Button variant="outline" size="sm" onClick={() => void navigator.share({ files: [file], title }).catch(() => {})}>
                    <Share2 className="h-3.5 w-3.5" />
                    Share
                  </Button>
                )}
                <Button asChild size="sm">
                  <a href={progress.url} download={fileName}>
                    <Download className="h-3.5 w-3.5" />
                    Download MP4
                  </a>
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                {rendering ? "Cancel" : "Close"}
              </Button>
            )}
          </div>
        </div>
        {rendering && (
          <p className="text-[11px] text-muted-foreground">
            Keep this tab open and visible: browsers stop rendering in background tabs, so the render pauses until you come back.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface RenderStageProps extends Omit<VideoRenderDialogProps, "open" | "onOpenChange" | "title" | "fileName"> {
  output: VideoOutputConfig;
  speed: RenderSpeed;
  onProgress: (progress: RenderProgress) => void;
}

// The capture scene and its frame loop, under a replay clock of its own (the
// dialog's SyncModeProvider) so the page behind it never re-renders per frame.
function RenderStage({ panelProps, mapSource, showHiddenUnits, dungeonMesh, unitModelUrls, effectSettings, range = null, onRendered, output, speed, onProgress }: RenderStageProps) {
  const { enable, setTimestamp } = useSyncModeContext();
  const scene = useMapScene(panelProps, { rawDungeonProjection: true, mapSource, showHiddenUnits });
  const ready = scene.status === "ready" ? scene : null;
  const [meshState, setMeshState] = useState<DungeonMeshState>("loading");
  const [scene3d, setScene3d] = useState<MapScene3D | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(ready);
  const waiterRef = useRef<{ ms: number; resolve: () => void } | null>(null);
  const onProgressRef = useRef(onProgress);
  const onRenderedRef = useRef(onRendered);

  const startMs = ready?.encounterStartMs ?? null;
  useEffect(() => {
    if (startMs === null) return;
    enable();
    setTimestamp(new Date(startMs));
  }, [enable, setTimestamp, startMs]);

  // After MapView3D's effects (a child's run first): the scene has this
  // commit's units, effects clock and settings once a waiter is released.
  useEffect(() => {
    readyRef.current = ready;
    onProgressRef.current = onProgress;
    onRenderedRef.current = onRendered;
    const waiter = waiterRef.current;
    if (waiter && ready?.cursorMs === waiter.ms) {
      waiterRef.current = null;
      waiter.resolve();
    }
  });

  // Resolves once the replay at `ms` (absolute) is committed to the scene.
  const showReplayAt = useCallback((ms: number) => new Promise<void>((resolve) => {
    if (readyRef.current?.cursorMs === ms) {
      resolve();
      return;
    }
    waiterRef.current = { ms, resolve };
    setTimestamp(new Date(ms));
  }), [setTimestamp]);

  // Latched: the replay leaves the pull as soon as the render starts.
  const [prepared, setPrepared] = useState(false);
  if (!prepared && ready !== null && ready.cursorMs === startMs && meshState === "ready" && scene3d !== null) setPrepared(true);
  useEffect(() => {
    if (meshState === "failed") onProgressRef.current({ phase: "error", message: "The dungeon mesh failed to load." });
    else if (!prepared) onProgressRef.current({ phase: "preparing", detail: meshState === "loading" ? "Loading the dungeon…" : "Loading the fight…" });
  }, [meshState, prepared]);

  useEffect(() => {
    if (!prepared || !scene3d) return;
    const fight = readyRef.current;
    const canvas = containerRef.current?.querySelector("canvas");
    const input = scene3d.droneInput();
    if (!fight || !canvas || !input) return;
    const controller = new AbortController();
    const { signal } = controller;
    onProgressRef.current({ phase: "preparing", detail: "Planning the camera…" });

    const run = async () => {
      const fightMs = Math.max(0, fight.encounterEndMs - fight.encounterStartMs);
      const tracked = fight.markers.filter((marker) => marker.kind === "player" || fight.bossGuids.has(marker.guid));
      const track = buildDroneTrack({
        durationMs: fightMs,
        scale: input.scale,
        aspect: output.width / output.height,
        probe: input.probe,
        speed,
        unitsAt: (ms) => {
          const at = fight.encounterStartMs + ms;
          return tracked.flatMap((marker): DirectorUnit[] => {
            const sample = replayPositionAt(marker.positions, at, marker.kind === "player");
            const point = sample ? fight.projectSample(sample) : null;
            if (!point) return [];
            const { x, z } = input.toPlane(point);
            return [{ guid: marker.guid, x, z, player: marker.kind === "player", boss: fight.bossGuids.has(marker.guid), dead: isDeadAt(fight.effects, marker.guid, at) }];
          });
        },
      });
      if (!track) throw new Error("Nobody in this fight has position data to film.");

      const { firstFrame, frameCount } = videoFrameRange(fightMs, speed, VIDEO_FPS, range);
      let progress: Extract<RenderProgress, { phase: "rendering" }> = { phase: "rendering", done: 0, total: frameCount, startedAt: performance.now(), lastFrameAt: 0, pausedMs: 0, pausedAt: null };
      onProgressRef.current(progress);

      const result = await exportCanvasVideo({
        canvas,
        fps: VIDEO_FPS,
        frameCount,
        codec: output.codec,
        bitrate: output.bitrate,
        signal,
        renderFrame: async (index) => {
          // `ms` is video time: the camera and animations run in it; the replay steps `speed` times as fast.
          const ms = ((firstFrame + index) * 1000) / VIDEO_FPS;
          // Whole milliseconds: the replay clock is a Date.
          await showReplayAt(Math.round(fight.encounterStartMs + fightMsAtVideoMs(ms, speed, fightMs)));
          if (signal.aborted) return;
          const pose = dronePoseAt(track, ms);
          scene3d.captureFrame(pose, ms);
          // Lazily loaded art (icons, minis): redraw until it is all in.
          for (let waited = 0; scene3d.pendingAssets() > 0 && waited < ASSET_WAIT_MS && !signal.aborted; waited += ASSET_POLL_MS) {
            await sleep(ASSET_POLL_MS);
            scene3d.captureFrame(pose, ms);
          }
        },
        onProgress: (done) => {
          progress = { ...progress, done, lastFrameAt: performance.now() };
          onProgressRef.current(progress);
        },
        onPausedChange: (paused) => {
          const now = performance.now();
          progress = paused
            ? { ...progress, pausedAt: now }
            : { ...progress, pausedAt: null, pausedMs: progress.pausedMs + (now - (progress.pausedAt ?? now)) };
          onProgressRef.current(progress);
        },
      });
      const rendered = { ...result, frameCount };
      onRenderedRef.current?.(rendered);
      onProgressRef.current({ phase: "done", result: rendered, url: URL.createObjectURL(result.blob) });
    };
    run().catch((error: unknown) => {
      if (signal.aborted) return;
      onProgressRef.current({ phase: "error", message: error instanceof Error ? error.message : String(error) });
    });
    // Closing the dialog (Cancel, Esc) unmounts the stage: the encoder is
    // cancelled here and MapView3D disposes the capture scene.
    return () => {
      controller.abort();
      // Release a frame waiting on a commit that will never come, so the
      // export loop sees the abort and cancels the encoder.
      waiterRef.current?.resolve();
      waiterRef.current = null;
    };
    // The render runs once per prepared stage and speed; range and output are fixed for its life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepared, speed]);

  if (!ready) return null;
  return (
    <div ref={containerRef} className="absolute inset-0">
      <MapView3D
        ground={ready.ground}
        worldMapId={ready.worldMapId}
        markers={ready.markers}
        projectSample={ready.projectSample}
        cursorMs={ready.cursorMs}
        playing={false}
        playbackSpeed={1}
        view={STATIC_VIEW}
        effects={ready.effects}
        bossGuids={ready.bossGuids}
        tankGuids={ready.tankGuids}
        unitModelUrls={unitModelUrls}
        onUnavailable={() => onProgressRef.current({ phase: "error", message: "WebGL is unavailable." })}
        dungeonMesh={dungeonMesh}
        onDungeonMeshState={setMeshState}
        effectSettings={effectSettings}
        debuffSpellIds={ready.debuffSpellIds}
        capture={output}
        onScene={setScene3d}
      />
    </div>
  );
}

// The drone places the camera itself; the view request only seeds the scene.
const STATIC_VIEW = { viewport: FULL_MAP_VIEWPORT, key: "video" };
