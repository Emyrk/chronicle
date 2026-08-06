/** Equipment lesson: compare raid members. 440 frames @ 30fps. */
import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EquipmentDemo } from "../../Equipment.demo";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { Cursor, LessonIntro, RegionHighlight, StepCaption, VideoHeader, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";

const OPEN_FRAME = 90;
const TYPE_START = 145;
const TYPE_END = 205;
const SELECT_FRAME = 245;
const TAB_FRAME = 330;

export default function ComparePlayersVideo() {
  return <VideoStage>
    <Sequence from={INTRO_FRAMES - 10}><Content /></Sequence>
    <LessonIntro title="Compare raid members" bullets={["Open the class-colored player selector", "Search by name", "Switch gear and talents without leaving the panel"]} />
  </VideoStage>;
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const dropdownOpen = frame >= OPEN_FRAME + 6 && frame < SELECT_FRAME + 6;
  const typedLength = Math.floor(interpolate(frame, [TYPE_START, TYPE_END], [0, "Steel".length], clamp));
  const search = frame >= TYPE_START ? "Steel".slice(0, typedLength) : "";
  const selected = frame >= SELECT_FRAME + 6 ? 1 : 0;
  const tab = frame >= TAB_FRAME + 6 ? "talents" : "gear";
  const cursorX = interpolate(frame, [26, OPEN_FRAME - 12, OPEN_FRAME + 20, SELECT_FRAME - 15, SELECT_FRAME + 20, TAB_FRAME - 15, TAB_FRAME + 20], [1140, 147, 147, 170, 170, 149, 149], { ...clamp, easing: entranceEasing });
  const cursorY = interpolate(frame, [26, OPEN_FRAME - 12, OPEN_FRAME + 20, SELECT_FRAME - 15, SELECT_FRAME + 20, TAB_FRAME - 15, TAB_FRAME + 20], [600, 196, 196, 267, 267, 227, 227], { ...clamp, easing: entranceEasing });
  const clickOpen = interpolate(frame, [OPEN_FRAME - 4, OPEN_FRAME, OPEN_FRAME + 10], [0, 1, 0], clamp);
  const clickSelect = interpolate(frame, [SELECT_FRAME - 4, SELECT_FRAME, SELECT_FRAME + 10], [0, 1, 0], clamp);
  const clickTab = interpolate(frame, [TAB_FRAME - 4, TAB_FRAME, TAB_FRAME + 10], [0, 1, 0], clamp);
  const step = frame >= TAB_FRAME ? 3 : frame >= SELECT_FRAME ? 2 : 1;
  const captionOpacity = interpolate(frame, [8, 18, 376, 390], [0, 1, 1, 0], clamp);
  return <>
    <VideoHeader title="Compare raid members" entrance={entrance} />
    <main className="absolute left-[72px] top-[132px]" style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px` }}><EquipmentDemo playerIndex={selected} dropdownOpen={dropdownOpen} search={search} tab={tab} /></main>
    {step === 2 && <RegionHighlight left={79} top={243} width={606} height={206} color="var(--color-class-warrior)" />}
    {step === 3 && <RegionHighlight left={122} top={213} width={55} height={29} color="var(--primary)" />}
    <Cursor x={cursorX} y={cursorY} clicking={Math.max(clickOpen, clickSelect, clickTab)} />
    <StepCaption step={step} opacity={captionOpacity} text={step === 3 ? "The selected player persists while you compare gear and talent tabs" : step === 2 ? "Select a result and the whole panel updates to that raid member" : "Open the player selector and type a name to narrow the class-colored roster"} />
  </>;
}
