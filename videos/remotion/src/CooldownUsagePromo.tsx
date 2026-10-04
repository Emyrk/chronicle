import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Check, Droplets, HeartPulse, Layers3, Leaf, Shield, TimerReset, TriangleAlert } from "lucide-react";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.16, 1, 0.3, 1);

const sceneOpacity = (frame: number, duration: number) =>
  interpolate(frame, [0, 18, duration - 18, duration], [0, 1, 1, 0], clamp);

const RED = "bg-red-500/55";
const GREEN = "bg-emerald-500/60";
const BLUE = "bg-sky-400";

function Brand() {
  return (
    <div className="absolute left-12 top-9 flex items-center gap-3">
      <Img src={staticFile("c/chronicle/ChronicleIcon.png")} className="size-11" />
      <span className="font-wow text-2xl tracking-wide text-white">Chronicle</span>
    </div>
  );
}

function Backdrop() {
  return (
    <AbsoluteFill className="overflow-hidden bg-[#070b12] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_20%,rgba(239,68,68,0.15),transparent_38%),radial-gradient(circle_at_84%_78%,rgba(16,185,129,0.14),transparent_36%)]" />
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
    </AbsoluteFill>
  );
}

function Pill({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-base text-zinc-300 shadow-lg">
      {icon}
      {children}
    </div>
  );
}

// Stylised stand-ins for the in-game spell icons.
const COOLDOWNS = [
  { key: "innervate", name: "Innervate", Icon: Droplets, tint: "from-sky-500 to-indigo-700", cd: 180, duration: 10 },
  { key: "barkskin", name: "Barkskin", Icon: Shield, tint: "from-amber-600 to-yellow-900", cd: 60, duration: 12 },
  { key: "rebirth", name: "Rebirth", Icon: HeartPulse, tint: "from-emerald-500 to-green-900", cd: 600, duration: 0 },
  { key: "tranquility", name: "Tranquility", Icon: Leaf, tint: "from-lime-500 to-emerald-800", cd: 480, duration: 8 },
] as const;

type CooldownKey = (typeof COOLDOWNS)[number]["key"];

function SpellTile({ cooldown, size = 22 }: { cooldown: (typeof COOLDOWNS)[number]; size?: number }) {
  const { Icon } = cooldown;
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-[4px] border border-black/60 bg-gradient-to-br ${cooldown.tint} shadow-[inset_0_0_0_1px_rgba(255,255,255,.18)]`}
      style={{ width: size, height: size }}
    >
      <Icon className="text-white drop-shadow" style={{ width: size * 0.62, height: size * 0.62 }} />
    </span>
  );
}

function ClassChips({ active }: { active: string }) {
  const chips: [string, number][] = [
    ["deathknight", 3], ["druid", 3], ["hunter", 2], ["mage", 2], ["paladin", 5], ["priest", 2], ["rogue", 1], ["shaman", 3], ["warlock", 3],
  ];
  return (
    <div className="flex items-center gap-1">
      {chips.map(([cls, count]) => (
        <span
          key={cls}
          className={`flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[13px] ${cls === active ? "border-white/30 bg-white/10 text-white" : "border-transparent text-zinc-400 opacity-60"}`}
        >
          {count}
          <Img src={staticFile(`c/icons/class_${cls}.png`)} className="size-[18px] rounded-sm" />
        </span>
      ))}
    </div>
  );
}

function PanelFrame({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-700 bg-[#101318] shadow-[0_30px_90px_rgba(0,0,0,.55)]">
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <TimerReset className="size-5 text-zinc-300" />
          Cooldown Usage
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          Compact
          <span className={`relative h-5 w-9 rounded-full ${compact ? "bg-sky-500" : "bg-zinc-600"}`}>
            <span className={`absolute top-0.5 size-4 rounded-full bg-white ${compact ? "left-[18px]" : "left-0.5"}`} />
          </span>
        </div>
      </div>
      <div className="px-5 pb-4 pt-3">{children}</div>
    </div>
  );
}

// --- Timeline math (seconds within a 360s fight) -------------------------
const FIGHT = 360;

function segmentsFor(casts: number[], cd: number, duration: number) {
  const out: { start: number; end: number; kind: "red" | "green" | "blue" }[] = [];
  let cursor = 0;
  for (const at of casts) {
    if (at > cursor) out.push({ start: cursor, end: at, kind: "green" });
    const end = Math.min(at + cd, FIGHT);
    out.push({ start: at, end, kind: "red" });
    cursor = end;
  }
  if (cursor < FIGHT) out.push({ start: cursor, end: FIGHT, kind: "green" });
  for (const at of casts) {
    if (duration > 0) out.push({ start: at, end: Math.min(at + duration, FIGHT), kind: "blue" });
  }
  return out;
}

function TimelineBar({ casts, cd, duration, reveal }: { casts: number[]; cd: number; duration: number; reveal: number }) {
  const segments = segmentsFor(casts, cd, duration);
  return (
    <div className="relative h-[18px] flex-1 overflow-hidden rounded bg-white/5" style={{ clipPath: `inset(0 ${100 - reveal}% 0 0)` }}>
      {segments.map((segment, index) => {
        const left = (segment.start / FIGHT) * 100;
        const width = ((segment.end - segment.start) / FIGHT) * 100;
        if (segment.kind === "blue") {
          return <div key={index} className={`absolute top-1/4 h-1/2 rounded-sm ${BLUE}`} style={{ left: `${left}%`, width: `${Math.max(width, 0.6)}%` }} />;
        }
        return (
          <div
            key={index}
            className={`absolute h-full ${segment.kind === "red" ? `${RED} border-l-2 border-white` : GREEN}`}
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        );
      })}
    </div>
  );
}

const PLAYERS: { name: string; rows: { key: CooldownKey; casts: number[] }[] }[] = [
  {
    name: "Oakhart",
    rows: [
      { key: "barkskin", casts: [140] },
      { key: "innervate", casts: [] },
      { key: "rebirth", casts: [212] },
    ],
  },
  {
    name: "Sylas",
    rows: [
      { key: "barkskin", casts: [24, 96, 250] },
      { key: "innervate", casts: [18, 205] },
      { key: "rebirth", casts: [] },
    ],
  },
];

function readyPct(casts: number[], cd: number) {
  const segments = segmentsFor(casts, cd, 0).filter((s) => s.kind === "green");
  return Math.round((segments.reduce((sum, s) => sum + s.end - s.start, 0) / FIGHT) * 100);
}

function Callout({ color, title, body, appear }: { color: string; title: string; body: string; appear: number }) {
  return (
    <div className="flex gap-4" style={{ opacity: appear, translate: `${interpolate(appear, [0, 1], [24, 0])}px 0` }}>
      <span className={`mt-1.5 h-4 w-8 shrink-0 rounded-sm ${color}`} />
      <div>
        <div className="text-xl font-semibold text-white">{title}</div>
        <div className="mt-1 text-base leading-snug text-zinc-400">{body}</div>
      </div>
    </div>
  );
}

function IntroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 18, stiffness: 95 }, durationInFrames: 38 });
  const icon = spring({ frame: frame - 30, fps, config: { damping: 12, stiffness: 120 }, durationInFrames: 32 });

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity(frame, 150) }}>
      <Brand />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div
          className="mb-7 grid size-24 place-items-center rounded-3xl border border-emerald-300/30 bg-emerald-300/10 shadow-[0_0_70px_rgba(16,185,129,.25)]"
          style={{ scale: icon, rotate: `${interpolate(icon, [0, 1], [-90, 0])}deg` }}
        >
          <TimerReset className="size-12 text-emerald-300" />
        </div>
        <h1
          className="max-w-4xl font-wow text-[76px] leading-[0.98] tracking-tight"
          style={{ opacity: entrance, translate: `0 ${interpolate(entrance, [0, 1], [34, 0])}px` }}
        >
          Did they press it?
        </h1>
        <p className="mt-7 text-2xl text-zinc-400" style={{ opacity: interpolate(frame, [30, 56], [0, 1], clamp) }}>
          Introducing Cooldown Usage: every class cooldown, every cast, the whole raid.
        </p>
        <div className="mt-9 flex gap-3" style={{ opacity: interpolate(frame, [50, 76], [0, 1], clamp) }}>
          <Pill icon={<Img src={staticFile("c/icons/class_druid.png")} className="size-4 rounded-sm" />}>Filter by class</Pill>
          <Pill icon={<span className="h-3 w-5 rounded-sm bg-gradient-to-r from-red-500/70 to-emerald-500/70" />}>Cast timelines</Pill>
          <Pill icon={<span className={`h-1.5 w-5 rounded-sm ${BLUE}`} />}>Spell durations</Pill>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function TimelineScene() {
  const frame = useCurrentFrame();
  const panel = spring({ frame: frame - 6, fps: 30, config: { damping: 20 }, durationInFrames: 28 });
  const reveal = interpolate(frame, [26, 96], [0, 100], { ...clamp, easing: ease });
  const callout = (start: number) => spring({ frame: frame - start, fps: 30, config: { damping: 20 }, durationInFrames: 22 });

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity(frame, 230) }}>
      <Brand />
      <div
        className="absolute left-12 top-28 w-[760px]"
        style={{ opacity: panel, translate: `0 ${interpolate(panel, [0, 1], [26, 0])}px` }}
      >
        <PanelFrame>
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <ClassChips active="druid" />
            <span className="rounded border border-zinc-700 px-2 py-0.5 text-sm text-zinc-300">≥ 30s</span>
          </div>
          <div className="flex items-center gap-3 pl-3 pt-3 text-[11px] uppercase tracking-wide text-zinc-500">
            <span className="w-36">Cooldown</span>
            <span className="w-10 text-right">Casts</span>
            <span className="w-12 text-right">Ready</span>
            <span className="flex-1 pl-1">Timeline</span>
          </div>
          {PLAYERS.map((player) => (
            <div key={player.name} className="border-b border-zinc-800/80 py-2.5 last:border-0">
              <div className="mb-1.5 flex items-baseline gap-2">
                <span className="flex items-center gap-1.5 font-semibold">
                  <span className="h-3.5 w-[3px] rounded-sm" style={{ background: "var(--color-class-druid)" }} />
                  {player.name}
                </span>
                <span className="font-mono text-xs text-zinc-500">
                  {player.rows.reduce((sum, row) => sum + row.casts.length, 0)} casts
                </span>
              </div>
              <div className="flex flex-col gap-1.5 pl-3">
                {player.rows.map((row) => {
                  const cooldown = COOLDOWNS.find((c) => c.key === row.key)!;
                  return (
                    <div key={row.key} className="flex items-center gap-3 text-[15px]">
                      <span className="flex w-36 items-center gap-2 text-zinc-300">
                        <SpellTile cooldown={cooldown} size={18} />
                        {cooldown.name}
                      </span>
                      <span className="w-10 text-right font-mono text-white">{row.casts.length}</span>
                      <span className="w-12 text-right font-mono text-zinc-400">{readyPct(row.casts, cooldown.cd)}%</span>
                      <TimelineBar casts={row.casts} cd={cooldown.cd} duration={cooldown.duration} reveal={reveal} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </PanelFrame>
      </div>
      <div className="absolute right-12 top-28 w-[380px]">
        <div className="text-sm font-semibold uppercase tracking-[.24em] text-emerald-300">Read it at a glance</div>
        <h2 className="mt-4 font-wow text-5xl leading-tight">Every press. Every miss.</h2>
        <div className="mt-8 flex flex-col gap-6">
          <Callout color={RED} title="On cooldown" body="Starts the moment they cast it." appear={callout(100)} />
          <Callout color={GREEN} title="Ready, but unused" body="Time it sat available. The Ready % says how much." appear={callout(122)} />
          <Callout color={BLUE} title="Spell active" body="How long the effect lasts after the cast." appear={callout(144)} />
        </div>
      </div>
    </AbsoluteFill>
  );
}

const COMPACT: { name: string; counts: number[] }[] = [
  { name: "Briarwood", counts: [2, 5, 1, 1] },
  { name: "Fernsong", counts: [1, 3, 0, 1] },
  { name: "Oakhart", counts: [0, 1, 1, 0] },
  { name: "Sylas", counts: [2, 3, 0, 1] },
  { name: "Thornroot", counts: [1, 6, 2, 0] },
];
const COMPACT_ORDER: CooldownKey[] = ["innervate", "barkskin", "rebirth", "tranquility"];

function CompactScene() {
  const frame = useCurrentFrame();
  const panel = spring({ frame: frame - 6, fps: 30, config: { damping: 20 }, durationInFrames: 28 });
  const tick = interpolate(frame, [30, 80], [0, 1], { ...clamp, easing: ease });
  const note = spring({ frame: frame - 92, fps: 30, config: { damping: 20 }, durationInFrames: 24 });

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity(frame, 175) }}>
      <Brand />
      <div className="absolute left-16 top-32 w-[460px]">
        <div className="text-sm font-semibold uppercase tracking-[.24em] text-sky-400">Compact mode</div>
        <h2 className="mt-4 font-wow text-6xl leading-[1.04]">The whole class in one grid.</h2>
        <p className="mt-6 text-xl leading-relaxed text-zinc-400">Players down the side, cooldowns across the top, casts in every cell.</p>
        <div
          className="mt-8 flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-base text-amber-100"
          style={{ opacity: note, translate: `0 ${interpolate(note, [0, 1], [14, 0])}px` }}
        >
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" />
          Looking at more than 4 encounters? It switches to compact automatically.
        </div>
      </div>
      <div
        className="absolute right-16 top-32 w-[560px]"
        style={{ opacity: panel, translate: `0 ${interpolate(panel, [0, 1], [26, 0])}px` }}
      >
        <PanelFrame compact>
          <div className="mb-2 flex items-center justify-between border-b border-zinc-800 pb-3">
            <ClassChips active="druid" />
          </div>
          <table className="w-full border-separate border-spacing-0 text-lg">
            <thead>
              <tr>
                <th />
                {COMPACT_ORDER.map((key) => (
                  <th key={key} className="px-2 py-2">
                    <span className="flex justify-center">
                      <SpellTile cooldown={COOLDOWNS.find((c) => c.key === key)!} size={30} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPACT.map((player) => (
                <tr key={player.name}>
                  <td className="border-t border-zinc-800 py-2 pr-4">
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-[3px] rounded-sm" style={{ background: "var(--color-class-druid)" }} />
                      {player.name}
                    </span>
                  </td>
                  {player.counts.map((count, index) => {
                    const shown = Math.round(count * tick);
                    return (
                      <td key={index} className={`border-t border-zinc-800 py-2 text-center font-mono ${count === 0 ? "text-zinc-600" : "text-white"}`}>
                        {shown}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </PanelFrame>
      </div>
    </AbsoluteFill>
  );
}

function WholeLogScene() {
  const frame = useCurrentFrame();
  const trash = interpolate(frame, [20, 60], [0, 100], { ...clamp, easing: ease });
  const boss = interpolate(frame, [62, 112], [0, 100], { ...clamp, easing: ease });
  const label = spring({ frame: frame - 100, fps: 30, config: { damping: 20 }, durationInFrames: 22 });
  const rebirth = COOLDOWNS.find((c) => c.key === "rebirth")!;

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity(frame, 160) }}>
      <Brand />
      <div className="absolute inset-x-24 top-32 text-center">
        <div className="text-sm font-semibold uppercase tracking-[.24em] text-red-300">Tracked across the whole log</div>
        <h2 className="mt-4 font-wow text-6xl leading-tight">Used it on trash? We know.</h2>
        <p className="mt-4 text-xl text-zinc-400">Cooldowns carry between pulls, so the boss starts with the truth.</p>
      </div>
      <div className="absolute inset-x-28 top-[360px] flex items-start gap-6">
        <div className="w-[300px]">
          <div className="mb-2 flex items-center gap-2 text-base text-zinc-400">
            Trash pack
            <span className="ml-auto flex items-center gap-1.5 text-white"><SpellTile cooldown={rebirth} size={20} />Rebirth</span>
          </div>
          <div className="relative h-7 overflow-hidden rounded bg-white/5" style={{ clipPath: `inset(0 ${100 - trash}% 0 0)` }}>
            <div className={`absolute inset-y-0 left-0 w-[55%] ${GREEN}`} />
            <div className={`absolute inset-y-0 left-[55%] right-0 border-l-2 border-white ${RED}`} />
          </div>
        </div>
        <div className="pt-9 text-zinc-600">· · ·</div>
        <div className="flex-1">
          <div className="mb-2 text-base text-zinc-400">Patchwerk</div>
          <div className="relative h-7 overflow-hidden rounded bg-white/5" style={{ clipPath: `inset(0 ${100 - boss}% 0 0)` }}>
            <div className={`absolute inset-y-0 left-0 w-[38%] ${RED}`} />
            <div className={`absolute inset-y-0 left-[38%] right-0 ${GREEN}`} />
          </div>
          <div
            className="mt-3 w-fit whitespace-nowrap rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100"
            style={{ opacity: label, translate: `0 ${interpolate(label, [0, 1], [10, 0])}px` }}
          >
            Still on cooldown from the trash pull
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function FinaleScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 18 }, durationInFrames: 34 });
  const pulse = interpolate(frame, [55, 75, 95], [1, 1.08, 1], { ...clamp, easing: Easing.inOut(Easing.ease) });
  return (
    <AbsoluteFill style={{ opacity: interpolate(frame, [0, 18], [0, 1], clamp) }}>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <Img
          src={staticFile("c/chronicle/ChronicleLogoCenter.svg")}
          className="mb-10 w-[420px]"
          style={{ opacity: entrance, scale: interpolate(entrance, [0, 1], [0.9, 1]) }}
        />
        <h2 className="font-wow text-6xl">Make every cooldown count.</h2>
        <p className="mt-5 text-2xl text-zinc-400">Cooldown Usage is now available on Chronicle.</p>
        <div
          className="mt-9 flex items-center gap-3 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-6 py-3 text-xl text-emerald-100"
          style={{ scale: pulse }}
        >
          <Layers3 className="size-6 text-emerald-300" />
          Open a log → add a panel → Resources → Cooldown Usage
        </div>
        <div className="mt-6 flex items-center gap-2 text-base text-zinc-500" style={{ opacity: interpolate(frame, [40, 60], [0, 1], clamp) }}>
          <Check className="size-4 text-emerald-400" /> Every class · Every encounter · The whole log
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-8 text-center text-sm uppercase tracking-[.28em] text-zinc-600">chronicle.game</div>
    </AbsoluteFill>
  );
}

export default function CooldownUsagePromo() {
  return (
    <AbsoluteFill>
      <Backdrop />
      <Sequence durationInFrames={150}><IntroScene /></Sequence>
      <Sequence from={132} durationInFrames={230}><TimelineScene /></Sequence>
      <Sequence from={344} durationInFrames={175}><CompactScene /></Sequence>
      <Sequence from={501} durationInFrames={160}><WholeLogScene /></Sequence>
      <Sequence from={643} durationInFrames={157}><FinaleScene /></Sequence>
    </AbsoluteFill>
  );
}
