import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Box, Footprints, Play, Swords } from "lucide-react";
import { Backdrop, FeaturePill, clamp } from "./shared";

export function FinaleScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 18 }, durationInFrames: 34 });
  return (
    <AbsoluteFill style={{ opacity: interpolate(frame, [0, 18], [0, 1], clamp) }}>
      <Backdrop />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <Img src={staticFile("c/chronicle/ChronicleLogoCenter.svg")} className="mb-8 w-[390px]" style={{ opacity: entrance, scale: interpolate(entrance, [0, 1], [.9, 1], clamp) }} />
        <h2 className="font-wow text-[66px] leading-none">Your raid, from every angle.</h2>
        <p className="mt-5 text-[22px] text-zinc-400">3D maps are here on Chronicle.</p>
        <div className="mt-8 flex gap-3" style={{ opacity: interpolate(frame, [28, 54], [0, 1], clamp) }}>
          <FeaturePill icon={<Footprints className="size-4 text-cyan-300" />}>Walk it</FeaturePill>
          <FeaturePill icon={<Swords className="size-4 text-rose-300" />}>Analyze it</FeaturePill>
          <FeaturePill icon={<Play className="size-4 fill-emerald-300 text-emerald-300" />}>Replay it</FeaturePill>
        </div>
        <div className="mt-9 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[.25em] text-cyan-300" style={{ opacity: interpolate(frame, [54, 78], [0, 1], clamp) }}><Box className="size-4" />chronicleclassic.com</div>
      </div>
    </AbsoluteFill>
  );
}
