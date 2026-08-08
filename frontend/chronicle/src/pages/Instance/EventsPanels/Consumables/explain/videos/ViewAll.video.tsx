import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ConsumablesLedgerDemo } from "../ConsumablesLedgerDemo";
import { clamp, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { Cursor, LessonIntro, RegionHighlight, StepCaption, VideoHeader, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";

const OPEN = 70;
const READ_ROWS = 155;
const READ_CHIPS = 260;

function clickPulse(frame: number, at: number) {
  return interpolate(frame, [at - 4, at, at + 10], [0, 1, 0], clamp);
}

export default function ViewAllVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}><Content /></Sequence>
      <LessonIntro
        title="View every player at once"
        bullets={[
          "Open View All from the player header",
          "Each row is one player's total",
          "Consumable chips show item-by-item counts",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const viewAll = frame >= OPEN + 6;
  const step = frame >= READ_CHIPS ? 3 : frame >= READ_ROWS ? 2 : 1;
  const opacity = interpolate(frame, [8, 18, 346, 360], [0, 1, 1, 0], clamp);
  const cursorX = interpolate(frame, [0, OPEN, 120, READ_ROWS, READ_CHIPS, 360], [385, 385, 620, 360, 520, 520], clamp);
  const cursorY = interpolate(frame, [0, OPEN, 120, READ_ROWS, READ_CHIPS, 360], [230, 230, 190, 280, 330, 330], clamp);

  return (
    <>
      <VideoHeader title="View every player at once" entrance={entrance} />
      <main className="absolute left-[72px] top-[132px]" style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}>
        <ConsumablesLedgerDemo view={viewAll ? "all" : "player"} />
      </main>
      {step === 1 && <RegionHighlight left={349} top={215} width={72} height={24} color="#60a5fa" />}
      {step === 2 && <RegionHighlight left={79} top={248} width={606} height={292} color="var(--color-class-mage)" />}
      {step === 3 && <RegionHighlight left={303} top={254} width={345} height={288} color="var(--color-class-rogue)" />}
      <Cursor x={cursorX} y={cursorY} clicking={clickPulse(frame, OPEN)} />
      <StepCaption
        step={step}
        text={step === 1 ? "Open View All from the player header" : step === 2 ? "Each row shows one player's total across selected fights" : "Consumable chips show exactly what each player used"}
        opacity={opacity}
      />
    </>
  );
}
