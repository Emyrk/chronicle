/**
 * Lesson video: compare two focused hunters ability-by-ability.
 *
 * Shows the real power of the Comparison panel: focus a different hunter
 * in two Damage Done panels, then open Comparison to see their ability
 * breakdown side by side. Matched only filters to shared abilities.
 *
 * 470 frames @ 30fps, 1280x720 (60-frame intro + 410 frames of content).
 */

import {
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ComparisonDemo } from "../../Comparison.demo";
import { clamp, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  Cursor,
  LessonIntro,
  RegionHighlight,
  StepCaption,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

// ── Frame constants ──

/** Chart is visible with both panels selected from the start. */
const READ_BARS = 30;
/** Highlight the legend to show colors = hunters. */
const LEGEND_FRAME = 90;
/** Hover cursor along the rows to show the split. */
const SCAN_START = 145;
const SCAN_END = 220;
/** Toggle matched only. */
const MATCHED_ONLY = 280;
/** Read the matched chart: shared abilities only. */
const READ_MATCHED = 320;
const CONTENT_END = 410;

function clickPulse(frame: number, at: number): number {
  return interpolate(frame, [at - 4, at, at + 10], [0, 1, 0], clamp);
}

export default function CompareHuntersVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Compare two focused hunters"
        bullets={[
          "Focus a different hunter in each Damage Done panel",
          "Their ability breakdowns stack side by side",
          "Matched only keeps abilities both hunters share",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 28,
  });

  const panelOption =
    frame >= MATCHED_ONLY ? "panel-1,panel-2,mo" : "panel-1,panel-2";

  // Cursor path: legend area -> scan rows -> matched only toggle -> rest
  const cursorX = interpolate(
    frame,
    [
      0,
      READ_BARS,
      LEGEND_FRAME,
      SCAN_START,
      SCAN_END,
      MATCHED_ONLY - 20,
      MATCHED_ONLY,
      READ_MATCHED,
      CONTENT_END,
    ],
    [200, 350, 250, 400, 400, 600, 665, 350, 350],
    clamp,
  );
  const cursorY = interpolate(
    frame,
    [
      0,
      READ_BARS,
      LEGEND_FRAME,
      SCAN_START,
      SCAN_END,
      MATCHED_ONLY - 20,
      MATCHED_ONLY,
      READ_MATCHED,
      CONTENT_END,
    ],
    [300, 310, 186, 250, 440, 178, 190, 340, 340],
    clamp,
  );
  const clicking = clickPulse(frame, MATCHED_ONLY);

  // Highlights
  const legendHighlight = interpolate(
    frame,
    [LEGEND_FRAME - 12, LEGEND_FRAME, SCAN_START - 12, SCAN_START],
    [0, 1, 1, 0],
    clamp,
  );
  const barsHighlight = interpolate(
    frame,
    [READ_BARS - 12, READ_BARS, LEGEND_FRAME - 18, LEGEND_FRAME - 6],
    [0, 1, 1, 0],
    clamp,
  );
  const matchedHighlight = interpolate(
    frame,
    [READ_MATCHED - 8, READ_MATCHED, CONTENT_END - 20, CONTENT_END - 8],
    [0, 1, 1, 0],
    clamp,
  );
  const captionOpacity = interpolate(
    frame,
    [8, 18, CONTENT_END - 14, CONTENT_END],
    [0, 1, 1, 0],
    clamp,
  );

  const step =
    frame >= READ_MATCHED
      ? 4
      : frame >= MATCHED_ONLY
        ? 3
        : frame >= SCAN_START
          ? 2
          : 1;

  return (
    <>
      <VideoHeader title="Compare two focused hunters" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{
          opacity: entrance,
          translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px`,
        }}
      >
        <ComparisonDemo
          panelOption={panelOption}
          variant="hunters"
        />
      </main>

      {/* Highlight the stacked bars */}
      <div style={{ opacity: barsHighlight }}>
        <RegionHighlight
          left={82}
          top={240}
          width={600}
          height={220}
          color="#facc15"
        />
      </div>

      {/* Highlight the legend (color key) */}
      <div style={{ opacity: legendHighlight }}>
        <RegionHighlight
          left={90}
          top={174}
          width={260}
          height={24}
          color="var(--color-class-shaman)"
        />
      </div>

      {/* Highlight the matched result */}
      <div style={{ opacity: matchedHighlight }}>
        <RegionHighlight
          left={82}
          top={238}
          width={600}
          height={220}
          color="#60a5fa"
        />
      </div>

      <Cursor x={cursorX} y={cursorY} clicking={clicking} />

      <StepCaption
        step={step}
        text={
          step === 4
            ? (
                <>
                  Only <span style={{ color: "#60a5fa" }}>shared abilities</span>{" "}
                  remain, making the comparison direct
                </>
              )
            : step === 3
              ? "Toggle Matched only to drop abilities unique to one hunter"
              : step === 2
                ? "Scan the rows: each stacked bar is one hunter's share of that ability"
                : (
                    <>
                      <span style={{ color: "#facc15" }}>Thorn</span> and{" "}
                      <span style={{ color: "#60a5fa" }}>Wildmark</span> side by side,
                      ability by ability
                    </>
                  )
        }
        opacity={captionOpacity}
      />
    </>
  );
}
