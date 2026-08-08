import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { LedgerItemBreakout } from "../../LedgerItemBreakout";
import { ConsumablesLedgerDemo } from "../ConsumablesLedgerDemo";
import { FIXTURE_PLAYERS } from "../fixture";
import { clamp, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { Cursor, LessonIntro, RegionHighlight, StepCaption, VideoHeader, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";

const OPEN = 95;
const READ_USERS = 190;
const READ_MISSING = 300;

function clickPulse(frame: number, at: number) {
  return interpolate(frame, [at - 4, at, at + 10], [0, 1, 0], clamp);
}

const breakoutData = {
  itemId: 13444,
  unitCopper: null,
  showGold: false,
  raidSize: 8,
  rows: [
    { guid: FIXTURE_PLAYERS.mage, name: "Frostweaver", cls: "MAGE", uses: 2 },
    { guid: FIXTURE_PLAYERS.priest, name: "Dawnmend", cls: "PRIEST", uses: 1 },
    { guid: FIXTURE_PLAYERS.paladin, name: "Lightward", cls: "PALADIN", uses: 1 },
  ],
  nonUsers: [
    { guid: FIXTURE_PLAYERS.warrior, name: "Ironwall", cls: "WARRIOR", uses: 0 },
    { guid: FIXTURE_PLAYERS.rogue, name: "Nightshiv", cls: "ROGUE", uses: 0 },
    { guid: FIXTURE_PLAYERS.hunter, name: "Eagleeye", cls: "HUNTER", uses: 0 },
    { guid: FIXTURE_PLAYERS.warlock, name: "Hexbinder", cls: "WARLOCK", uses: 0 },
    { guid: FIXTURE_PLAYERS.druid, name: "Oakheart", cls: "DRUID", uses: 0 },
  ],
  classes: [
    { cls: "MAGE", used: 1, of: 1 },
    { cls: "PRIEST", used: 1, of: 1 },
    { cls: "PALADIN", used: 1, of: 1 },
  ],
};

export default function InspectItemVideo() {
  return (
    <VideoStage>
      <Sequence from={INTRO_FRAMES - 10}><Content /></Sequence>
      <LessonIntro title="Inspect an item's usage" bullets={["Click an item row", "Compare users and repeat uses", "See who did not use it"]} />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const open = frame >= OPEN + 6;
  const step = frame >= READ_MISSING ? 3 : frame >= READ_USERS ? 2 : 1;
  const opacity = interpolate(frame, [8, 18, 376, 390], [0, 1, 1, 0], clamp);
  const cursorX = interpolate(frame, [0, OPEN, 145, READ_USERS, READ_MISSING, 390], [320, 320, 735, 860, 860, 860], clamp);
  const cursorY = interpolate(frame, [0, OPEN, 145, READ_USERS, READ_MISSING, 390], [281, 281, 205, 295, 418, 418], clamp);

  return (
    <>
      <VideoHeader title="Inspect an item's usage" entrance={entrance} />
      <main className="absolute left-[72px] top-[132px]" style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}>
        <ConsumablesLedgerDemo view="raid" />
      </main>
      {step === 1 && <RegionHighlight left={79} top={256} width={596} height={51} color="#f59e0b" />}
      {open && (
        <div className="absolute left-[730px] top-[145px]" style={{ opacity: interpolate(frame, [OPEN + 6, OPEN + 18], [0, 1], clamp), translate: `${interpolate(frame, [OPEN + 6, OPEN + 18], [18, 0], clamp)}px 0` }}>
          <LedgerItemBreakout data={breakoutData} onClose={() => {}} />
        </div>
      )}
      {step === 2 && <RegionHighlight left={729} top={198} width={322} height={194} color="var(--color-class-mage)" />}
      {step === 3 && <RegionHighlight left={729} top={392} width={322} height={51} color="var(--color-class-rogue)" />}
      <Cursor x={cursorX} y={cursorY} clicking={clickPulse(frame, OPEN)} />
      <StepCaption step={step} text={step === 1 ? "Click an item row to open its usage breakout" : step === 2 ? "See every user, repeat uses, and adoption by class" : "The breakout also names raiders with zero uses"} opacity={opacity} />
    </>
  );
}
