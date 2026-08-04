/**
 * Lesson video: total damage versus DPS — a scripted cursor flips the
 * Per Second toggle and the chart values change while order holds.
 * 270 frames @ 30fps, 1280x720.
 */

import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PlayerMetricChartAbilityBreakdownDemo } from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { clamp, entranceEasing } from "./animation";
import { Cursor, StepCaption, VideoHeader, VideoStage } from "./shared";

/** The mock Per Second toggle the cursor interacts with. */
function PerSecondToggle({ on, highlight }: { on: boolean; highlight: number }) {
  return (
    <div
      className="absolute left-[540px] top-[152px] flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5"
      style={{ zIndex: 205, boxShadow: `0 0 0 ${highlight * 2}px var(--color-class-rogue)` }}
    >
      <span className="text-[13px] text-muted-foreground">Per second</span>
      <div
        className="h-[18px] w-[34px] rounded-full border border-border"
        style={{ background: on ? "var(--primary)" : "var(--muted)" }}
      >
        <div
          className="h-[14px] w-[14px] rounded-full bg-foreground"
          style={{ translate: `${on ? 17 : 2}px 1px` }}
        />
      </div>
    </div>
  );
}

const TOGGLE_FRAME = 120;

export default function TotalVsDpsVideo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const perSecond = frame >= TOGGLE_FRAME;

  const cursorX = interpolate(frame, [25, 100], [1080, 660], { ...clamp, easing: entranceEasing });
  const cursorY = interpolate(frame, [25, 100], [560, 162], { ...clamp, easing: entranceEasing });
  const clickPulse = interpolate(frame, [108, 116, 128], [0, 1, 0], clamp);
  const toggleHighlight = interpolate(frame, [96, 108, 150, 165], [0, 1, 1, 0], clamp);
  const captionOpacity = interpolate(frame, [8, 18, 250, 264], [0, 1, 1, 0], clamp);

  return (
    <VideoStage>
      <VideoHeader title="Total damage versus DPS" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[192px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <PlayerMetricChartAbilityBreakdownDemo classIconBasePath="/c/icons" perSecond={perSecond} />
      </main>

      <PerSecondToggle on={perSecond} highlight={toggleHighlight} />
      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={perSecond ? 2 : 1}
        text={
          perSecond
            ? "Same order, new numbers — every value is now per second"
            : "Totals reward time alive; per-second rewards throughput"
        }
        opacity={captionOpacity}
      />
    </VideoStage>
  );
}
