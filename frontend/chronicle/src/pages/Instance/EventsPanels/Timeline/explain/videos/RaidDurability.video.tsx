/**
 * Lesson video: raid durability background.
 *
 * The cursor opens the filter menu, clicks "Edit filters" to flip the panel
 * (the editor opens on the Settings tab), picks Background → Raid Durability
 * from the dropdown, and clicks Back — bars appear behind the line. Green
 * bars mean the whole raid is at full health; shorter, redder bars mean the
 * raid's health pool is low and/or players have died.
 * 530 frames @ 30fps, 1280x720 (50-frame intro card + 480 frames of content).
 */

import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TimelineDemo, TimelineEditorDemo } from "@/pages/Instance/EventsPanels/Timeline/Timeline.demo";
import { DEMO_DAMAGE_SERIES } from "@/pages/Instance/EventsPanels/Timeline/timelineDemoData";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  Cursor,
  LessonIntro,
  RegionHighlight,
  StepCaption,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

const GREEN = "var(--color-class-hunter)";
const BLUE = "var(--color-class-shaman)";
const YELLOW = "var(--color-class-rogue)";

// Measured cursor targets (stage coordinates).
const FILTER_ICON = { x: 237, y: 152 };
const EDIT_FILTERS_ROW = { x: 324, y: 178 };
const BG_SELECT = { x: 245, y: 235 };
const BG_OPTION = { x: 253, y: 289 };
const BACK_BTN = { x: 653, y: 155 };

const MENU_FRAME = 75; // filter icon clicked → context menu
const FLIP_FRAME = 120; // "Edit filters" clicked → editor (Settings tab)
const OPEN_FRAME = 180; // Background dropdown opened
const PICK_FRAME = 240; // "Raid Durability" picked
const BACK_FRAME = 310; // "Back" clicked → bars behind the line
const GREEN_FRAME = 340; // early full-health bars called out
const RED_FRAME = 410; // late short/red bars called out

export default function RaidDurabilityVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Raid durability background"
        bullets={[
          "Set Background to Raid Durability",
          "Green: the raid is at full health",
          "Short red bars: low health or deaths",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  const menuOpen = frame >= MENU_FRAME && frame < FLIP_FRAME;
  const inEditor = frame >= FLIP_FRAME && frame < BACK_FRAME;

  const cursorX = interpolate(
    frame,
    [26, 65, 85, 115, 145, OPEN_FRAME + 15, PICK_FRAME - 15, PICK_FRAME + 20, BACK_FRAME - 15, BACK_FRAME + 40],
    [1140, FILTER_ICON.x, FILTER_ICON.x, EDIT_FILTERS_ROW.x, BG_SELECT.x, BG_SELECT.x, BG_OPTION.x, BG_OPTION.x, BACK_BTN.x, 1100],
    { ...clamp, easing: entranceEasing },
  );
  const cursorY = interpolate(
    frame,
    [26, 65, 85, 115, 145, OPEN_FRAME + 15, PICK_FRAME - 15, PICK_FRAME + 20, BACK_FRAME - 15, BACK_FRAME + 40],
    [600, FILTER_ICON.y, FILTER_ICON.y, EDIT_FILTERS_ROW.y, BG_SELECT.y, BG_SELECT.y, BG_OPTION.y, BG_OPTION.y, BACK_BTN.y, 600],
    { ...clamp, easing: entranceEasing },
  );
  const clicks = [MENU_FRAME, FLIP_FRAME, OPEN_FRAME, PICK_FRAME, BACK_FRAME].map((f) =>
    interpolate(frame, [f - 4, f, f + 10], [0, 1, 0], clamp),
  );
  const clickPulse = Math.max(...clicks);

  const greenBoxIn = interpolate(frame, [GREEN_FRAME, GREEN_FRAME + 12, RED_FRAME - 10, RED_FRAME], [0, 1, 1, 0], clamp);
  const redBoxIn = interpolate(frame, [RED_FRAME, RED_FRAME + 12], [0, 1], clamp);
  const captionOpacity = interpolate(frame, [8, 18, 466, 480], [0, 1, 1, 0], clamp);
  const step = frame >= RED_FRAME ? 4 : frame >= GREEN_FRAME ? 3 : frame >= FLIP_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Raid durability background" entrance={entrance} />

      <main
        className="absolute left-[72px] top-[132px]"
        style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}
      >
        {inEditor ? (
          <TimelineEditorDemo
            settingsTab
            background={frame >= PICK_FRAME ? "raid_durability" : "none"}
            backgroundMenuOpen={frame >= OPEN_FRAME && frame < PICK_FRAME}
          />
        ) : (
          <TimelineDemo
            series={[DEMO_DAMAGE_SERIES]}
            durability={frame >= BACK_FRAME}
            filterMenu={menuOpen}
          />
        )}
      </main>

      {/* Early bars: tall and green — everyone at full health. (Blue box for
          contrast against the green bars.) */}
      <div style={{ opacity: greenBoxIn }}>
        <RegionHighlight left={120} top={178} width={140} height={312} color={BLUE} />
      </div>
      {/* Late bars: short and red — low pool, players dead. */}
      <div style={{ opacity: redBoxIn }}>
        <RegionHighlight left={530} top={250} width={148} height={240} color={YELLOW} />
      </div>

      <Cursor x={cursorX} y={cursorY} clicking={clickPulse} />

      <StepCaption
        step={step}
        text={
          step === 4
            ? (
                <>
                  <span style={{ color: YELLOW }}>Shorter, redder bars</span> — the raid's health
                  pool is low, or players have died
                </>
              )
            : step === 3
              ? (
                  <>
                    <span style={{ color: GREEN }}>Tall green bars</span> — everyone is at full
                    health
                  </>
                )
              : step === 2
                ? "Set Background to 'Raid Durability' in the Settings tab"
                : "Open the filter menu and click 'Edit filters' to flip the panel"
        }
        opacity={captionOpacity}
      />
    </>
  );
}
