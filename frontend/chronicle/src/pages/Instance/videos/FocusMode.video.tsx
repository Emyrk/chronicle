/**
 * Announcement: focus mode.
 *
 * A mock instance page in a browser window. Shift+F folds the site chrome
 * away so only the encounters, presets and layout remain; Ctrl+Shift+F also
 * takes the browser fullscreen; Exit focus (or Esc) brings it all back.
 * 630 frames @ 30fps, 1280x720.
 */
import type { ReactNode } from "react";
import { CheckCircle, Maximize2, Minimize2, Pause, RotateCcw, Skull, Users } from "lucide-react";
import { interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, entranceEasing, INTRO_FRAMES } from "@/pages/Instance/PanelExplainer/videos/animation";
import { Cursor, LessonIntro, StepCaption, VideoStage } from "@/pages/Instance/PanelExplainer/videos/shared";

// Content-local frames (the content mounts at INTRO_FRAMES - 10).
const SHIFT_F = 150;
const CTRL_SHIFT_F = 300;
const EXIT = 452;
const TRANSITION = 32;

// The browser window before fullscreen; fullscreen grows it to the whole stage.
const WINDOW = { left: 112, top: 34, width: 1056, height: 500 };
const STAGE = { width: 1280, height: 720 };
const BROWSER_BAR = 34;
const NAVBAR = 36;
const TITLE_CARD = 58;
const ENTITY_BAR = 40;
const PRESET_ROW = 30;
const PAGE_PAD = 10;

const ease = { ...clamp, easing: entranceEasing };

export default function FocusModeVideo() {
  return (
    <VideoStage>
      <div className="absolute inset-0 bg-[#0b1b2a]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_22%,rgba(56,189,248,0.28),transparent_42%),linear-gradient(135deg,rgba(15,23,42,0.15),rgba(8,47,73,0.42))]" />
      <Sequence from={INTRO_FRAMES - 10}>
        <Content />
      </Sequence>
      <LessonIntro
        title="Focus mode"
        bullets={[
          "Hide everything but the encounters, presets and your layout",
          <>Press <Kbd>Shift</Kbd> + <Kbd>F</Kbd> to toggle focus</>,
          <>Press <Kbd>Ctrl</Kbd> + <Kbd>Shift</Kbd> + <Kbd>F</Kbd> for browser fullscreen too</>,
        ]}
      />
    </VideoStage>
  );
}

function Content() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 28 });

  // 0 = normal page, 1 = focus mode; fullscreen likewise.
  const focus = interpolate(frame, [SHIFT_F, SHIFT_F + TRANSITION, EXIT, EXIT + TRANSITION], [0, 1, 1, 0], ease);
  const fullscreen = interpolate(frame, [CTRL_SHIFT_F, CTRL_SHIFT_F + TRANSITION, EXIT, EXIT + TRANSITION], [0, 1, 1, 0], ease);

  const win = {
    left: interpolate(fullscreen, [0, 1], [WINDOW.left, 0]),
    top: interpolate(fullscreen, [0, 1], [WINDOW.top, 0]),
    width: interpolate(fullscreen, [0, 1], [WINDOW.width, STAGE.width]),
    height: interpolate(fullscreen, [0, 1], [WINDOW.height, STAGE.height]),
  };
  const browserBar = BROWSER_BAR * (1 - fullscreen);

  // Where Exit focus sits once focused and fullscreen, for the cursor.
  const exitX = STAGE.width - PAGE_PAD - 62;
  const exitY = PAGE_PAD + PRESET_ROW / 2 + 2;
  const cursorX = interpolate(frame, [SHIFT_F + 60, 400, EXIT], [1180, 900, exitX], ease);
  const cursorY = interpolate(frame, [SHIFT_F + 60, 400, EXIT], [660, 360, exitY], ease);
  const cursorOpacity = interpolate(frame, [370, 390, EXIT + 40, EXIT + 60], [0, 1, 1, 0], clamp);
  const exitClick = interpolate(frame, [EXIT - 4, EXIT, EXIT + 10], [0, 1, 0], clamp);

  const step = frame >= EXIT - 30 ? 4 : frame >= CTRL_SHIFT_F - 20 ? 3 : frame >= SHIFT_F - 20 ? 2 : 1;
  const captionOpacity = interpolate(frame, [8, 18, 560, 575], [0, 1, 1, 0], clamp);
  // Captions sit over the page once it is fullscreen; give them a backdrop then.
  const captionBackdrop = interpolate(fullscreen, [0.3, 1], [0, 1], clamp);

  return (
    <>
      <div
        className="absolute overflow-hidden border border-zinc-700 bg-[#0a0a0b] shadow-2xl"
        style={{
          ...win,
          borderRadius: interpolate(fullscreen, [0, 1], [12, 0]),
          opacity: entrance,
          translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px`,
        }}
      >
        <BrowserBar height={browserBar} focused={focus > 0.5} />
        <MockPage focus={focus} height={win.height - browserBar} frame={frame} />
      </div>

      <Keys keys={["Shift", "F"]} frame={frame} at={SHIFT_F} />
      <Keys keys={["Ctrl", "Shift", "F"]} frame={frame} at={CTRL_SHIFT_F} />
      <Keys keys={["Esc"]} frame={frame} at={EXIT} label="or click Exit focus" />

      <div style={{ opacity: cursorOpacity }}>
        <Cursor x={cursorX} y={cursorY} clicking={exitClick} />
      </div>

      <div
        className="absolute inset-x-0 bottom-0 h-[170px] bg-gradient-to-t from-black/90 via-black/70 to-transparent"
        style={{ opacity: captionBackdrop * captionOpacity, zIndex: 205 }}
      />
      <div style={{ position: "absolute", inset: 0, zIndex: 206 }}>
        <StepCaption
          step={step}
          opacity={captionOpacity}
          text={
            step === 1
              ? "A lot of the page sits around your layout"
              : step === 2
                ? <>Shift+F: just the encounters, presets and layout</>
                : step === 3
                  ? <>Ctrl+Shift+F: focus mode, browser fullscreen too</>
                  : "Esc or Exit focus brings everything back"
          }
        />
      </div>
    </>
  );
}

function BrowserBar({ height, focused }: { height: number; focused: boolean }) {
  return (
    <div className="flex items-center gap-3 overflow-hidden border-b border-zinc-800 bg-[#18181b] px-3" style={{ height, opacity: height / BROWSER_BAR }}>
      <div className="flex gap-1.5">
        <span className="h-3 w-3 rounded-full bg-red-500/80" />
        <span className="h-3 w-3 rounded-full bg-amber-400/80" />
        <span className="h-3 w-3 rounded-full bg-green-500/80" />
      </div>
      <div className="flex-1 truncate rounded-md bg-[#0a0a0b] px-3 py-1 font-mono text-[11px] text-zinc-400">
        chronicleclassic.com/instances/zul-gurub{focused ? <span className="text-primary">?focus=1</span> : null}
      </div>
    </div>
  );
}

/** Collapses to nothing as `focus` goes 0 → 1. */
function Folding({ height, focus, children }: { height: number; focus: number; children: ReactNode }) {
  return (
    <div className="shrink-0 overflow-hidden" style={{ height: height * (1 - focus), opacity: 1 - focus }}>
      {children}
    </div>
  );
}

function MockPage({ focus, height, frame }: { focus: number; height: number; frame: number }) {
  return (
    <div className="relative flex flex-col" style={{ height, background: `color-mix(in oklch, var(--primary) ${6 * focus}%, #0a0a0b)` }}>
      <div className="absolute inset-x-0 top-0 h-[2px] bg-primary" style={{ opacity: focus }} />
      <Folding height={NAVBAR} focus={focus}>
        <div className="flex h-full items-center justify-between border-b border-zinc-800 px-5">
          <span className="font-wow text-lg text-[var(--color-class-warrior)]">Chronicle</span>
          <div className="flex items-center gap-4 text-xs text-zinc-400">
            <span>Recent</span>
            <span>Explore</span>
            <span className="rounded bg-primary-darker px-2 py-1 text-zinc-100">Sign In</span>
          </div>
        </div>
      </Folding>
      <div className="flex min-h-0 flex-1 flex-col" style={{ padding: PAGE_PAD }}>
        <Folding height={TITLE_CARD} focus={focus}>
          <div className="mb-2 flex h-[50px] items-center rounded-lg border border-zinc-800 bg-gradient-to-r from-emerald-950/70 to-zinc-900 px-4">
            <span className="text-xl font-bold">Zul'Gurub</span>
            <span className="ml-3 text-xs text-zinc-400">37m 27s elapsed</span>
          </div>
        </Folding>
        <div className="flex min-h-0 flex-1 gap-3">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Folding height={ENTITY_BAR} focus={focus}>
              <div className="mb-2 flex h-8 items-center gap-2 rounded-lg border border-zinc-800 bg-[#111113] px-3 text-xs">
                <span className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5"><Skull className="h-3 w-3" />Enemies (5)</span>
                <span className="flex items-center gap-1 px-2 py-0.5 text-zinc-400"><Users className="h-3 w-3" />Players (16)</span>
              </div>
            </Folding>
            <PresetRow focused={focus > 0.5} />
            <MapLayout frame={frame} />
          </div>
        </div>
      </div>
      <Folding height={34} focus={focus}>
        <div className="flex h-full items-center gap-6 border-t border-zinc-800 px-5 text-[11px] text-zinc-500">
          <span>Navigation</span>
          <span>Community</span>
          <span>Contribute</span>
        </div>
      </Folding>
    </div>
  );
}

function Sidebar() {
  const encounters = [
    ["Jin'do the Hexxer", "0:22"],
    ["High Priest Thekal", "1:20"],
    ["Bloodlord Mandokir", "0:43"],
    ["High Priest Venoxis", "1:50"],
    ["Hakkar", "0:53"],
  ];
  return (
    <div className="w-[176px] shrink-0 border-r border-zinc-800 pr-3">
      <p className="mb-2 text-xs font-medium text-zinc-400">Encounters</p>
      <div className="space-y-1">
        {encounters.map(([name, duration], index) => (
          <div key={name} className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-[11px] ${index === 1 ? "bg-primary-darker font-semibold" : ""}`}>
            <CheckCircle className="h-3 w-3 shrink-0 text-green-500" />
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <span className="font-mono text-[10px] text-zinc-400">{duration}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PresetRow({ focused }: { focused: boolean }) {
  return (
    <div className="mb-2 flex shrink-0 items-center gap-1 text-[11px]" style={{ height: PRESET_ROW }}>
      {["Summary", "Damage", "Healing", "Deaths", "Player Timeline", "Map", "Loot"].map((label) => (
        <span key={label} className={`rounded px-2 py-1 ${label === "Map" ? "bg-primary text-primary-foreground" : "text-zinc-400"}`}>{label}</span>
      ))}
      <span className={`ml-auto flex items-center gap-1 rounded px-2 py-1 font-medium ${focused ? "text-red-400" : "text-zinc-400"}`}>
        {focused ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        {focused ? "Exit focus" : "Focus"}
      </span>
    </div>
  );
}

// Deterministic party-damage bars for the replay strip.
const BARS = Array.from({ length: 64 }, (_, index) => 25 + ((index * 37) % 61) + (index % 7 === 0 ? 10 : 0));
const UNITS = [
  [46, 44, "#C79C6E"], [50, 49, "#F58CBA"], [44, 52, "#0070DE"], [53, 41, "#69CCF0"],
  [48, 56, "#ABD473"], [55, 50, "#FFF569"], [42, 47, "#FF7D0A"], [51, 45, "#9482C9"],
] as const;

function MapLayout({ frame }: { frame: number }) {
  const progress = ((frame * 0.004) % 1) * 100;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1 overflow-hidden border border-zinc-800 bg-[radial-gradient(ellipse_at_50%_55%,#5b4a26,#2a2414_55%,#121009)]">
        <div className="absolute left-3 top-2 text-[11px] font-medium text-zinc-300">Map</div>
        <div className="absolute inset-[18%] rounded-[40%] bg-[radial-gradient(ellipse,#4d6b2b_0%,#3a4f22_45%,transparent_70%)] opacity-80" />
        <div className="absolute left-3 top-7 grid grid-cols-2 gap-0.5">
          {UNITS.slice(0, 6).map(([, , color], index) => (
            <div key={index} className="h-3 w-16 rounded-sm bg-black/70">
              <div className="h-full rounded-sm" style={{ width: `${60 + ((index * 23) % 40)}%`, background: color }} />
            </div>
          ))}
        </div>
        {UNITS.map(([x, y, color], index) => (
          <span
            key={index}
            className="absolute h-2.5 w-2.5 rounded-full border border-black/70"
            style={{ left: `${x + Math.sin((frame + index * 9) / 18) * 1.2}%`, top: `${y + Math.cos((frame + index * 7) / 22) * 1.2}%`, background: color }}
          />
        ))}
        <span className="absolute h-4 w-4 rounded-full border-2 border-black/70 bg-[var(--color-class-enemy)]" style={{ left: "49%", top: "47%" }} />
      </div>
      <div className="flex h-[54px] shrink-0 items-center gap-2 border-x border-b border-zinc-800 bg-card px-2">
        <span className="grid h-6 w-6 place-items-center rounded border border-zinc-700"><Pause className="h-3 w-3" /></span>
        <span className="grid h-6 w-6 place-items-center rounded border border-zinc-700"><RotateCcw className="h-3 w-3" /></span>
        <span className="font-mono text-[11px] text-[var(--color-class-warrior)]">{formatClock(progress * 0.8)}</span>
        <div className="relative h-9 flex-1">
          <div className="absolute inset-x-0 bottom-2 top-0 flex items-end gap-px">
            {BARS.map((height, index) => (
              <span
                key={index}
                className="flex-1 rounded-t-[1px]"
                style={{ height: `${height}%`, background: (index + 0.5) / BARS.length * 100 <= progress ? "var(--chart-3)" : "rgba(255,255,255,.08)" }}
              />
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-1 rounded-sm bg-[#3a3a3a]">
            <div className="h-full rounded-sm bg-[var(--color-class-warrior)]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function formatClock(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${(whole % 60).toString().padStart(2, "0")}`;
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <span className="mx-1 inline-flex min-w-9 items-center justify-center rounded-md border border-zinc-500 border-b-4 bg-zinc-800 px-2 py-0.5 font-mono text-[0.8em] font-semibold text-zinc-100">
      {children}
    </span>
  );
}

/** Keycaps that pop in before `at`, press down at `at`, and fade after. */
function Keys({ keys, frame, at, label }: { keys: string[]; frame: number; at: number; label?: string }) {
  const { fps } = useVideoConfig();
  const appear = spring({ frame: frame - (at - 22), fps, config: { damping: 14, stiffness: 160 } });
  const visible = interpolate(frame, [at - 22, at - 14, at + 62, at + 76], [0, 1, 1, 0], clamp);
  const press = interpolate(frame, [at - 3, at, at + 6], [0, 1, 0], clamp);
  if (visible <= 0) return null;
  return (
    <div
      className="absolute left-1/2 top-[300px] flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-black/55 px-6 py-5 backdrop-blur-sm"
      style={{ opacity: visible, scale: interpolate(appear, [0, 1], [0.7, 1]), zIndex: 215 }}
    >
      {keys.map((key, index) => (
        <div key={key} className="flex items-center gap-2">
          {index > 0 && <span className="text-2xl font-bold text-zinc-300">+</span>}
          <span
            className="grid h-14 min-w-14 place-items-center rounded-lg border-2 border-zinc-400 bg-zinc-800 px-3 font-mono text-xl font-bold text-zinc-50 shadow-[0_6px_0_#27272a,0_10px_24px_rgba(0,0,0,.6)]"
            style={{ translate: `0 ${press * 5}px`, boxShadow: press > 0.5 ? "0 1px 0 #27272a,0 4px 14px rgba(0,0,0,.6)" : undefined }}
          >
            {key}
          </span>
        </div>
      ))}
      {label && <span className="ml-2 text-lg font-semibold text-zinc-200 drop-shadow">{label}</span>}
    </div>
  );
}
