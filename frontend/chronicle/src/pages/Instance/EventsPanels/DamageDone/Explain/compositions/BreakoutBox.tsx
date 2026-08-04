/**
 * "The Breakout Box" lesson composition.
 *
 * Animates a cursor clicking a player row, then shows an ability
 * breakdown panel appearing with ability bars and hit stats.
 */

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, spring } from "remotion";
import { Cursor, StepLabel } from "./primitives";
import { clamp, useClickPulse } from "./hooks";

const ABILITIES = [
  { name: "Frostbolt", value: 145000, pct: 59.2, color: "#69CCF0" },
  { name: "Ice Lance", value: 55000, pct: 22.4, color: "#69CCF0" },
  { name: "Cone of Cold", value: 45000, pct: 18.4, color: "#69CCF0" },
];

export function BreakoutBoxVideo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phase 1: cursor moves to player row (frames 10-50)
  const cursorX = interpolate(frame, [10, 50], [340, 160], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
  const cursorY = interpolate(frame, [10, 50], [20, 52], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
  const clickPulse = useClickPulse(55);

  // Phase 2: breakout panel slides in (frames 65-100)
  const breakoutEntrance = spring({ frame, fps, config: { damping: 200 }, delay: 65, durationInFrames: 25 });
  const showBreakout = frame >= 65;

  // Step progression
  const step = frame < 55 ? 1 : frame < 130 ? 2 : 3;
  const stepText = step === 1
    ? "Click a player row to see their breakdown"
    : step === 2
      ? "The Breakout Box shows damage by ability"
      : "Switch to 'By Target' for target breakdown";

  const labelOpacity = interpolate(frame, [5, 15], [0, 1], clamp);

  // Simulated player row
  const rowHighlight = interpolate(frame, [45, 55, 65], [0, 0.15, 0], clamp);

  return (
    <AbsoluteFill className="dark bg-background text-foreground overflow-hidden">
      {/* Simplified player bar */}
      <div className="absolute top-6 left-5 right-5">
        <div
          className="flex items-center gap-2 px-2 py-1.5 rounded"
          style={{ backgroundColor: `rgba(105, 204, 240, ${0.08 + rowHighlight})` }}
        >
          <span className="text-xs text-muted-foreground font-mono">#1</span>
          <div className="flex-1 h-6 rounded overflow-hidden bg-muted/20">
            <div className="h-full rounded" style={{ width: "92%", backgroundColor: "#69CCF0", opacity: 0.85 }} />
          </div>
          <span className="text-xs font-medium">Frostweaver</span>
          <span className="text-xs text-muted-foreground font-mono">245k</span>
        </div>
      </div>

      {/* Breakout panel */}
      {showBreakout && (
        <div
          className="absolute top-16 left-5 right-5 rounded-lg border bg-card p-3"
          style={{
            opacity: breakoutEntrance,
            translate: `0 ${interpolate(breakoutEntrance, [0, 1], [12, 0])}px`,
          }}
        >
          {/* Tabs */}
          <div className="flex gap-2 mb-2">
            <span className="text-xs font-semibold text-primary border-b border-primary pb-0.5">By Ability</span>
            <span className="text-xs text-muted-foreground pb-0.5">By Target</span>
          </div>

          {/* Ability bars */}
          {ABILITIES.map((ab, i) => {
            const abEntrance = spring({ frame, fps, config: { damping: 200 }, delay: 75 + i * 8, durationInFrames: 18 });
            return (
              <div key={ab.name} className="flex items-center gap-2 mb-1" style={{ opacity: abEntrance }}>
                <span className="text-xs w-20 truncate">{ab.name}</span>
                <div className="flex-1 h-4 rounded overflow-hidden bg-muted/20">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${ab.pct * abEntrance}%`,
                      backgroundColor: ab.color,
                      opacity: 0.7,
                    }}
                  />
                </div>
                <span className="text-xs text-muted-foreground font-mono w-12 text-right">
                  {(ab.value / 1000).toFixed(0)}k
                </span>
              </div>
            );
          })}
        </div>
      )}

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />
      <StepLabel step={step} text={stepText} opacity={labelOpacity} />
    </AbsoluteFill>
  );
}
