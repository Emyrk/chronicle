import { ChartSpline, Compass } from "lucide-react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp } from "./shared";

export function FinaleScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 18 }, durationInFrames: 34 });
  const pulse = interpolate(frame, [58, 78, 98], [1, 1.08, 1], clamp);

  return (
    <AbsoluteFill style={{ opacity: interpolate(frame, [0, 18], [0, 1], clamp) }}>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <Img
          src={staticFile("c/chronicle/ChronicleLogoCenter.svg")}
          className="mb-9 w-[420px]"
          style={{ opacity: entrance, scale: interpolate(entrance, [0, 1], [0.9, 1]) }}
        />
        <h2 className="font-wow text-[68px] leading-none">Performance History is live.</h2>
        <p className="mt-6 text-2xl text-zinc-400">Turn raid nights into a trend you can understand and share.</p>
        <div
          className="mt-9 flex items-center gap-3 rounded-full border border-sky-300/30 bg-sky-300/10 px-7 py-3.5 text-xl text-sky-100 shadow-[0_0_45px_rgba(56,189,248,.14)]"
          style={{ scale: pulse }}
        >
          <Compass className="size-6 text-sky-300" />
          Explore <span className="text-zinc-500">›</span> <ChartSpline className="size-5 text-sky-300" /> Performance
        </div>
      </div>
      <div className="absolute bottom-8 inset-x-0 text-center text-sm uppercase tracking-[.28em] text-zinc-600">chronicle.game</div>
    </AbsoluteFill>
  );
}
