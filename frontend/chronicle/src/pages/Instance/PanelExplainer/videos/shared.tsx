/**
 * Shared helpers for explainer lesson compositions.
 *
 * Remotion markup rules apply throughout: every motion is frame-driven via
 * interpolate/spring on useCurrentFrame() — never CSS transitions/animations.
 */

import { useState, type ReactNode } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Play } from "lucide-react";
import { clamp, INTRO_FRAMES } from "./animation";
import { PortalContainerProvider } from "@/components/ui/PortalContainerContext";

/**
 * Composition root: dark stage, non-interactive content, and — crucially —
 * a LOCAL portal container so floating app UI (pinned breakouts) renders
 * inside the video frame instead of escaping to the page's portal root.
 */
export function VideoStage({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  return (
    <AbsoluteFill
      ref={setStage}
      className="dark pointer-events-none select-none overflow-hidden bg-background text-foreground"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_22%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent_38%)]" />
      <PortalContainerProvider container={stage}>{children}</PortalContainerProvider>
    </AbsoluteFill>
  );
}

/**
 * Scripted cursor with a click pulse (0..1). A standard OS-style arrow whose
 * TIP sits exactly at (x, y).
 */
export function Cursor({ x, y, clicking }: { x: number; y: number; clicking: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 24, height: 30, zIndex: 220 }}>
      <div
        className="border-primary"
        style={{
          position: "absolute",
          left: -17,
          top: -17,
          width: 34,
          height: 34,
          borderRadius: 999,
          borderWidth: 3,
          opacity: clicking,
          scale: interpolate(clicking, [0, 1], [0.45, 1.15]),
        }}
      />
      <svg
        viewBox="0 0 24 30"
        width="24"
        height="30"
        style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,.6))" }}
      >
        {/* Classic arrow pointer: tip at (0,0), straight left edge, angled base with tail. */}
        <path
          d="M0.5 0.5 L0.5 21 L5.5 16.5 L8.8 24.3 L12 23 L8.7 15.3 L15.5 15 Z"
          fill="white"
          stroke="black"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/** Pulsing highlight ring over a region (frame-driven, no CSS animation). */
export function RegionHighlight({
  left,
  top,
  width,
  height,
  color = "var(--color-class-rogue)",
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  color?: string;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Local frame inside a Sequence — pulse twice per second.
  const pulse = 0.5 + 0.5 * Math.sin((frame / fps) * Math.PI * 2);
  const appear = interpolate(frame, [0, 8], [0, 1], clamp);
  return (
    <div
      className="absolute rounded-md border-2"
      style={{
        left,
        top,
        width,
        height,
        borderColor: color,
        opacity: appear * interpolate(pulse, [0, 1], [0.45, 1]),
        zIndex: 210,
      }}
    />
  );
}

/** Numbered caption at the bottom of a lesson video. */
export function StepCaption({
  step,
  text,
  opacity,
}: {
  step: number;
  text: ReactNode;
  opacity: number;
}) {
  return (
    <div className="absolute bottom-20 left-[72px] flex items-center gap-4" style={{ opacity }}>
      <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-primary text-xl font-bold text-primary-foreground shadow-lg">
        {step}
      </div>
      <p className="text-[30px] font-bold tracking-tight">{text}</p>
    </div>
  );
}

/**
 * Opening title card: fully opaque at frame 0 so the paused player preview
 * shows the lesson's title and contents instead of a blank stage. Holds until
 * INTRO_FRAMES, fading out over the last 14 frames while the demo content
 * (mounted in a <Sequence from={INTRO_FRAMES - 10}>) enters underneath.
 */
export function LessonIntro({ title, bullets }: { title: string; bullets: ReactNode[] }) {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [INTRO_FRAMES - 14, INTRO_FRAMES], [1, 0], clamp);
  return (
    <AbsoluteFill
      className="bg-background"
      style={{
        opacity: fade,
        translate: `0 ${interpolate(fade, [0, 1], [-14, 0])}px`,
        zIndex: 230,
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_22%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent_38%)]" />
      <div className="absolute left-[72px] top-[128px]">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary">
          Chronicle quick tip
        </p>
        <h1 className="font-wow mt-1 text-[52px] font-bold tracking-tight">{title}</h1>
        <div className="mt-9 flex flex-col gap-5">
          {bullets.map((bullet, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-primary text-lg font-bold text-primary-foreground shadow-lg">
                {i + 1}
              </div>
              <p className="text-[26px] font-medium tracking-tight text-foreground">{bullet}</p>
            </div>
          ))}
        </div>
        <p className="mt-11 flex items-center gap-2 text-[15px] text-muted-foreground">
          <Play className="h-4 w-4" fill="currentColor" />
          Press play to watch
        </p>
      </div>
    </AbsoluteFill>
  );
}

/** Lesson video header (kicker + title). */
export function VideoHeader({
  title,
  entrance,
}: {
  title: string;
  entrance: number;
}) {
  return (
    <header
      className="absolute left-[72px] top-[42px]"
      style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [18, 0])}px` }}
    >
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary">
        Chronicle quick tip
      </p>
      <h1 className="font-wow mt-1 text-[40px] font-bold tracking-tight">{title}</h1>
    </header>
  );
}
