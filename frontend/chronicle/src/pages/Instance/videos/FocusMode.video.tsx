/**
 * Announcement: focus mode.
 *
 * A mock instance page (Player Timeline) in a browser window. Shift+F folds the site chrome
 * away so only the encounters, presets and layout remain; Ctrl+Shift+F also
 * takes the browser fullscreen; Exit focus (or Esc) brings it all back.
 * 630 frames @ 30fps, 1280x720.
 */
import type { ReactNode } from "react";
import { CheckCircle, Maximize2, Minimize2, Skull, Users } from "lucide-react";
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
            <PlayerTimelineLayout frame={frame} />
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
        <span key={label} className={`rounded px-2 py-1 ${label === "Player Timeline" ? "bg-primary text-primary-foreground" : "text-zinc-400"}`}>{label}</span>
      ))}
      <span className={`ml-auto flex items-center gap-1 rounded px-2 py-1 font-medium ${focused ? "text-red-400" : "text-zinc-400"}`}>
        {focused ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        {focused ? "Exit focus" : "Focus"}
      </span>
    </div>
  );
}

// A rough Player Timeline: DPS overview, time ruler, and per-player lanes of
// casts, buffs and cooldowns, all deterministic so every render matches.
const TIMELINE_SECONDS = 80;
const PLAYERS = [
  { name: "Gogus", spec: "Frost Mage", color: "#69CCF0", schools: ["var(--color-school-frost)", "var(--color-school-arcane)", "var(--color-school-fire)"], seed: 3 },
  { name: "Welf", spec: "Fury Warrior", color: "#C79C6E", schools: ["var(--color-school-physical)", "var(--color-school-physical)", "var(--color-school-fire)"], seed: 7 },
] as const;

function casts(seed: number) {
  const out: { start: number; width: number; school: number }[] = [];
  let at = 0.5;
  for (let index = 0; at < TIMELINE_SECONDS - 1; index++) {
    const width = 1 + ((index * seed) % 3) * 0.6;
    out.push({ start: at, width, school: (index * seed + seed) % 3 });
    // An occasional idle gap reads as the timeline's empty space.
    at += width + (index % 9 === seed % 9 ? 3 : 0.35);
  }
  return out;
}

function dpsLine(seed: number): string {
  return Array.from({ length: 41 }, (_, index) => {
    const x = (index / 40) * 100;
    const y = 70 - (Math.sin(index * 0.45 + seed) * 18 + Math.sin(index * 1.3 + seed * 2) * 9 + 22);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

const PLAYER_CASTS = PLAYERS.map((player) => casts(player.seed));
const PLAYER_LINES = PLAYERS.map((player) => dpsLine(player.seed));

function PlayerTimelineLayout({ frame }: { frame: number }) {
  const cursor = ((frame * 0.0035) % 1) * 100;
  const pct = (seconds: number) => `${(seconds / TIMELINE_SECONDS) * 100}%`;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-zinc-800 bg-[#0d0d10]">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-1.5 text-[11px]">
        <span className="flex items-center gap-2">
          <span style={{ color: PLAYERS[0].color }}>{PLAYERS[0].name}</span>
          <span className="text-zinc-500">vs</span>
          <span style={{ color: PLAYERS[1].color }}>{PLAYERS[1].name}</span>
        </span>
        <span className="flex items-center gap-2 text-zinc-400">
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-100">DPS</span>
          <span>HPS</span>
          <span className="font-mono text-[var(--color-class-warrior)]">{formatClock((cursor / 100) * TIMELINE_SECONDS)}</span>
        </span>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* DPS overview */}
        <div className="relative ml-[104px] shrink-0 basis-[28%] border-b border-zinc-800">
          <svg viewBox="0 0 100 70" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            {PLAYER_LINES.map((points, index) => (
              <polyline key={index} points={points} fill="none" stroke={PLAYERS[index].color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
        </div>
        {/* Ruler */}
        <div className="relative ml-[104px] h-4 shrink-0 border-b border-zinc-800 font-mono text-[9px] text-zinc-500">
          {[0, 20, 40, 60, 80].map((seconds) => (
            <span key={seconds} className="absolute top-0.5 -translate-x-1/2" style={{ left: pct(seconds) }}>{formatClock(seconds)}</span>
          ))}
        </div>
        {/* Player lanes */}
        <div className="flex min-h-0 flex-1 flex-col gap-5 pt-3">
          {PLAYERS.map((player, playerIndex) => (
            <div key={player.name} className="flex items-center">
              <div className="w-[104px] shrink-0 px-3">
                <p className="truncate text-[11px] font-semibold" style={{ color: player.color }}>{player.name}</p>
                <p className="truncate text-[9px] text-zinc-500">{player.spec}</p>
              </div>
              <div className="relative flex-1 space-y-1">
                <div className="relative h-4">
                  {PLAYER_CASTS[playerIndex].map((cast, index) => (
                    <span
                      key={index}
                      className="absolute top-0 h-full rounded-[2px]"
                      style={{ left: pct(cast.start), width: pct(cast.width), background: player.schools[cast.school], opacity: (cast.start / TIMELINE_SECONDS) * 100 <= cursor ? 1 : 0.45 }}
                    />
                  ))}
                </div>
                <div className="relative h-1.5">
                  <span className="absolute h-full rounded-sm bg-emerald-500/60" style={{ left: pct(4 + playerIndex * 6), width: pct(22) }} />
                  <span className="absolute h-full rounded-sm bg-amber-400/60" style={{ left: pct(38), width: pct(15) }} />
                  <span className="absolute h-full rounded-sm bg-violet-400/60" style={{ left: pct(60 - playerIndex * 4), width: pct(12) }} />
                </div>
                <div className="relative h-2">
                  {[8 + playerIndex * 5, 36, 66].map((seconds) => (
                    <span key={seconds} className="absolute top-0 h-2 w-2 -translate-x-1/2 rotate-45 bg-[#ffd100]" style={{ left: pct(seconds) }} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Cursor across the chart and lanes */}
        <div className="pointer-events-none absolute bottom-0 left-[104px] right-0 top-0">
          <span className="absolute bottom-0 top-0 w-px bg-[#ffd100] shadow-[0_0_8px_rgba(255,209,0,0.75)]" style={{ left: `${cursor}%` }} />
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
