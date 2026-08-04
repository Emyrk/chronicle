/**
 * Placeholder composition for lessons that don't have a video yet.
 */

import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

export function ComingSoonVideo({ title }: { title?: string }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20], [0, 1], clamp);

  return (
    <AbsoluteFill className="dark bg-background text-foreground overflow-hidden">
      <div className="flex flex-col items-center justify-center h-full gap-3" style={{ opacity }}>
        <div className="text-3xl">🎬</div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">Video walkthrough coming soon</p>
      </div>
    </AbsoluteFill>
  );
}
