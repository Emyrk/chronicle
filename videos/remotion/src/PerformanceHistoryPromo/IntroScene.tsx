import { ChartSpline, GitCompareArrows, Share2, SlidersHorizontal } from "lucide-react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Brand, Pill, clamp, sceneOpacity } from "./shared";

export function IntroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 18, stiffness: 95 }, durationInFrames: 38 });
  const icon = spring({ frame: frame - 28, fps, config: { damping: 12, stiffness: 120 }, durationInFrames: 32 });

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity(frame, 155) }}>
      <Brand />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div
          className="mb-7 grid size-24 place-items-center rounded-3xl border border-sky-300/30 bg-sky-300/10 shadow-[0_0_80px_rgba(56,189,248,.25)]"
          style={{ scale: icon, rotate: `${interpolate(icon, [0, 1], [-14, 0])}deg` }}
        >
          <ChartSpline className="size-12 text-sky-300" />
        </div>
        <h1
          className="max-w-5xl font-wow text-[82px] leading-[0.96] tracking-tight"
          style={{
            opacity: entrance,
            translate: `0 ${interpolate(entrance, [0, 1], [34, 0], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) })}px`,
          }}
        >
          Your performance.<br />Now in context.
        </h1>
        <p className="mt-7 text-2xl text-zinc-400" style={{ opacity: interpolate(frame, [30, 56], [0, 1], clamp) }}>
          Follow every raid night, compare players, and share the full story.
        </p>
        <div className="mt-9 flex gap-3" style={{ opacity: interpolate(frame, [52, 78], [0, 1], clamp) }}>
          <Pill icon={<GitCompareArrows className="size-4 text-sky-400" />}>Compare players</Pill>
          <Pill icon={<SlidersHorizontal className="size-4 text-violet-400" />}>Filter every run</Pill>
          <Pill icon={<Share2 className="size-4 text-emerald-400" />}>Share the view</Pill>
        </div>
      </div>
    </AbsoluteFill>
  );
}
