/**
 * Feature demo: ranked speedrun timing.
 *
 * Shows why timing the whole uploaded log encouraged competitors to trim
 * pre-boss trash, then introduces boss-to-boss ranked timing so the complete
 * raid can stay intact. 710 frames @ 30fps, 1280x720.
 */
import {
  Check,
  Clock3,
  FileCheck2,
  Flag,
  Scissors,
  ShieldCheck,
  Skull,
  Swords,
  Trophy,
} from "lucide-react";
import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  LessonIntro,
  StepCaption,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

const CUT_FRAME = 145;
const RANKED_FRAME = 290;
const RESTORE_FRAME = 425;
const FINAL_FRAME = 540;

const TIMELINE_LEFT = 120;
const TIMELINE_TOP = 280;
const TIMELINE_WIDTH = 1040;
const TRASH_WIDTH = 250;
const BOSS_WIDTH = 630;
const TRAILING_WIDTH = 160;

export default function RankedSpeedrunTimingVideo() {
  return (
    <VideoStage>
      <div className="absolute inset-0 bg-[#071521]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(56,189,248,0.22),transparent_38%),radial-gradient(circle_at_18%_80%,rgba(245,158,11,0.10),transparent_34%)]" />
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Keep the full raid log"
        bullets={[
          "Trash before the first boss is excluded from speedrun timings",
          "Clear time and combat time remain for non-speedrun metrics",
          "Early trash is no longer punished in rankings",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const trimmed = frame >= CUT_FRAME && frame < RESTORE_FRAME;
  const ranked = frame >= RANKED_FRAME;
  const restored = frame >= RESTORE_FRAME;
  const final = frame >= FINAL_FRAME;

  const scissorsX = interpolate(
    frame,
    [88, 128, CUT_FRAME, CUT_FRAME + 18],
    [TIMELINE_LEFT - 80, TIMELINE_LEFT + TRASH_WIDTH - 40, TIMELINE_LEFT + TRASH_WIDTH, TIMELINE_LEFT + TRASH_WIDTH + 35],
    { ...clamp, easing: entranceEasing },
  );
  const scissorsOpacity = interpolate(frame, [76, 92, CUT_FRAME + 12, CUT_FRAME + 28], [0, 1, 1, 0], clamp);
  const trashExit = interpolate(frame, [CUT_FRAME, CUT_FRAME + 24], [0, 1], { ...clamp, easing: entranceEasing });
  const trashRestore = interpolate(frame, [RESTORE_FRAME, RESTORE_FRAME + 30], [0, 1], { ...clamp, easing: entranceEasing });
  const rankedReveal = interpolate(frame, [RANKED_FRAME, RANKED_FRAME + 32], [0, 1], { ...clamp, easing: entranceEasing });
  const finalReveal = interpolate(frame, [FINAL_FRAME, FINAL_FRAME + 24], [0, 1], { ...clamp, easing: entranceEasing });
  const captionOpacity = interpolate(frame, [8, 18, 630, 648], [0, 1, 1, 0], clamp);
  const step = final ? 5 : restored ? 4 : ranked ? 3 : trimmed ? 2 : 1;

  return (
    <>
      <VideoHeader title="Rank speedruns without trimming logs" entrance={entrance} />

      <div
        className="absolute left-[72px] top-[126px] flex items-center gap-3 rounded-full border border-zinc-700 bg-zinc-950/80 px-4 py-2 text-sm text-zinc-300 shadow-xl"
        style={{
          opacity: entrance,
          translate: `0 ${interpolate(entrance, [0, 1], [18, 0])}px`,
        }}
      >
        <FileCheck2 className="h-4 w-4 text-sky-400" />
        Upload the raid you actually played
      </div>

      <TimelineCard
        ranked={ranked}
        restored={restored}
        trashExit={trashExit}
        trashRestore={trashRestore}
        rankedReveal={rankedReveal}
        entrance={entrance}
      />

      <div
        className="absolute flex items-center gap-2 text-rose-300"
        style={{
          left: scissorsX,
          top: TIMELINE_TOP - 58,
          opacity: scissorsOpacity,
          rotate: `${interpolate(frame, [88, CUT_FRAME], [-12, 8], clamp)}deg`,
        }}
      >
        <Scissors className="h-8 w-8" />
        <span className="rounded bg-rose-950/90 px-2 py-1 text-sm font-semibold">Trim the opening?</span>
      </div>

      <MetricCards trimmed={trimmed} ranked={ranked} rankedReveal={rankedReveal} />

      <div
        className="absolute left-[930px] top-[112px] flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-950/80 px-4 py-3 text-emerald-100 shadow-2xl"
        style={{
          opacity: finalReveal,
          scale: interpolate(finalReveal, [0, 1], [0.88, 1], clamp),
        }}
      >
        <ShieldCheck className="h-7 w-7 text-emerald-400" />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-400">Fair by design</p>
          <p className="text-base font-semibold">No trimming needed</p>
        </div>
      </div>

      <StepCaption
        step={step}
        text={
          step === 1
            ? "Whole-log timing included everything before the first required boss"
            : step === 2
              ? "Trimming that trash made the same raid look faster"
              : step === 3
                ? "Ranked time is anchored to required boss encounters"
                : step === 4
                  ? "Keep the trash: it still counts toward qualification"
                  : "Upload the complete raid — the competitive timer stays fair"
        }
        opacity={captionOpacity}
      />
    </>
  );
}

function TimelineCard({
  ranked,
  restored,
  trashExit,
  trashRestore,
  rankedReveal,
  entrance,
}: {
  ranked: boolean;
  restored: boolean;
  trashExit: number;
  trashRestore: number;
  rankedReveal: number;
  entrance: number;
}) {
  const trashMuted = restored ? 1 - trashRestore : trashExit;

  return (
    <div
      className="absolute rounded-2xl border border-zinc-700 bg-zinc-950/88 p-7 shadow-2xl"
      style={{
        left: TIMELINE_LEFT - 32,
        top: TIMELINE_TOP - 42,
        width: TIMELINE_WIDTH + 64,
        height: 218,
        opacity: entrance,
        translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px`,
      }}
    >
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock3 className="h-5 w-5 text-sky-400" />
          <span className="font-semibold text-zinc-100">Uploaded combat log</span>
        </div>
        <span className="font-mono text-sm text-zinc-400">complete raid</span>
      </div>

      <div className="relative h-16 overflow-visible rounded-xl bg-zinc-900 ring-1 ring-zinc-700">
        <div
          className="absolute inset-y-0 left-0 flex items-center justify-center gap-2 rounded-l-xl border-r border-amber-300/30 bg-amber-500/20 text-amber-100"
          style={{
            width: TRASH_WIDTH,
            opacity: interpolate(trashMuted, [0, 1], [1, 0.38], clamp),
            filter: `grayscale(${trashMuted})`,
          }}
        >
          <Swords className="h-5 w-5 text-amber-400" />
          <span className="font-semibold">Pre-boss trash</span>
        </div>

        <div
          className="absolute inset-y-0 flex items-center justify-around bg-sky-500/16 px-6 text-sky-100"
          style={{
            left: TRASH_WIDTH,
            width: BOSS_WIDTH,
          }}
        >
          <BossMarker label="First required boss" first />
          <div className="h-px flex-1 bg-sky-300/30" />
          <BossMarker label="Final required boss" />
        </div>

        <div
          className="absolute inset-y-0 right-0 flex items-center justify-center gap-2 rounded-r-xl border-l border-violet-300/25 bg-violet-500/15 text-violet-100"
          style={{ width: TRAILING_WIDTH }}
        >
          <Flag className="h-4 w-4 text-violet-300" />
          <span className="text-sm font-semibold">Post-clear activity</span>
        </div>

        {ranked && (
          <div
            className="absolute -bottom-11 h-8 border-x-2 border-b-2 border-emerald-400"
            style={{
              left: TRASH_WIDTH + 18,
              width: BOSS_WIDTH - 36,
              opacity: rankedReveal,
              scale: `${interpolate(rankedReveal, [0, 1], [0.75, 1], clamp)} 1`,
            }}
          >
            <div className="absolute left-1/2 top-5 -translate-x-1/2 rounded-full bg-emerald-500 px-4 py-1 text-xs font-bold uppercase tracking-[0.15em] text-emerald-950 shadow-lg">
              Ranked time
            </div>
          </div>
        )}
      </div>

      <div className="mt-12 flex items-center gap-2 text-sm text-zinc-400">
        <Check className={`h-4 w-4 ${restored ? "text-emerald-400" : "text-zinc-500"}`} />
        Boss and trash requirements still determine qualification
      </div>
    </div>
  );
}

function BossMarker({ label, first = false }: { label: string; first?: boolean }) {
  return (
    <div className="flex w-36 shrink-0 flex-col items-center gap-1 text-center">
      <div className={`grid h-9 w-9 place-items-center rounded-full border ${first ? "border-sky-300 bg-sky-500/30" : "border-rose-300 bg-rose-500/25"}`}>
        {first ? <Skull className="h-5 w-5 text-sky-200" /> : <Trophy className="h-5 w-5 text-rose-200" />}
      </div>
      <span className="text-[11px] font-semibold leading-tight">{label}</span>
    </div>
  );
}

function MetricCards({ trimmed, ranked, rankedReveal }: { trimmed: boolean; ranked: boolean; rankedReveal: number }) {
  return (
    <div className="absolute left-[176px] top-[472px] flex gap-5">
      <div className="w-[318px] rounded-xl border border-zinc-700 bg-zinc-950/88 px-5 py-4 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Clear time</p>
        <div className="mt-1 flex items-end justify-between">
          <p className="font-mono text-[30px] font-bold text-zinc-100">2hr 24m 14s</p>
          <span className="mb-1 text-xs text-zinc-500">full raid</span>
        </div>
      </div>

      <div
        className={`w-[430px] rounded-xl border px-5 py-4 shadow-xl ${ranked ? "border-emerald-500/50 bg-emerald-950/70" : "border-rose-500/35 bg-rose-950/45"}`}
        style={{ scale: ranked ? interpolate(rankedReveal, [0, 1], [0.94, 1], clamp) : 1 }}
      >
        <p className={`text-xs font-bold uppercase tracking-[0.16em] ${ranked ? "text-emerald-400" : "text-rose-300"}`}>
          {ranked ? "Ranked time" : "Old competitive time"}
        </p>
        <div className="mt-1 flex items-end justify-between">
          <p className={`font-mono text-[30px] font-bold ${ranked ? "text-emerald-100" : "text-rose-100"}`}>
            {ranked || trimmed ? "2hr 10m 24s" : "2hr 24m 14s"}
          </p>
          <span className={`mb-1 text-xs ${ranked ? "text-emerald-300/70" : "text-rose-300/70"}`}>
            {ranked ? "boss to boss" : "invites trimming"}
          </span>
        </div>
      </div>
    </div>
  );
}
