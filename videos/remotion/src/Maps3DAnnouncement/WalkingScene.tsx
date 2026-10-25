import { Video } from "@remotion/media";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Eye, MousePointer2 } from "lucide-react";
import { clamp, sceneOpacity } from "./shared";

export function WalkingScene() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill className="bg-black" style={{ opacity: sceneOpacity(frame, 149) }}>
      <Video
        src={staticFile("maps3d/hakkar-first-person.mp4")}
        muted
        objectFit="cover"
        className="absolute inset-0 size-full"
      />
      <div className="pointer-events-none absolute inset-0 z-40 bg-[linear-gradient(90deg,rgba(3,7,12,.94)_0%,rgba(3,7,12,.69)_28%,rgba(3,7,12,.12)_55%,transparent_72%),linear-gradient(0deg,rgba(3,7,12,.58),transparent_35%)]" />
      <div className="absolute left-12 top-24 z-50 w-[400px]" style={{ opacity: interpolate(frame, [16, 40], [0, 1], clamp) }}>
        <div className="text-[13px] font-bold uppercase tracking-[.28em] text-cyan-300">First-person view</div>
        <h2 className="mt-5 font-wow text-[66px] leading-[.92] text-white">Stand inside<br />the replay.</h2>
        <p className="mt-6 max-w-[350px] text-[19px] leading-relaxed text-zinc-200">Drop to ground level and inspect the encounter from a player&apos;s point of view.</p>
      </div>
      <div className="absolute bottom-8 left-12 z-50 flex items-center gap-4 rounded-2xl border border-white/10 bg-black/65 p-4 shadow-2xl backdrop-blur" style={{ opacity: interpolate(frame, [30, 54], [0, 1], clamp) }}>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.18em] text-cyan-200"><Eye className="size-4" />First person</div>
        <div className="flex h-9 items-center gap-2 rounded-md border border-white/15 bg-black/55 px-3 text-[12px] text-zinc-300"><MousePointer2 className="size-4" />Look around</div>
      </div>
      <div className="absolute bottom-8 right-8 z-50 rounded-full border border-white/10 bg-black/55 px-4 py-2 text-[12px] text-zinc-300 backdrop-blur">Zul&apos;Gurub · Hakkar</div>
    </AbsoluteFill>
  );
}
