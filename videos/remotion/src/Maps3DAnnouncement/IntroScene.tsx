import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Box, Footprints, Play } from "lucide-react";
import { Backdrop, Brand, FeaturePill, clamp, sceneOpacity } from "./shared";

export function IntroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 18, stiffness: 90 }, durationInFrames: 38 });
  const icon = spring({ frame: frame - 20, fps, config: { damping: 14, stiffness: 120 }, durationInFrames: 32 });
  return (
    <AbsoluteFill style={{ opacity: sceneOpacity(frame, 145) }}>
      <Backdrop />
      <Brand eyebrow="New feature" />
      <Img src={staticFile("c/images/loadingscreens/LoadScreenWailingCaverns.webp")} className="absolute inset-0 h-full w-full object-cover opacity-[.13] mix-blend-luminosity" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_10%,#06080d_72%)]" />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="relative mb-6" style={{ scale: icon, rotate: `${interpolate(icon, [0, 1], [-18, 0])}deg` }}>
          <div className="absolute inset-0 rounded-[28px] bg-cyan-300/25 blur-2xl" />
          <div className="relative grid size-24 place-items-center rounded-[28px] border border-cyan-200/30 bg-cyan-300/10 shadow-[inset_0_1px_0_rgba(255,255,255,.14)]"><Box className="size-12 text-cyan-200" /></div>
        </div>
        <h1 className="font-wow text-[82px] leading-[.92] tracking-tight" style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [34, 0])}px` }}>Raid maps.<br /><span className="text-cyan-200">Now in 3D.</span></h1>
        <p className="mt-6 text-[23px] text-zinc-400" style={{ opacity: interpolate(frame, [34, 58], [0, 1], clamp) }}>Walk the fight. Read the raid. Replay every second.</p>
        <div className="mt-8 flex gap-3" style={{ opacity: interpolate(frame, [56, 82], [0, 1], clamp) }}>
          <FeaturePill icon={<Footprints className="size-4 text-cyan-300" />}>Walking mode</FeaturePill>
          <FeaturePill icon={<Box className="size-4 text-violet-300" />}>3D combat view</FeaturePill>
          <FeaturePill icon={<Play className="size-4 fill-emerald-300 text-emerald-300" />}>Full replay</FeaturePill>
        </div>
      </div>
    </AbsoluteFill>
  );
}
