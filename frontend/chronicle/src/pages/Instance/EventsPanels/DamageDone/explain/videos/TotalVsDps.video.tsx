/**
 * Lesson video: total damage versus DPS — a scripted cursor flips the
 * Per Second toggle; the value column is boxed before and after, and a
 * "Before" snapshot of the totals appears on the right for comparison.
 * 270 frames @ 30fps, 1280x720.
 */

import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PlayerMetricChartAbilityBreakdownDemo } from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { clamp, entranceEasing } from "./animation";
import { Cursor, RegionHighlight, StepCaption, VideoHeader, VideoStage } from "./shared";

const YELLOW = "var(--color-class-rogue)";
const BLUE = "var(--color-class-shaman)";

const TOGGLE_FRAME = 120;

/** The demo roster's totals — frozen as the "Before" snapshot. */
const BEFORE_ROWS: Array<[name: string, total: string]> = [
  ["Shadowmeld", "140,000"],
  ["Ragesmash", "111,000"],
  ["Blazewing", "105,000"],
  ["Afflicted", "101,000"],
  ["Markshot", "91,000"],
];

/** Snapshot card of the pre-toggle totals, shown to the right of the chart. */
function BeforeSnapshot({ appear }: { appear: number }) {
  return (
    <aside
      className="absolute w-[240px] rounded-lg border bg-card p-3"
      style={{
        left: 730,
        top: 176,
        borderColor: YELLOW,
        opacity: appear,
        translate: `${interpolate(appear, [0, 1], [16, 0])}px 0`,
        zIndex: 205,
      }}
    >
      <p className="mb-2 font-mono text-[11px] tracking-[0.08em]" style={{ color: YELLOW }}>
        BEFORE — TOTAL DAMAGE
      </p>
      <div className="flex flex-col">
        {BEFORE_ROWS.map(([name, total]) => (
          <div
            key={name}
            className="flex h-8 items-center justify-between border-t border-border/60 text-xs"
          >
            <span className="text-muted-foreground">{name}</span>
            <span className="font-mono text-foreground">{total}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

export default function TotalVsDpsVideo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const perSecond = frame >= TOGGLE_FRAME;

  // Tip lands on the toggle switch itself (measured: pill at x 645-679, y 144-162).
  const cursorX = interpolate(frame, [25, 100], [1080, 655], { ...clamp, easing: entranceEasing });
  const cursorY = interpolate(frame, [25, 100], [560, 150], { ...clamp, easing: entranceEasing });
  const clickPulse = interpolate(frame, [108, 116, 128], [0, 1, 0], clamp);
  const toggleHighlight = interpolate(frame, [96, 108, 150, 165], [0, 1, 1, 0], clamp);
  const captionOpacity = interpolate(frame, [8, 18, 250, 264], [0, 1, 1, 0], clamp);
  // Value-column boxes: yellow on the totals before, blue on the /s values after.
  const beforeBoxOpacity = interpolate(frame, [30, 40, 112, 120], [0, 1, 1, 0], clamp);
  const afterIn = interpolate(frame, [130, 144], [0, 1], clamp);

  return (
    <VideoStage>
      <VideoHeader title="Total damage versus DPS" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <PlayerMetricChartAbilityBreakdownDemo classIconBasePath="/c/icons" perSecond={perSecond} />
      </main>

      {/* Value column: totals (yellow) before the flip… */}
      <div style={{ opacity: beforeBoxOpacity }}>
        <RegionHighlight left={538} top={208} width={82} height={164} color={YELLOW} />
      </div>
      {/* …per-second values (blue) after, with the totals snapshot alongside. */}
      <div style={{ opacity: afterIn }}>
        <RegionHighlight left={528} top={208} width={92} height={164} color={BLUE} />
      </div>
      <BeforeSnapshot appear={afterIn} />

      {/* Ring around the header's Per second toggle while the cursor works it. */}
      <div
        className="absolute rounded-lg"
        style={{
          left: 565,
          top: 138,
          width: 122,
          height: 30,
          boxShadow: `0 0 0 ${toggleHighlight * 2}px ${YELLOW}`,
          zIndex: 205,
        }}
      />
      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={perSecond ? 2 : 1}
        text={
          perSecond ? (
            <>
              Same order, <span style={{ color: BLUE }}>new numbers</span> — compare with the{" "}
              <span style={{ color: YELLOW }}>totals</span> on the right
            </>
          ) : (
            "Totals reward time alive; per-second rewards throughput"
          )
        }
        opacity={captionOpacity}
      />
    </VideoStage>
  );
}
