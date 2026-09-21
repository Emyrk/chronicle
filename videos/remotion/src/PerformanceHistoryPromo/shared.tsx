import type { ReactNode } from "react";
import { AbsoluteFill, Img, interpolate, staticFile } from "remotion";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const sceneOpacity = (frame: number, duration: number) =>
  interpolate(frame, [0, 18, duration - 18, duration], [0, 1, 1, 0], clamp);

export function Backdrop() {
  return (
    <AbsoluteFill className="overflow-hidden bg-[#060a11] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_20%,rgba(14,165,233,0.2),transparent_36%),radial-gradient(circle_at_84%_78%,rgba(168,85,247,0.16),transparent_34%)]" />
      <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/70 to-transparent" />
    </AbsoluteFill>
  );
}

export function Brand() {
  return (
    <div className="absolute left-12 top-9 z-20 flex items-center gap-3">
      <Img src={staticFile("c/chronicle/ChronicleIcon.png")} className="size-11" />
      <span className="font-wow text-2xl tracking-wide text-white">Chronicle</span>
    </div>
  );
}

export function Pill({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-base text-zinc-300 shadow-lg backdrop-blur">
      {icon}
      {children}
    </div>
  );
}

export function AppWindow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-white/10 bg-[#0c111a] shadow-[0_32px_100px_rgba(0,0,0,.6)] ${className}`}>
      <div className="flex h-11 items-center gap-2 border-b border-white/10 bg-black/20 px-4">
        <span className="size-2.5 rounded-full bg-red-400/70" />
        <span className="size-2.5 rounded-full bg-amber-300/70" />
        <span className="size-2.5 rounded-full bg-emerald-400/70" />
        <div className="ml-4 flex-1 rounded-md bg-white/[0.05] px-4 py-1.5 text-center text-xs text-zinc-500">
          chronicle.game/performance-history
        </div>
      </div>
      {children}
    </div>
  );
}

export type PointShape = "circle" | "diamond" | "square" | "triangle";

export function SpecShape({ shape, color, size = 12 }: { shape: PointShape; color: string; size?: number }) {
  const clipPath = shape === "diamond"
    ? "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)"
    : shape === "square"
      ? "inset(0 round 1px)"
      : shape === "triangle"
        ? "polygon(50% 0%, 100% 100%, 0% 100%)"
        : "circle(50%)";

  return <span style={{ width: size, height: size, backgroundColor: color, clipPath }} className="inline-block shrink-0 shadow-[0_0_10px_currentColor]" />;
}
