/**
 * Feature demo: Replay.
 *
 * Shows how the desktop Replay controls move a combat-log playhead and how
 * panels interpret that timestamp. 700 frames @ 30fps, 1280x720.
 */
import {
  Activity,
  ChevronUp,
  Clock3,
  HeartPulse,
  Pause,
  Play,
  RotateCcw,
  Skull,
  SkipBack,
  SkipForward,
  Timer,
  Youtube,
} from "lucide-react";
import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  Cursor,
  LessonIntro,
  VideoHeader,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

const OPEN_FRAME = 86;
const EXPAND_FRAME = 176;
const SCRUB_FRAME = 282;
const STEP_FRAME = 402;
const SPEED_FRAME = 492;
const VIDEO_FRAME = 568;
const FINAL_FRAME = 620;

export default function ReplayExplainerVideo() {
  return (
    <VideoStage>
      <div className="absolute inset-0 bg-[#071521]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(56,189,248,0.22),transparent_38%),radial-gradient(circle_at_18%_80%,rgba(239,68,68,0.10),transparent_34%)]" />
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Replay a fight moment by moment"
        bullets={[
          "Play, pause, or scrub through the selected encounter",
          "Use death markers and precise steps to inspect key moments",
          "Watch compatible panels update at the same combat-log timestamp",
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });
  const replayOpen = frame >= OPEN_FRAME + 7;
  const expanded = frame >= EXPAND_FRAME + 7 && frame < FINAL_FRAME;
  const scrubbed = frame >= SCRUB_FRAME + 7;
  const stepped = frame >= STEP_FRAME + 7;
  const fast = frame >= SPEED_FRAME + 7;
  const videoDriving = frame >= VIDEO_FRAME + 7 && frame < FINAL_FRAME;
  const final = frame >= FINAL_FRAME;

  const cursorX = interpolate(
    frame,
    [18, 64, OPEN_FRAME, 135, EXPAND_FRAME, 230, SCRUB_FRAME, 354, STEP_FRAME, 460, SPEED_FRAME, 545, VIDEO_FRAME, 612],
    [1130, 1070, 1070, 1090, 1090, 730, 730, 645, 645, 858, 858, 1162, 1162, 1140],
    { ...clamp, easing: entranceEasing },
  );
  const cursorY = interpolate(
    frame,
    [18, 64, OPEN_FRAME, 135, EXPAND_FRAME, 230, SCRUB_FRAME, 354, STEP_FRAME, 460, SPEED_FRAME, 545, VIDEO_FRAME, 612],
    [630, 136, 136, 644, 644, 542, 542, 607, 607, 629, 629, 136, 136, 620],
    { ...clamp, easing: entranceEasing },
  );
  const click = Math.max(
    clickPulse(frame, OPEN_FRAME),
    clickPulse(frame, EXPAND_FRAME),
    clickPulse(frame, SCRUB_FRAME),
    clickPulse(frame, STEP_FRAME),
    clickPulse(frame, SPEED_FRAME),
    clickPulse(frame, VIDEO_FRAME),
  );
  const playhead = interpolate(
    frame,
    [OPEN_FRAME + 7, 250, SCRUB_FRAME, SCRUB_FRAME + 14, STEP_FRAME, STEP_FRAME + 14, SPEED_FRAME, VIDEO_FRAME, FINAL_FRAME],
    [3, 18, 18, 58, 58, 61, 72, 86, 92],
    clamp,
  );
  const step = final ? 7 : videoDriving ? 6 : fast ? 5 : stepped ? 4 : scrubbed ? 3 : expanded ? 2 : 1;
  const captionOpacity = interpolate(frame, [8, 18, 628, 646], [0, 1, 1, 0], clamp);

  return (
    <>
      <VideoHeader title="Replay the selected encounter" entrance={entrance} />
      <InstanceChrome entrance={entrance} replayOpen={replayOpen} videoDriving={videoDriving} />
      <PanelGrid playhead={playhead} replayOpen={replayOpen} final={final} />
      {replayOpen && !expanded && !final ? <CompactReplay playhead={playhead} /> : null}
      {expanded ? (
        <ExpandedReplay
          playhead={playhead}
          stepped={stepped}
          fast={fast}
          videoDriving={videoDriving}
        />
      ) : null}
      {final ? <FinalCard frame={frame - FINAL_FRAME} /> : null}
      {!final ? <Cursor x={cursorX} y={cursorY} clicking={click} /> : null}
      {!final ? (
        <ReplayCaption
          step={step}
          text={
            step === 1
              ? "Choose an encounter, then click Replay on desktop"
              : step === 2
                ? "Expand for precise start, end, and step controls"
                : step === 3
                  ? "Scrub to a skull marker near a player death"
                  : step === 4
                    ? "Step by 100ms or 1s to inspect the sequence"
                    : step === 5
                      ? "Play from 0.25× through 4×"
                      : "A synced VOD can drive the same Replay timestamp"
          }
          opacity={captionOpacity}
        />
      ) : null}
    </>
  );
}

function ReplayCaption({ step, text, opacity }: { step: number; text: string; opacity: number }) {
  return (
    <div className="absolute right-[72px] top-[48px] flex max-w-[570px] items-center justify-end gap-3 text-right" style={{ opacity }}>
      <p className="text-[19px] font-semibold leading-tight text-zinc-200">{text}</p>
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky-500 text-sm font-bold text-sky-950 shadow-lg">{step}</div>
    </div>
  );
}

function InstanceChrome({ entrance, replayOpen, videoDriving }: { entrance: number; replayOpen: boolean; videoDriving: boolean }) {
  return (
    <div
      className="absolute left-[72px] right-[72px] top-[112px] flex h-12 items-center rounded-lg border border-zinc-700 bg-zinc-950/90 px-4 shadow-xl"
      style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [18, 0])}px` }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="grid h-7 w-7 place-items-center rounded bg-sky-500/15 text-sky-300"><Skull className="h-4 w-4" /></div>
        <div>
          <p className="text-sm font-semibold text-zinc-100">Razorgore the Untamed</p>
          <p className="font-mono text-[10px] text-zinc-500">2:31 · selected encounter</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className={`flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold ${replayOpen ? "border-sky-400 bg-sky-500 text-sky-950" : "border-zinc-700 bg-zinc-900 text-zinc-200"}`}>
          <Timer className="h-4 w-4" /> Replay
        </div>
        <div className={`flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold ${videoDriving ? "border-red-400 bg-red-500 text-white" : "border-zinc-700 bg-zinc-900 text-zinc-200"}`}>
          <Youtube className="h-4 w-4" /> Video
        </div>
      </div>
    </div>
  );
}

function PanelGrid({ playhead, replayOpen, final }: { playhead: number; replayOpen: boolean; final: boolean }) {
  const damage = Math.round(184000 + playhead * 9100);
  const healing = Math.round(151000 + playhead * 6700);
  const deaths = playhead < 58 ? 0 : playhead < 76 ? 1 : 2;
  return (
    <div className="absolute left-[72px] right-[72px] top-[178px] grid h-[330px] grid-cols-2 gap-4" style={{ opacity: final ? 0.18 : 1 }}>
      <MetricPanel icon={<Activity className="h-4 w-4 text-rose-300" />} title="Damage Done">
        <MetricRow name="Dreadnaught" value={damage} color="bg-amber-400" width={Math.min(96, 34 + playhead * 0.56)} />
        <MetricRow name="Welfs" value={Math.round(damage * 0.86)} color="bg-sky-400" width={Math.min(88, 29 + playhead * 0.5)} />
        <MetricRow name="Saelene" value={Math.round(damage * 0.71)} color="bg-violet-400" width={Math.min(80, 24 + playhead * 0.44)} />
        <p className="mt-3 text-[10px] text-zinc-500">{replayOpen ? "Totals through the Replay cursor" : "Full encounter totals"}</p>
      </MetricPanel>
      <MetricPanel icon={<HeartPulse className="h-4 w-4 text-emerald-300" />} title="Healing Done">
        <MetricRow name="Lifebloom" value={healing} color="bg-emerald-400" width={Math.min(94, 31 + playhead * 0.57)} />
        <MetricRow name="Saelene" value={Math.round(healing * 0.79)} color="bg-violet-400" width={Math.min(84, 27 + playhead * 0.49)} />
        <MetricRow name="Welfs" value={Math.round(healing * 0.66)} color="bg-sky-400" width={Math.min(76, 22 + playhead * 0.43)} />
        <p className="mt-3 text-[10px] text-zinc-500">Per-second values use elapsed Replay time</p>
      </MetricPanel>
      <div className="col-span-2 grid grid-cols-[1.55fr_1fr] gap-4">
        <div className="rounded-xl border border-zinc-700 bg-zinc-950/88 px-5 py-4 shadow-xl">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">Raid durability</p>
            <p className="font-mono text-sm text-emerald-300">{40 - deaths}/40 active</p>
          </div>
          <div className="relative mt-4 flex h-12 items-end gap-1 overflow-hidden rounded-md bg-zinc-900 p-1.5">
            {Array.from({ length: 36 }, (_, index) => {
              const x = (index / 35) * 100;
              const height = index < 20 ? 82 - index * 0.6 : index < 27 ? 70 - (index - 20) * 5 : 38 + (index - 27) * 2;
              const future = x > playhead;
              return <div key={index} className={`flex-1 rounded-sm ${height < 50 ? "bg-rose-500" : height < 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ height: `${height}%`, opacity: future && replayOpen ? 0.2 : 0.78 }} />;
            })}
            {replayOpen ? <div className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_10px_white]" style={{ left: `${playhead}%` }} /> : null}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-700 bg-zinc-950/88 px-5 py-4 shadow-xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">Death log</p>
          <DeathRow name="Dreadnaught" time="1:27.4" active={playhead >= 58} />
          <DeathRow name="Welfs" time="1:54.1" active={playhead >= 76} />
        </div>
      </div>
    </div>
  );
}

function MetricPanel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-950/88 px-5 py-4 shadow-xl">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">{icon}{title}</div>
      {children}
    </div>
  );
}

function MetricRow({ name, value, color, width }: { name: string; value: number; color: string; width: number }) {
  return (
    <div className="mb-2.5 grid grid-cols-[92px_1fr_72px] items-center gap-3 text-xs">
      <span className="truncate font-medium text-zinc-200">{name}</span>
      <div className="h-3 overflow-hidden rounded-sm bg-zinc-800"><div className={`h-full rounded-sm ${color}`} style={{ width: `${width}%` }} /></div>
      <span className="text-right font-mono text-zinc-400">{Math.round(value / 1000)}k</span>
    </div>
  );
}

function DeathRow({ name, time, active }: { name: string; time: string; active: boolean }) {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2" style={{ opacity: active ? 1 : 0.28 }}>
      <Skull className="h-4 w-4 text-rose-400" />
      <span className="min-w-0 flex-1 truncate text-xs font-semibold">{name}</span>
      <span className="font-mono text-[10px] text-zinc-500">{time}</span>
    </div>
  );
}

function CompactReplay({ playhead }: { playhead: number }) {
  return (
    <div className="absolute bottom-[56px] left-1/2 flex h-14 w-[830px] -translate-x-1/2 items-center gap-3 rounded-lg border border-sky-400/40 bg-[#07111d]/95 px-4 shadow-2xl">
      <span className="h-2.5 w-2.5 rounded-full bg-zinc-500" />
      <div className="grid h-8 w-8 place-items-center rounded-md border border-zinc-700 bg-zinc-900"><Play className="h-4 w-4" /></div>
      <div className="grid h-8 w-8 place-items-center rounded-md border border-zinc-700 bg-zinc-900"><RotateCcw className="h-4 w-4" /></div>
      <span className="w-16 font-mono text-sm text-sky-300">{clockFor(playhead)}</span>
      <ReplayTrack playhead={playhead} />
      <SpeedChip label="1×" active />
      <ChevronUp className="h-4 w-4 text-zinc-400" />
    </div>
  );
}

function ExpandedReplay({ playhead, stepped, fast, videoDriving }: { playhead: number; stepped: boolean; fast: boolean; videoDriving: boolean }) {
  return (
    <div className="absolute bottom-[44px] left-1/2 w-[870px] -translate-x-1/2 overflow-hidden rounded-xl border border-sky-400/45 bg-[#07111d]/97 shadow-[0_24px_80px_rgba(0,0,0,.65)]">
      <div className="flex h-10 items-center justify-between border-b border-zinc-700 bg-zinc-900/80 px-4">
        <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${videoDriving ? "bg-red-500" : "bg-zinc-500"}`} /><span className="text-sm font-semibold">Replay Controls</span></div>
        <span className="text-xs text-zinc-400">{videoDriving ? "youtube driving" : stepped ? "paused · scrub or step" : "paused"}</span>
      </div>
      <div className="px-4 pt-3">
        <div className="mb-1 flex justify-between font-mono text-[11px] text-zinc-500"><span>{clockFor(playhead)}</span><span>2:31.000</span></div>
        <ReplayTrack playhead={playhead} />
      </div>
      <div className="flex items-center gap-2 px-4 py-3">
        <TransportButton><Pause className="h-4 w-4" /></TransportButton>
        <TransportButton><RotateCcw className="h-4 w-4" /></TransportButton>
        <span className="mx-1 h-6 w-px bg-zinc-700" />
        <TransportButton><SkipBack className="h-4 w-4" /></TransportButton>
        <StepButton label="−1s" />
        <StepButton label="−100ms" />
        <StepButton label="+100ms" active={stepped} />
        <StepButton label="+1s" />
        <TransportButton><SkipForward className="h-4 w-4" /></TransportButton>
      </div>
      <div className="flex h-11 items-center gap-2.5 border-t border-zinc-700 px-4">
        <Clock3 className="h-4 w-4 text-zinc-500" /><span className="mr-1 text-xs text-zinc-400">Speed:</span>
        <SpeedChip label="0.25×" />
        <SpeedChip label="0.5×" />
        <SpeedChip label="1×" active={!fast} />
        <SpeedChip label="2×" active={fast} />
        <SpeedChip label="4×" />
        {videoDriving ? <span className="ml-auto text-[11px] font-medium text-red-300">Video is controlling replay</span> : null}
      </div>
    </div>
  );
}

function ReplayTrack({ playhead }: { playhead: number }) {
  return (
    <div className="relative h-5 min-w-0 flex-1">
      <div className="absolute inset-x-0 top-2 h-1 rounded-full bg-zinc-700"><div className="h-full rounded-full bg-sky-400" style={{ width: `${playhead}%` }} /></div>
      {[58, 76].map((position) => <Skull key={position} className="absolute top-[-6px] h-3.5 w-3.5 -translate-x-1/2 text-rose-400" style={{ left: `${position}%` }} />)}
      <div className="absolute top-[3px] h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white bg-sky-400 shadow" style={{ left: `${playhead}%` }} />
    </div>
  );
}

function TransportButton({ children }: { children: React.ReactNode }) {
  return <div className="grid h-8 w-9 place-items-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200">{children}</div>;
}

function StepButton({ label, active = false }: { label: string; active?: boolean }) {
  return <div className={`grid h-8 flex-1 place-items-center rounded-md border font-mono text-[11px] ${active ? "border-sky-400 bg-sky-500/20 text-sky-200" : "border-zinc-700 bg-zinc-900 text-zinc-300"}`}>{label}</div>;
}

function SpeedChip({ label, active = false }: { label: string; active?: boolean }) {
  return <div className={`rounded-md border px-2 py-1 font-mono text-[10px] ${active ? "border-sky-400 bg-sky-500 text-sky-950" : "border-zinc-700 bg-zinc-900 text-zinc-400"}`}>{label}</div>;
}

function FinalCard({ frame }: { frame: number }) {
  const entrance = spring({ frame, fps: 30, config: { damping: 200 }, durationInFrames: 28 });
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#071521]/94">
      <div className="flex max-w-[890px] flex-col items-center text-center" style={{ opacity: entrance, scale: interpolate(entrance, [0, 1], [0.94, 1], clamp) }}>
        <div className="mb-6 grid h-20 w-20 place-items-center rounded-3xl border border-sky-300/35 bg-sky-400/10 shadow-[0_0_70px_rgba(56,189,248,.22)]"><Timer className="h-10 w-10 text-sky-300" /></div>
        <h2 className="font-wow text-[58px] font-bold leading-tight">Pause on the moment that matters.</h2>
        <p className="mt-5 text-[25px] text-zinc-300">Replay is available on desktop instance pages.</p>
        <div className="mt-8 flex items-center gap-3 rounded-full border border-zinc-700 bg-zinc-950/80 px-5 py-3 text-base text-zinc-300"><Play className="h-4 w-4 fill-sky-300 text-sky-300" /> Select an encounter. Click Replay. Start investigating.</div>
      </div>
    </div>
  );
}

function clickPulse(frame: number, at: number): number {
  return interpolate(frame, [at - 4, at, at + 10], [0, 1, 0], clamp);
}

function clockFor(progress: number): string {
  const seconds = Math.round((progress / 100) * 1510) / 10;
  const min = Math.floor(seconds / 60);
  const sec = seconds - min * 60;
  return `${min}:${sec.toFixed(1).padStart(4, "0")}`;
}
