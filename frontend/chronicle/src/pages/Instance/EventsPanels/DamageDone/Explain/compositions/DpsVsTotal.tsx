/**
 * "DPS vs Total Damage" lesson composition.
 *
 * Shows a toggle switching between total damage and DPS values,
 * with the bars re-scaling and values updating.
 */

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, spring } from "remotion";
import { Cursor, StepLabel } from "./primitives";
import { clamp, useClickPulse } from "./hooks";

const PLAYERS = [
  { name: "Frostweaver", color: "#69CCF0", total: 245000, dps: 2041.7 },
  { name: "Darkbinder", color: "#9482C9", total: 230000, dps: 1916.7 },
  { name: "Shadowstep", color: "#FFF468", total: 215000, dps: 1791.7 },
  { name: "Steelbreaker", color: "#C69B6D", total: 198000, dps: 1650.0 },
  { name: "Eagleeye", color: "#AAD372", total: 175000, dps: 1458.3 },
];

const maxTotal = PLAYERS[0].total;

export function DpsVsTotalVideo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phase 1: show total (0-70), Phase 2: cursor clicks toggle (70-90), Phase 3: show DPS (90+)
  const isDps = frame >= 90;

  // Cursor moves to toggle
  const cursorX = interpolate(frame, [50, 75], [300, 360], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
  const cursorY = interpolate(frame, [50, 75], [10, 8], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
  const clickPulse = useClickPulse(80);

  // Toggle animation
  const toggleProgress = spring({ frame, fps, config: { damping: 200 }, delay: 85, durationInFrames: 15 });

  const step = isDps ? 2 : 1;
  const stepText = isDps
    ? "Now showing damage per second (DPS)"
    : "Total damage — toggle 'Per Second' to see DPS";

  const labelOpacity = interpolate(frame, [5, 15], [0, 1], clamp);

  return (
    <AbsoluteFill className="dark bg-background text-foreground overflow-hidden">
      {/* Per Second toggle */}
      <div className="absolute top-2 right-4 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Per Second</span>
        <div
          className="w-8 h-4 rounded-full relative"
          style={{ backgroundColor: isDps ? "hsl(var(--primary))" : "hsl(var(--muted))" }}
        >
          <div
            className="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow"
            style={{ left: interpolate(toggleProgress, [0, 1], [2, 14]) }}
          />
        </div>
      </div>

      {/* Bars */}
      <div className="absolute top-10 left-5 right-5 flex flex-col gap-1.5">
        {PLAYERS.map((p, i) => {
          const barEntrance = spring({ frame, fps, config: { damping: 200 }, delay: i * 5, durationInFrames: 18 });
          const barWidth = (p.total / maxTotal) * 100 * barEntrance;
          // Value lerp between total and DPS
          const displayValue = interpolate(toggleProgress, [0, 1], [p.total, p.dps]);
          const suffix = isDps ? "/s" : "";
          const formatted = isDps
            ? displayValue.toFixed(1)
            : (displayValue / 1000).toFixed(0) + "k";

          return (
            <div key={p.name} className="flex items-center gap-2" style={{ opacity: barEntrance }}>
              <span className="text-xs text-muted-foreground w-5 text-right font-mono">#{i + 1}</span>
              <div className="flex-1 relative h-6 rounded overflow-hidden bg-muted/20">
                <div
                  className="h-full rounded"
                  style={{ width: `${barWidth}%`, backgroundColor: p.color, opacity: 0.85 }}
                />
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-medium text-background mix-blend-difference">
                  {p.name}
                </span>
              </div>
              <span className="text-xs text-muted-foreground font-mono w-16 text-right">
                {formatted}{suffix}
              </span>
            </div>
          );
        })}
      </div>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />
      <StepLabel step={step} text={stepText} opacity={labelOpacity} />
    </AbsoluteFill>
  );
}
