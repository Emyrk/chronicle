/**
 * Lesson video: split abilities by spell rank.
 *
 * Blazewing's breakout starts pinned with Ranks off — one merged Fireball
 * row. A scripted cursor flips the Ranks toggle and the row splits into
 * Rank 12 / Rank 11 with subtitles.
 * 380 frames @ 30fps, 1280x720 (50-frame intro card + 330 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PlayerMetricChartAbilityBreakdownDemo } from "@/components/ui/PlayerMetricChart/PlayerMetricChart.demo";
import { clamp, entranceEasing, INTRO_FRAMES } from "./animation";
import { Cursor, LessonIntro, RegionHighlight, StepCaption, VideoHeader, VideoStage } from "./shared";

const YELLOW = "var(--color-class-rogue)";
const BLUE = "var(--color-class-shaman)";

// Blazewing's breakout pins as the entrance settles, to the right of the chart.
const BREAKOUT_POS = { x: 706, y: 96 };
const PINNED_PLAYERS = new Map([["player-3", BREAKOUT_POS]]);
const PIN_FRAME = 20;

// Measured geometry (cursor target and row highlight boxes).
const RANKS_CHIP = { x: 649, y: 191 };
const MERGED_ROW = { left: 705, top: 209, width: 344, height: 29 };
const RANK_ROWS = { left: 705, top: 209, width: 344, height: 55 };

const RANKS_FRAME = 150; // Ranks toggle clicked

export default function SpellRanksVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Split abilities by rank"
        bullets={[
          "Abilities normally merge every rank",
          "'Ranks' splits each spell by cast rank",
          "Spot downranking at a glance",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const showRanks = frame >= RANKS_FRAME;

  // Cursor travels from the lower right to the header's Ranks chip.
  const cursorX = interpolate(frame, [26, 110], [1140, RANKS_CHIP.x], {
    ...clamp,
    easing: entranceEasing,
  });
  const cursorY = interpolate(frame, [26, 110], [600, RANKS_CHIP.y], {
    ...clamp,
    easing: entranceEasing,
  });
  const clickPulse = interpolate(frame, [RANKS_FRAME - 4, RANKS_FRAME, RANKS_FRAME + 10], [0, 1, 0], clamp);

  const mergedBoxIn = interpolate(frame, [40, 52, RANKS_FRAME - 8, RANKS_FRAME], [0, 1, 1, 0], clamp);
  const rankBoxIn = interpolate(frame, [RANKS_FRAME + 16, RANKS_FRAME + 30], [0, 1], clamp);
  const captionOpacity = interpolate(frame, [8, 18, 316, 330], [0, 1, 1, 0], clamp);

  return (
    <>
      <VideoHeader title="Split abilities by rank" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        <PlayerMetricChartAbilityBreakdownDemo
          pinnedPlayers={frame >= PIN_FRAME ? PINNED_PLAYERS : undefined}
          breakoutDetail={{ tab: "ability", expanded: false }}
          showRanks={showRanks}
          classIconBasePath="/c/icons"
        />
      </main>

      {/* One merged Fireball row before the flip… */}
      <div style={{ opacity: mergedBoxIn }}>
        <RegionHighlight {...MERGED_ROW} color={YELLOW} />
      </div>
      {/* …two rank rows with subtitles after. */}
      <div style={{ opacity: rankBoxIn }}>
        <RegionHighlight {...RANK_ROWS} color={BLUE} />
      </div>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={showRanks ? 2 : 1}
        text={
          showRanks ? (
            <>
              <span style={{ color: BLUE }}>Rank 12 and Rank 11</span> split out — spot downranking
              at a glance
            </>
          ) : (
            <>
              With Ranks off, <span style={{ color: YELLOW }}>every Fireball rank merges</span> into
              one row
            </>
          )
        }
        opacity={captionOpacity}
      />
    </>
  );
}
