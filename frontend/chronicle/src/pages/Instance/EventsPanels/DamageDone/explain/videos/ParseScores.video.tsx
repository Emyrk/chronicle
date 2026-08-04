/**
 * Lesson video: understand parse scores — pills appear on the demo chart
 * (one row deliberately has none), the color scale sweeps grey to gold, then
 * the pill-less row is called out. 300 frames @ 30fps, 1280x720.
 */

import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { ParsePillData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { PlayerMetricChartAbilityBreakdownDemo } from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { parseHexColor } from "@/pages/Instance/parseColors";
import { clamp } from "./animation";
import { RegionHighlight, StepCaption, VideoHeader, VideoStage } from "./shared";

const YELLOW = "var(--color-class-rogue)";

const pill = (score: number): ParsePillData => ({
  displayScore: score,
  color: parseHexColor(score),
  tooltipContent: null,
});

// Afflicted (player-4) has no pill on purpose — the video explains why.
const DEMO_PILLS = new Map<string, ParsePillData>([
  ["player-1", pill(100)],
  ["player-2", pill(96)],
  ["player-3", pill(62)],
  ["player-5", pill(31)],
]);

// The app's real scale — colors come from parseColors.ts so they never drift.
const SCALE: Array<[label: string, score: number]> = [
  ["0–24", 0],
  ["25–49", 25],
  ["50–74", 50],
  ["75–94", 75],
  ["95–98", 95],
  ["99", 99],
  ["100", 100],
];

const MISSING_FRAME = 210;

export default function ParseScoresVideo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const pillsIn = frame >= 45;
  const missingBeat = frame >= MISSING_FRAME;
  const legendIn = interpolate(frame, [110, 125], [0, 1], clamp);
  const missingIn = interpolate(frame, [MISSING_FRAME, MISSING_FRAME + 12], [0, 1], clamp);
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
        {SCALE.map(([label, score], i) => {
          // Sweep the legend rows one by one.
          const rowIn = interpolate(frame, [130 + i * 14, 142 + i * 14], [0, 1], clamp);
          return (
            <div key={label} className="flex items-center gap-2.5" style={{ opacity: rowIn }}>
              <span
                className="inline-block h-4 w-9 rounded-full text-center font-mono text-[10px] leading-4"
                style={{ background: parseHexColor(score), color: "#111" }}
              >
                {label.split("–")[0]}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">{label} percentile</span>
            </div>
          );
        })}
      </aside>

      {/* Call out the pill-less Afflicted row (row 4, bar end). */}
      <div style={{ opacity: missingIn }}>
        <RegionHighlight left={330} top={305} width={90} height={34} color={YELLOW} />
        <div
          className="absolute rounded-md border bg-card px-2.5 py-1 font-mono text-[11px]"
          style={{ left: 330, top: 376, borderColor: YELLOW, color: YELLOW, zIndex: 210 }}
        >
          Not enough data for this spec
        </div>
      </div>

      <StepCaption
        step={missingBeat ? 3 : pillsIn ? 2 : 1}
        text={
          missingBeat
            ? "No pill? Not enough data for this spec yet"
            : pillsIn
              ? "Grey to gold — each pill scores against same-spec kills of this boss"
              : "Pills appear next to each player once parses are available"
        }
        opacity={captionOpacity}
      />
    </VideoStage>
  );
}
