import { Video } from "@remotion/media";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Box, MapPinned } from "lucide-react";
import { FeaturePill, clamp, sceneOpacity } from "./shared";

export function MapRevealScene() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill className="bg-black" style={{ opacity: sceneOpacity(frame, 270) }}>
      <Video
        src={staticFile("maps3d/mandokir-overview.mp4")}
        muted
        objectFit="cover"
        className="absolute inset-0 size-full"
      />
      <div className="pointer-events-none absolute inset-0 z-40 bg-[linear-gradient(90deg,rgba(3,7,12,.96)_0%,rgba(3,7,12,.82)_25%,rgba(3,7,12,.18)_54%,transparent_75%),linear-gradient(0deg,rgba(3,7,12,.72),transparent_38%)]" />
      <div className="absolute left-12 top-24 z-50 w-[440px]" style={{ opacity: interpolate(frame, [18, 42], [0, 1], clamp) }}>
        <div className="text-[13px] font-bold uppercase tracking-[.28em] text-cyan-300">Real encounter geometry</div>
        <h2 className="mt-5 font-wow text-[68px] leading-[.92] tracking-tight text-white">The room<br />is the replay.</h2>
        <p className="mt-6 max-w-[370px] text-[19px] leading-relaxed text-zinc-300">Zul’Gurub’s actual terrain, reconstructed around a captured Bloodlord Mandokir kill.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <FeaturePill icon={<MapPinned className="size-4 text-cyan-300" />}>Real raid coordinates</FeaturePill>
          <FeaturePill icon={<Box className="size-4 text-violet-300" />}>Full 3D geometry</FeaturePill>
        </div>
      </div>
      <div className="absolute bottom-7 right-8 z-50 rounded-full border border-white/10 bg-black/55 px-4 py-2 text-[12px] text-zinc-300 backdrop-blur">Bloodlord Mandokir · 16 players · 43 seconds</div>
    </AbsoluteFill>
  );
}
