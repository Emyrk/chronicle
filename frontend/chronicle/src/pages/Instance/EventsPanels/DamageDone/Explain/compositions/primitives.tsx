/**
 * Shared Remotion visual primitives for Explain lesson compositions.
 *
 * Cursor, step label — reused across all lesson videos.
 * Hooks and constants live in ./hooks.ts for react-refresh compatibility.
 */

import { interpolate } from "remotion";

/** Animated cursor with click pulse. */
export function Cursor({ x, y, clicking }: { x: number; y: number; clicking: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 34, height: 42, zIndex: 220, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: -13,
          top: -13,
          width: 50,
          height: 50,
          borderRadius: 999,
          border: "3px solid hsl(var(--primary))",
          opacity: clicking,
          scale: interpolate(clicking, [0, 1], [0.45, 1.15]),
        }}
      />
      <svg viewBox="0 0 32 40" width="28" height="36" style={{ filter: "drop-shadow(0 3px 4px rgba(0,0,0,.6))" }}>
        <path d="M3 2L27 23H16L12 36L6 33L10 21H3V2Z" fill="white" stroke="black" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Animated step label with number badge. */
export function StepLabel({
  step,
  text,
  opacity,
}: {
  step: number;
  text: string;
  opacity: number;
}) {
  return (
    <div
      className="absolute bottom-4 left-5 flex items-center gap-3"
      style={{ opacity }}
    >
      <div className="grid h-8 w-8 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-md">
        {step}
      </div>
      <p className="text-base font-semibold tracking-tight">{text}</p>
    </div>
  );
}
