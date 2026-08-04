/**
 * Plays a lesson's Remotion composition via @remotion/player.
 *
 * Bundle rule: NOTHING here may statically import remotion or a composition —
 * the Player and the composition module both load lazily so the instance-page
 * chunk stays remotion-free until a video lesson is actually opened.
 */

import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import type { LessonVideo } from "./types";

const RemotionPlayer = lazy(() =>
  import("@remotion/player").then((m) => ({ default: m.Player })),
);

export function LessonPlayer({ video, lessonId }: { video: LessonVideo; lessonId: string }) {
  // Keyed by the video object: a stale entry simply renders the skeleton, so
  // no synchronous reset is needed when the lesson changes.
  const [loaded, setLoaded] = useState<{
    video: LessonVideo;
    component: ComponentType;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    video.load().then((m) => {
      if (!cancelled) setLoaded({ video, component: m.default });
    });
    return () => {
      cancelled = true;
    };
  }, [video, lessonId]);

  const composition = loaded?.video === video ? loaded.component : null;

  return (
    <div className="w-full max-w-[960px]">
      <div className="aspect-video w-full overflow-hidden rounded-md border border-border bg-muted">
        {composition ? (
          <Suspense fallback={<PlayerSkeleton />}>
            <RemotionPlayer
              component={composition}
              durationInFrames={video.durationInFrames}
              fps={video.fps}
              compositionWidth={video.width}
              compositionHeight={video.height}
              controls
              loop
              style={{ width: "100%" }}
            />
          </Suspense>
        ) : (
          <PlayerSkeleton />
        )}
      </div>
    </div>
  );
}

function PlayerSkeleton() {
  return (
    <div className="grid h-full w-full place-items-center">
      <span className="font-mono text-[11px] text-muted-foreground">Loading lesson video…</span>
    </div>
  );
}
