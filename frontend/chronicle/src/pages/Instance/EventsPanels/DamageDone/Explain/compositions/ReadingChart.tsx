/**
 * "Reading the Chart" lesson composition.
 *
 * Shows the damage bars appearing, then highlights the class colours,
 * player names, and relative bar sizes.
 */

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, spring } from "remotion";
import { StepLabel } from "./primitives";
import { clamp } from "./hooks";

const PLAYERS = [
  { name: "Frostweaver", cls: "Mage", color: "#69CCF0", value: 245000 },
  { name: "Darkbinder", cls: "Warlock", color: "#9482C9", value: 230000 },
  { name: "Shadowstep", cls: "Rogue", color: "#FFF468", value: 215000 },
  { name: "Steelbreaker", cls: "Warrior", color: "#C69B6D", value: 198000 },
  { name: "Eagleeye", cls: "Hunter", color: "#AAD372", value: 175000 },
];

const maxVal = PLAYERS[0].value;

export function ReadingChartVideo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const step = frame < 60 ? 1 : frame < 120 ? 2 : 3;
  const stepText = step === 1
    ? "Each bar is a player — longer bars = more damage"
    : step === 2
      ? "Bars are colour-coded by class"
      : "Compare relative lengths to see who contributed most";

  const labelOpacity = interpolate(frame, [5, 15], [0, 1], clamp);

  return (
    <AbsoluteFill className="dark bg-background text-foreground overflow-hidden">
      <div className="absolute inset-4 flex flex-col gap-1.5 pt-8 px-4">
        {PLAYERS.map((p, i) => {
          const barEntrance = spring({ frame, fps, config: { damping: 200 }, delay: i * 6, durationInFrames: 20 });
          const barWidth = (p.value / maxVal) * 100 * barEntrance;
          // Highlight pulse on step 2 (class colours)
          const colourHighlight = step === 2
            ? interpolate(frame, [60 + i * 8, 70 + i * 8], [0, 1], clamp)
            : 0;
          const ringWidth = interpolate(colourHighlight, [0, 1], [0, 3]);

          return (
            <div key={p.name} className="flex items-center gap-2" style={{ opacity: barEntrance }}>
              <span className="text-xs text-muted-foreground w-5 text-right font-mono">#{i + 1}</span>
              <div className="flex-1 relative h-7 rounded overflow-hidden bg-muted/20">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: p.color,
                    opacity: 0.85,
                    boxShadow: ringWidth > 0 ? `0 0 0 ${ringWidth}px ${p.color}` : "none",
                    transition: "box-shadow 0.2s",
                  }}
                />
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-medium text-background mix-blend-difference">
                  {p.name}
                </span>
              </div>
              <span className="text-xs text-muted-foreground font-mono w-16 text-right">
                {(p.value / 1000).toFixed(0)}k
              </span>
            </div>
          );
        })}
      </div>
      <StepLabel step={step} text={stepText} opacity={labelOpacity} />
    </AbsoluteFill>
  );
}
