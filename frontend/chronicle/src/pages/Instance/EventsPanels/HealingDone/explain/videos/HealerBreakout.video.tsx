/**
 * Lesson video: inside a healer's breakout.
 *
 * Lightmender's breakout starts pinned. The Overheal column is called out,
 * then the Absorbed column (healing eaten by heal-absorb effects), then the
 * cursor switches to the "Healed" tab to show healing by target — with
 * overheal per target.
 * 530 frames @ 30fps, 1280x720 (50-frame intro card + 480 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PlayerMetricChartHealingDemo } from "@/components/ui/PlayerMetricChart/PlayerMetricChartHealing.demo";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  Cursor,
  LessonIntro,
  RegionHighlight,
  StepCaption,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

const YELLOW = "var(--color-class-rogue)";
const BLUE = "var(--color-class-shaman)";
const SKY = "var(--color-class-mage)";

// Lightmender's breakout pins as the entrance settles, right of the chart.
const BREAKOUT_POS = { x: 706, y: 96 };
const PINNED_PLAYERS = new Map([["healer-1", BREAKOUT_POS]]);
const PIN_FRAME = 20;

// Measured geometry (cursor target and column highlight boxes).
const OVERHEAL_COL = { left: 816, top: 180, width: 100, height: 165 };
const ABSORBED_COL = { left: 910, top: 180, width: 100, height: 165 };
const HEALED_TAB = { x: 790, y: 141 };
const TARGET_OVERHEAL_COL = { left: 896, top: 180, width: 88, height: 155 };

const ABSORB_FRAME = 155; // Absorbed column called out
const TAB_FRAME = 285; // "Healed" tab clicked
const TARGET_COL_FRAME = 360; // per-target overheal called out

export default function HealerBreakoutVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Inside a healer's breakout"
        bullets={[
          "Every heal shows its overheal share",
          "Absorbed is healing eaten by absorbs",
          "'Healed' shows who your healing landed on",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  const breakoutTab = frame >= TAB_FRAME ? ("target" as const) : ("ability" as const);

  // Cursor: rest near the table, then to the Healed tab.
  const cursorX = interpolate(frame, [26, 100, 245, 275], [1140, 1050, 1050, HEALED_TAB.x], {
    ...clamp,
    easing: entranceEasing,
  });
  const cursorY = interpolate(frame, [26, 100, 245, 275], [600, 260, 260, HEALED_TAB.y], {
    ...clamp,
    easing: entranceEasing,
  });
  const clickPulse = interpolate(frame, [TAB_FRAME - 4, TAB_FRAME, TAB_FRAME + 10], [0, 1, 0], clamp);

  const overhealColIn = interpolate(frame, [45, 57, ABSORB_FRAME - 10, ABSORB_FRAME], [0, 1, 1, 0], clamp);
  const absorbedColIn = interpolate(frame, [ABSORB_FRAME, ABSORB_FRAME + 12, TAB_FRAME - 10, TAB_FRAME], [0, 1, 1, 0], clamp);
  const targetColIn = interpolate(frame, [TARGET_COL_FRAME, TARGET_COL_FRAME + 12], [0, 1], clamp);

  const captionOpacity = interpolate(frame, [8, 18, 466, 480], [0, 1, 1, 0], clamp);
  const step =
    frame >= TARGET_COL_FRAME ? 4 : frame >= TAB_FRAME ? 3 : frame >= ABSORB_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Inside a healer's breakout" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <PlayerMetricChartHealingDemo
          pinnedPlayers={frame >= PIN_FRAME ? PINNED_PLAYERS : undefined}
          breakoutTab={breakoutTab}
          classIconBasePath="/c/icons"
        />
      </main>

      {/* The Overheal column in the ability table… */}
      <div style={{ opacity: overhealColIn }}>
        <RegionHighlight {...OVERHEAL_COL} color={YELLOW} />
      </div>
      {/* …the Absorbed column… */}
      <div style={{ opacity: absorbedColIn }}>
        <RegionHighlight {...ABSORBED_COL} color={SKY} />
      </div>
      {/* …and per target after switching tabs. */}
      <div style={{ opacity: targetColIn }}>
        <RegionHighlight {...TARGET_OVERHEAL_COL} color={BLUE} />
      </div>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={step}
        text={
          step === 4
            ? (
                <>
                  Overheal <span style={{ color: BLUE }}>per target</span> — spot who soaks it
                </>
              )
            : step === 3
              ? "'Healed' shows who your healing landed on"
              : step === 2
                ? (
                    <>
                      <span style={{ color: SKY }}>Absorbed</span> is healing that was eaten by a
                      heal-absorb effect
                    </>
                  )
                : (
                    <>
                      Every heal shows its <span style={{ color: YELLOW }}>overheal</span> share
                    </>
                  )
        }
        opacity={captionOpacity}
      />
    </>
  );
}
