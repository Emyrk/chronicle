import { Video } from "@remotion/media";
import { AbsoluteFill, interpolate, spring, staticFile, useCurrentFrame } from "remotion";
import { LayoutPanelTop } from "lucide-react";
import { MeterCard, clamp } from "./shared";


export function PanelsScene() {
  const frame = useCurrentFrame();
  const damage = spring({ frame: frame - 30, fps: 30, config: { damping: 19 }, durationInFrames: 26 });
  const healing = spring({ frame: frame - 54, fps: 30, config: { damping: 19 }, durationInFrames: 26 });
  return (
    <AbsoluteFill className="bg-black" style={{ opacity: interpolate(frame, [0, 16], [0, 1], clamp) }}>
      <Video
        src={staticFile("maps3d/mandokir-overview.mp4")}
        muted
        trimBefore={60}
        objectFit="cover"
        className="absolute inset-0 size-full"
      />
      <div className="pointer-events-none absolute inset-0 z-40 bg-[linear-gradient(90deg,rgba(3,7,12,.94)_0%,rgba(3,7,12,.76)_28%,rgba(3,7,12,.1)_54%,transparent_72%),linear-gradient(0deg,rgba(3,7,12,.62),transparent_38%)]" />
      <div className="absolute left-12 top-24 z-50 w-[390px]" style={{ opacity: interpolate(frame, [14, 38], [0, 1], clamp) }}>
        <div className="text-[13px] font-bold uppercase tracking-[.28em] text-cyan-300">Analysis without context switching</div>
        <h2 className="mt-5 font-wow text-[64px] leading-[.92] text-white">Keep the meters<br />on the fight.</h2>
        <p className="mt-6 text-[18px] leading-relaxed text-zinc-300">Pin the panels you need while the encounter keeps moving underneath them.</p>
      </div>
      <MeterCard kind="damage" x={982} y={96} progress={damage} />
      <MeterCard kind="healing" x={982} y={302} progress={healing} />
      <div className="absolute bottom-8 left-12 z-50 flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-4 py-2 text-[12px] text-zinc-300 backdrop-blur"><LayoutPanelTop className="size-4 text-cyan-300" />DPS · HPS · deaths · interrupts · cooldowns</div>
      <div className="absolute bottom-8 right-8 z-50 rounded-full border border-white/10 bg-black/55 px-4 py-2 text-[12px] text-zinc-300 backdrop-blur">Bloodlord Mandokir · live 3D replay</div>
    </AbsoluteFill>
  );
}
