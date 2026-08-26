/**
 * Discord demo: Encounter phases on Razorgore.
 *
 * A faithful, focused rendering of the real encounter sidebar. Shows that
 * phases require a single encounter, selecting a phase applies a time range,
 * and clicking the encounter again resets that range.
 * 650 frames @ 30fps, 1280x720.
 */
import { CheckCircle, FolderTree, Hourglass, PanelLeftClose } from "lucide-react";
import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  Cursor,
  LessonIntro,
  RegionHighlight,
  StepCaption,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

const SINGLE_SELECT_FRAME = 112;
const PHASE_CLICK_FRAME = 270;
const RESET_FRAME = 470;
const STATE_DELAY = 7;

const SIDEBAR = { left: 430, top: 128, width: 420, height: 424 };
const RAZORGORE_CLICK = { x: 610, y: 247 };
const ADDS_CLICK = { x: 570, y: 278 };

export default function EncounterPhasesDiscordVideo() {
  return (
    <VideoStage>
      <div className="absolute inset-0 bg-[#0b1b2a]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_22%,rgba(56,189,248,0.30),transparent_42%),linear-gradient(135deg,rgba(15,23,42,0.15),rgba(8,47,73,0.42))]" />
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Encounter phases"
        bullets={[
          "Select one encounter to reveal its phases",
          "Click a phase to filter every panel to that time range",
          "Click the encounter again to reset the phase filter",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const singleEncounter = frame >= SINGLE_SELECT_FRAME + STATE_DELAY;
  const phaseSelected = frame >= PHASE_CLICK_FRAME + STATE_DELAY && frame < RESET_FRAME + STATE_DELAY;

  const cursorX = interpolate(
    frame,
    [18, 82, SINGLE_SELECT_FRAME, 192, 245, PHASE_CLICK_FRAME, 355, 438, RESET_FRAME],
    [1120, 850, RAZORGORE_CLICK.x, RAZORGORE_CLICK.x, ADDS_CLICK.x, ADDS_CLICK.x, 900, RAZORGORE_CLICK.x, RAZORGORE_CLICK.x],
    { ...clamp, easing: entranceEasing },
  );
  const cursorY = interpolate(
    frame,
    [18, 82, SINGLE_SELECT_FRAME, 192, 245, PHASE_CLICK_FRAME, 355, 438, RESET_FRAME],
    [620, 570, RAZORGORE_CLICK.y, RAZORGORE_CLICK.y, ADDS_CLICK.y, ADDS_CLICK.y, 570, RAZORGORE_CLICK.y, RAZORGORE_CLICK.y],
    { ...clamp, easing: entranceEasing },
  );
  const singleClick = interpolate(frame, [SINGLE_SELECT_FRAME - 4, SINGLE_SELECT_FRAME, SINGLE_SELECT_FRAME + 10], [0, 1, 0], clamp);
  const phaseClick = interpolate(frame, [PHASE_CLICK_FRAME - 4, PHASE_CLICK_FRAME, PHASE_CLICK_FRAME + 10], [0, 1, 0], clamp);
  const resetClick = interpolate(frame, [RESET_FRAME - 4, RESET_FRAME, RESET_FRAME + 10], [0, 1, 0], clamp);
  const captionOpacity = interpolate(frame, [8, 18, RESET_FRAME + STATE_DELAY, RESET_FRAME + STATE_DELAY + 14], [0, 1, 1, 0], clamp);
  const step = frame >= 390 ? 4 : frame >= PHASE_CLICK_FRAME ? 3 : frame >= SINGLE_SELECT_FRAME ? 2 : 1;

  return (
    <>
      <VideoHeader title="Use encounter phases" entrance={entrance} />

      <div
        className="absolute overflow-hidden rounded-xl border border-zinc-700 bg-[#09090b] shadow-2xl"
        style={{
          left: SIDEBAR.left,
          top: SIDEBAR.top,
          width: SIDEBAR.width,
          height: SIDEBAR.height,
          opacity: entrance,
          translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px`,
        }}
      >
        <EncounterSidebarDemo singleEncounter={singleEncounter} phaseSelected={phaseSelected} />
      </div>

      {!singleEncounter && (
        <RegionHighlight left={SIDEBAR.left + 18} top={SIDEBAR.top + 94} width={SIDEBAR.width - 36} height={82} color="var(--color-class-mage)" />
      )}
      {singleEncounter && !phaseSelected && frame < PHASE_CLICK_FRAME + STATE_DELAY && (
        <RegionHighlight left={SIDEBAR.left + 28} top={SIDEBAR.top + 133} width={SIDEBAR.width - 56} height={38} color="var(--color-class-rogue)" />
      )}
      {phaseSelected && frame < RESET_FRAME && (
        <RegionHighlight left={SIDEBAR.left + 18} top={SIDEBAR.top + 94} width={SIDEBAR.width - 36} height={78} color="var(--primary)" />
      )}

      <Cursor x={cursorX} y={cursorY} clicking={Math.max(singleClick, phaseClick, resetClick)} />
      <StepCaption
        step={step}
        text={
          step === 1
            ? "Phase shortcuts stay hidden while multiple encounters are selected"
            : step === 2
              ? "Select one encounter and its phases appear directly underneath"
              : step === 3
                ? "Click Adds to apply that phase as the page-wide time range"
                : "Click the selected encounter to clear the phase time range"
        }
        opacity={captionOpacity}
      />
    </>
  );
}

function EncounterSidebarDemo({ singleEncounter, phaseSelected }: { singleEncounter: boolean; phaseSelected: boolean }) {
  return (
    <div className="h-full bg-[#09090b] px-5 pt-5 text-foreground">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
            Encounters
            {!singleEncounter && <span className="text-xs">(2)</span>}
          </h3>
          <div className="mt-1.5 flex gap-1">
            {[
              ["All", false],
              ["Bosses", !singleEncounter],
              ["Trash", false],
            ].map(([label, selected]) => (
              <div key={String(label)} className={`grid h-5 place-items-center rounded-md border px-1.5 text-xs ${selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-[#09090b]"}`}>
                {label}
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-3.5 w-3.5 rounded-[3px] border border-input bg-[#09090b]" />
            Include wipes
          </div>
        </div>
        <div className="-mt-1 flex items-start gap-1 text-muted-foreground">
          <div className="grid h-6 w-6 place-items-center"><Hourglass className="h-3.5 w-3.5" /></div>
          <div className="grid h-6 w-6 place-items-center"><FolderTree className="h-4 w-4" /></div>
          <div className="grid h-6 w-6 place-items-center"><PanelLeftClose className="h-4 w-4" /></div>
        </div>
      </div>

      <div className="space-y-1">
        <EncounterRow name="Razorgore the Untamed" duration="2:31" selected phases={singleEncounter} phaseSelected={phaseSelected} />
        <EncounterRow name="Vaelastrasz the Corrupt" duration="0:54" selected={!singleEncounter} />
        <EncounterRow name="Broodlord Lashlayer" duration="1:18" selected={false} />
        <EncounterRow name="Firemaw" duration="1:42" selected={false} />
        <EncounterRow name="Ebonroc" duration="1:27" selected={false} />
        <EncounterRow name="Flamegor" duration="1:09" selected={false} />
      </div>
    </div>
  );
}

function EncounterRow({ name, duration, selected, phases, phaseSelected }: { name: string; duration: string; selected: boolean; phases?: boolean; phaseSelected?: boolean }) {
  return (
    <div className={selected ? "rounded-md border-l-3 border-l-primary-foreground/70 bg-primary-darker text-primary-foreground shadow-sm" : "rounded-md"}>
      <div className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${selected ? "" : "text-foreground"}`}>
        <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
        <span className={`min-w-0 flex-1 truncate ${selected ? "font-semibold" : ""}`}>{name}</span>
        <span className={`shrink-0 font-mono text-xs ${selected ? "opacity-70" : "text-muted-foreground"}`}>{duration}</span>
      </div>
      {selected && phases && (
        <div className="flex gap-1.5 px-2 pb-2">
          <PhaseButton label="Adds" active={Boolean(phaseSelected)} grow={68} tone="violet" />
          <PhaseButton label="Boss" active={false} grow={32} tone="amber" />
        </div>
      )}
    </div>
  );
}

function PhaseButton({ label, active, grow, tone }: { label: string; active: boolean; grow: number; tone: "violet" | "amber" }) {
  const colors = tone === "violet"
    ? active
      ? "border-violet-300 bg-violet-500/45 text-violet-50 ring-1 ring-inset ring-violet-200/50"
      : "border-violet-500/40 bg-violet-500/15 text-violet-200"
    : "border-amber-500/40 bg-amber-500/15 text-amber-200";
  return (
    <div className={`flex h-7 min-w-12 items-center justify-center overflow-hidden rounded border px-2 text-[11px] font-semibold ${colors}`} style={{ flexGrow: grow, flexBasis: 0 }}>
      {label}
    </div>
  );
}
