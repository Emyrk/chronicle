/**
 * Shared helpers for explainer lesson compositions.
 *
 * Remotion markup rules apply throughout: every motion is frame-driven via
 * interpolate/spring on useCurrentFrame() — never CSS transitions/animations.
 */

import { useState, type ReactNode } from "react";
import { AbsoluteFill, interpolate } from "remotion";
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

/** Scripted cursor with a click pulse (0..1). */
export function Cursor({ x, y, clicking }: { x: number; y: number; clicking: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 34, height: 42, zIndex: 220 }}>
      <div
        className="border-primary"
        style={{
          position: "absolute",
          left: -13,
          top: -13,
          width: 50,
          height: 50,
          borderRadius: 999,
          borderWidth: 3,
          opacity: clicking,
          scale: interpolate(clicking, [0, 1], [0.45, 1.15]),
        }}
      />
      <svg
        viewBox="0 0 32 40"
        width="32"
        height="40"
        style={{ filter: "drop-shadow(0 4px 5px rgba(0,0,0,.65))" }}
      >
        <path
          d="M3 2L27 23H16L12 36L6 33L10 21H3V2Z"
          fill="white"
          stroke="black"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
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
