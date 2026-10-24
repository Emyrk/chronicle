import { Video } from "@remotion/media";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Activity } from "lucide-react";
import { clamp, sceneOpacity } from "./shared";

export function CombatScene() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill className="bg-black" style={{ opacity: sceneOpacity(frame, 236) }}>
      <Video
        src={staticFile("maps3d/gahzranka-slam.mp4")}
        muted
        objectFit="cover"
        className="absolute inset-0 size-full"
      />
      <div className="pointer-events-none absolute inset-0 z-40 bg-[linear-gradient(90deg,rgba(3,7,12,.94)_0%,rgba(3,7,12,.72)_27%,rgba(3,7,12,.12)_50%,transparent_70%),linear-gradient(0deg,rgba(3,7,12,.58),transparent_36%)]" />
      <div className="absolute left-12 top-24 z-50 w-[390px]" style={{ opacity: interpolate(frame, [14, 38], [0, 1], clamp) }}>
        <div className="text-[13px] font-bold uppercase tracking-[.28em] text-amber-300">Combat, in context</div>
        <h2 className="mt-5 font-wow text-[64px] leading-[.92] text-white">See where they stood.<br />See where they landed.</h2>
        <p className="mt-6 text-[19px] leading-relaxed text-zinc-200">Every position, launch, health change, and spell effect—preserved at the exact replay timestamp.</p>
      </div>
      <div className="absolute bottom-8 right-8 z-50 flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-4 py-2 text-[12px] text-zinc-300 backdrop-blur">
        <Activity className="size-4 text-amber-300" />Gahz&apos;ranka Slam · real replay positions
      </div>
    </AbsoluteFill>
  );
}
