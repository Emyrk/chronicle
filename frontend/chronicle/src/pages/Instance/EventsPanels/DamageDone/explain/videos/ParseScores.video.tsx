/**
 * Lesson video: understand parse scores — pills appear on the demo chart,
 * then the color scale sweeps from grey to gold. 300 frames @ 30fps, 1280x720.
 */

import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { ParsePillData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { PlayerMetricChartAbilityBreakdownDemo } from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { clamp } from "./animation";
import { StepCaption, VideoHeader, VideoStage } from "./shared";

const DEMO_PILLS = new Map<string, ParsePillData>([
  ["player-1", { displayScore: 99, color: "#e5cc80", tooltipContent: null }],
  ["player-2", { displayScore: 92, color: "#ff8000", tooltipContent: null }],
  ["player-3", { displayScore: 78, color: "#a335ee", tooltipContent: null }],
  ["player-4", { displayScore: 55, color: "#0070dd", tooltipContent: null }],
  ["player-5", { displayScore: 31, color: "#1eff00", tooltipContent: null }],
]);

const SCALE: Array<[label: string, color: string]> = [
  ["0–24", "#9d9d9d"],
  ["25–49", "#ffffff"],
  ["50–74", "#1eff00"],
  ["75–94", "#0070dd"],
  ["95–98", "#a335ee"],
  ["99", "#ff8000"],
  ["100", "#e5cc80"],
];

export default function ParseScoresVideo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const pillsIn = frame >= 45;
  const legendIn = interpolate(frame, [110, 125], [0, 1], clamp);
  const captionOpacity = interpolate(frame, [8, 18, 280, 294], [0, 1, 1, 0], clamp);

  return (
    <VideoStage>
      <VideoHeader title="Understand parse scores" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <PlayerMetricChartAbilityBreakdownDemo
          classIconBasePath="/c/icons"
          parsePills={pillsIn ? DEMO_PILLS : undefined}
        />
      </main>

      <aside
        className="absolute right-[72px] top-[180px] flex w-[320px] flex-col gap-2 rounded-lg border border-border bg-card p-4"
        style={{ opacity: legendIn, translate: `0 ${interpolate(legendIn, [0, 1], [14, 0])}px`, zIndex: 205 }}
      >
        <p className="text-[13px] font-semibold">The parse color scale</p>
        {SCALE.map(([label, color], i) => {
          // Sweep the legend rows one by one.
          const rowIn = interpolate(frame, [130 + i * 14, 142 + i * 14], [0, 1], clamp);
          return (
            <div key={label} className="flex items-center gap-2.5" style={{ opacity: rowIn }}>
              <span
                className="inline-block h-4 w-9 rounded-full text-center font-mono text-[10px] leading-4"
                style={{ background: color, color: "#111" }}
              >
                {label.split("–")[0]}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">{label} percentile</span>
            </div>
          );
        })}
      </aside>

      <StepCaption
        step={pillsIn ? 2 : 1}
        text={
          pillsIn
            ? "Grey to gold — each pill scores against same-spec kills of this boss"
            : "Pills appear next to each player once parses are available"
        }
        opacity={captionOpacity}
      />
    </VideoStage>
  );
}
