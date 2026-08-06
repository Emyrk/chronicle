/**
 * Lesson video: select two or more source panels, read their color-coded shares,
 * then add a third source and narrow the chart with Matched only.
 * 500 frames @ 30fps, 1280x720 (60-frame intro + 440 frames of content).
 */

import {
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ComparisonDemo } from "../../Comparison.demo";
import {
  clamp,
  INTRO_FRAMES,
} from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  Cursor,
  LessonIntro,
  RegionHighlight,
  StepCaption,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

const OPEN_FIRST_PICKER = 35;
const SELECT_FIRST = 80;
const SELECT_SECOND = 125;
const READ_CHART = 165;
const OPEN_ADD_PICKER = 255;
const ADD_THIRD = 300;
const MATCHED_ONLY = 370;
const CONTENT_END = 440;

function clickPulse(frame: number, at: number): number {
  return interpolate(frame, [at - 4, at, at + 10], [0, 1, 0], clamp);
}

export default function ComparePanelsVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Compare two or more panels"
        bullets={[
          "Select at least two metric panels",
          "Colors show each panel's share",
          "Add more sources or keep matched rows only",
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
    frame >= MATCHED_ONLY
      ? "panel-1,panel-2,panel-3,mo"
      : frame >= ADD_THIRD
        ? "panel-1,panel-2,panel-3"
        : frame >= SELECT_SECOND
          ? "panel-1,panel-2"
          : frame >= SELECT_FIRST
            ? "panel-1"
            : null;

  const pickerOpen =
    (frame >= OPEN_FIRST_PICKER && frame < SELECT_SECOND) ||
    (frame >= OPEN_ADD_PICKER && frame < ADD_THIRD);

  const cursorX = interpolate(
    frame,
    [
      0,
      OPEN_FIRST_PICKER,
      SELECT_FIRST,
      SELECT_SECOND,
      READ_CHART,
      230,
      OPEN_ADD_PICKER,
      ADD_THIRD,
      340,
      MATCHED_ONLY,
      CONTENT_END,
    ],
    [130, 142, 170, 170, 370, 500, 315, 180, 520, 665, 665],
    clamp,
  );
  const cursorY = interpolate(
    frame,
    [
      0,
      OPEN_FIRST_PICKER,
      SELECT_FIRST,
      SELECT_SECOND,
      READ_CHART,
      230,
      OPEN_ADD_PICKER,
      ADD_THIRD,
      340,
      MATCHED_ONLY,
      CONTENT_END,
    ],
    [210, 190, 232, 264, 292, 380, 190, 296, 370, 190, 190],
    clamp,
  );
  const clicking = Math.max(
    clickPulse(frame, OPEN_FIRST_PICKER),
    clickPulse(frame, SELECT_FIRST),
    clickPulse(frame, SELECT_SECOND),
    clickPulse(frame, OPEN_ADD_PICKER),
    clickPulse(frame, ADD_THIRD),
    clickPulse(frame, MATCHED_ONLY),
  );

  const chartHighlight = interpolate(
    frame,
    [READ_CHART - 12, READ_CHART, OPEN_ADD_PICKER - 18, OPEN_ADD_PICKER],
    [0, 1, 1, 0],
    clamp,
  );
  const matchedHighlight = interpolate(
    frame,
    [MATCHED_ONLY - 20, MATCHED_ONLY - 8, CONTENT_END - 20, CONTENT_END - 8],
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
    frame >= MATCHED_ONLY
      ? 4
      : frame >= ADD_THIRD
        ? 3
        : frame >= READ_CHART
          ? 2
          : 1;

  return (
    <>
      <VideoHeader title="Compare two or more panels" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{
          opacity: entrance,
          translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px`,
        }}
      >
        <ComparisonDemo panelOption={panelOption} pickerOpen={pickerOpen} />
      </main>

      <div style={{ opacity: chartHighlight }}>
        <RegionHighlight
          left={82}
          top={230}
          width={600}
          height={248}
          color="#facc15"
        />
      </div>
      <div style={{ opacity: matchedHighlight }}>
        <RegionHighlight
          left={570}
          top={174}
          width={112}
          height={30}
          color="#60a5fa"
        />
      </div>

      <Cursor x={cursorX} y={cursorY} clicking={clicking} />

      <StepCaption
        step={step}
        text={
          step === 4
            ? "Matched only keeps rows found in every selected panel"
            : step === 3
              ? "Add a third panel whenever the comparison needs another source"
              : step === 2
                ? "Each color is one panel's share of that row's combined total"
                : "Start by selecting at least two panels with metric bar data"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
