import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ConsumablesLedgerDemo } from "../ConsumablesLedgerDemo";
import { clamp, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { Cursor, LessonIntro, RegionHighlight, StepCaption, VideoHeader, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";

const TOGGLE = 55;
const READ_TOTAL = 145;
const READ_ROWS = 245;

function clickPulse(frame: number, at: number) {
  return interpolate(frame, [at - 4, at, at + 10], [0, 1, 0], clamp);
}

export default function RaidWideVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}><Content /></Sequence>
      <LessonIntro title="Review the raid-wide ledger" bullets={["Turn on Raid Wide", "Read the raid total", "Rank items and their users"]} />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const raidWide = frame >= TOGGLE + 6;
  const step = frame >= READ_ROWS ? 3 : frame >= READ_TOTAL ? 2 : 1;
  const opacity = interpolate(frame, [8, 18, 346, 360], [0, 1, 1, 0], clamp);
  const cursorX = interpolate(frame, [0, TOGGLE, 105, READ_TOTAL, READ_ROWS, 360], [650, 650, 650, 625, 350, 350], clamp);
  const cursorY = interpolate(frame, [0, TOGGLE, 105, READ_TOTAL, READ_ROWS, 360], [153, 153, 153, 245, 332, 332], clamp);

  return (
    <>
      <VideoHeader title="Review the raid-wide ledger" entrance={entrance} />
      <main className="absolute left-[72px] top-[132px]" style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}>
        <ConsumablesLedgerDemo view={raidWide ? "raid" : "player"} />
      </main>
      {step === 1 && <RegionHighlight left={580} top={141} width={101} height={23} color="#60a5fa" />}
      {step === 2 && <RegionHighlight left={79} top={215} width={606} height={33} color="#f59e0b" />}
      {step === 3 && <RegionHighlight left={79} top={256} width={596} height={190} color="var(--color-class-rogue)" />}
      <Cursor x={cursorX} y={cursorY} clicking={clickPulse(frame, TOGGLE)} />
      <StepCaption step={step} text={step === 1 ? "Turn on Raid Wide to combine every selected player" : step === 2 ? "The header totals all uses and reports data coverage" : "Rows rank items; subtitles show how many players used them"} opacity={opacity} />
    </>
  );
}
