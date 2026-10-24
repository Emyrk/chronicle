import type { ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {
  Activity,
  HeartPulse,
  Pause,
  Play,
  RotateCcw,
  Skull,
  Sparkles,
  Swords,
  Users,
} from "lucide-react";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const ease = Easing.bezier(0.16, 1, 0.3, 1);

export const sceneOpacity = (frame: number, duration: number, fade = 16) =>
  interpolate(frame, [0, fade, duration - fade, duration], [0, 1, 1, 0], clamp);

export function Backdrop({ accent = "cyan" }: { accent?: "cyan" | "violet" | "amber" }) {
  const glow = accent === "violet" ? "139,92,246" : accent === "amber" ? "245,158,11" : "34,211,238";
  return (
    <AbsoluteFill className="overflow-hidden bg-[#06080d] text-white">
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 78% 30%, rgba(${glow},.16), transparent 35%), radial-gradient(circle at 14% 78%, rgba(20,184,166,.10), transparent 32%), #06080d`,
        }}
      />
      <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
    </AbsoluteFill>
  );
}

export function Brand({ eyebrow }: { eyebrow?: string }) {
  return (
    <div className="absolute left-10 top-8 z-50 flex items-center gap-3">
      <Img src={staticFile("c/chronicle/ChronicleIcon.png")} className="size-10" />
      <span className="font-wow text-[25px] tracking-wide text-white">Chronicle</span>
      {eyebrow ? (
        <span className="ml-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[.2em] text-cyan-200">
          {eyebrow}
        </span>
      ) : null}
    </div>
  );
}

export function SceneHeading({ kicker, title, body }: { kicker: string; title: ReactNode; body: string }) {
  return (
    <div className="absolute left-12 top-28 z-40 w-[400px]">
      <div className="text-[13px] font-bold uppercase tracking-[.25em] text-cyan-300">{kicker}</div>
      <h2 className="mt-4 font-wow text-[54px] leading-[.98] tracking-tight text-white">{title}</h2>
      <p className="mt-5 max-w-[370px] text-[19px] leading-relaxed text-zinc-400">{body}</p>
    </div>
  );
}

export type Unit = {
  name: string;
  role: "tank" | "healer" | "damage" | "boss";
  x: number;
  y: number;
  health?: number;
  casting?: string;
  selected?: boolean;
};

const roleColor: Record<Unit["role"], string> = {
  tank: "#60a5fa",
  healer: "#34d399",
  damage: "#f8fafc",
  boss: "#fb7185",
};

function UnitToken({ unit, progress, showNames, showCast }: { unit: Unit; progress: number; showNames: boolean; showCast: boolean }) {
  const size = unit.role === "boss" ? 42 : 28;
  const isCasting = showCast && Boolean(unit.casting);
  return (
    <div
      className="absolute"
      style={{
        left: `${unit.x}%`,
        top: `${unit.y}%`,
        translate: "-50% -50%",
        opacity: interpolate(progress, [0, 0.3], [0, 1], clamp),
        scale: interpolate(progress, [0, 1], [0.72, 1], { ...clamp, easing: ease }),
      }}
    >
      {unit.selected ? <div className="absolute -inset-3 rounded-full border-2 border-cyan-300/80 shadow-[0_0_24px_rgba(34,211,238,.7)]" /> : null}
      <div
        className="relative grid place-items-center rounded-full border-[3px] border-[#0a0d12] shadow-[0_8px_20px_rgba(0,0,0,.8)]"
        style={{ width: size, height: size, background: roleColor[unit.role] }}
      >
        {unit.role === "boss" ? <Skull className="size-5 text-[#301015]" /> : <span className="size-2 rounded-full bg-[#0a0d12]/70" />}
        {isCasting ? (
          <div
            className="absolute -inset-2 rounded-full border-[3px] border-transparent border-t-amber-300 border-r-amber-300"
            style={{ rotate: `${interpolate(progress, [0, 1], [-90, 170])}deg` }}
          />
        ) : null}
      </div>
      {showNames ? (
        <div className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap text-center drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
          <div className={`font-semibold ${unit.role === "boss" ? "text-[13px] text-rose-300" : "text-[11px] text-white"}`}>{unit.name}</div>
          <div className="mt-0.5 h-1.5 w-[64px] overflow-hidden rounded-sm border border-black/70 bg-black/70">
            <div className="h-full bg-emerald-400" style={{ width: `${unit.health ?? 100}%` }} />
          </div>
        </div>
      ) : null}
      {isCasting ? (
        <div className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-md border border-amber-300/30 bg-[#171008]/95 px-2 py-1 text-[10px] font-semibold text-amber-100 shadow-xl">
          <Sparkles className="size-3 text-amber-300" />
          {unit.casting}
        </div>
      ) : null}
    </div>
  );
}

const baseUnits: Unit[] = [
  { name: "Kresh", role: "boss", x: 69, y: 42, health: 62, casting: "Shell Shield" },
  { name: "Aegis", role: "tank", x: 59, y: 48, health: 74, selected: true },
  { name: "Welfs", role: "healer", x: 43, y: 63, health: 92, casting: "Healing Wave" },
  { name: "Saelene", role: "healer", x: 37, y: 45, health: 84 },
  { name: "Ashfall", role: "damage", x: 51, y: 36, health: 100, casting: "Fireball" },
  { name: "Cinder", role: "damage", x: 66, y: 62, health: 68 },
  { name: "Fen", role: "damage", x: 75, y: 55, health: 95 },
  { name: "Oakhart", role: "damage", x: 48, y: 75, health: 89 },
];

function CaveFloor() {
  return (
    <svg viewBox="0 0 760 500" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="floor" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#243a38" />
          <stop offset=".5" stopColor="#152827" />
          <stop offset="1" stopColor="#0c1719" />
        </linearGradient>
        <radialGradient id="pool">
          <stop offset="0" stopColor="#39c6d6" stopOpacity=".48" />
          <stop offset="1" stopColor="#0d4150" stopOpacity=".08" />
        </radialGradient>
        <filter id="blur"><feGaussianBlur stdDeviation="8" /></filter>
      </defs>
      <path d="M56 60 C170 8 289 34 364 82 C449 20 627 32 701 106 C770 175 714 270 742 356 C682 458 536 470 429 427 C313 505 157 454 87 374 C12 298 30 169 56 60Z" fill="url(#floor)" stroke="#46605a" strokeWidth="5" />
      <path d="M96 116 C179 66 271 85 319 142 C284 182 264 221 272 275 C213 321 134 306 88 246 C61 195 68 149 96 116Z" fill="#17211f" stroke="#52675e" strokeWidth="9" />
      <path d="M401 94 C494 58 635 83 682 154 C702 208 661 256 609 279 C542 259 467 278 406 241 C377 193 377 139 401 94Z" fill="#1d302b" stroke="#536b5d" strokeWidth="10" />
      <path d="M358 280 C444 250 572 286 642 352 C607 413 498 444 406 412 C337 389 310 325 358 280Z" fill="#142422" stroke="#455d56" strokeWidth="9" />
      <ellipse cx="196" cy="356" rx="106" ry="58" fill="url(#pool)" filter="url(#blur)" />
      <ellipse cx="196" cy="356" rx="82" ry="39" fill="#1c8793" fillOpacity=".28" stroke="#6ee7f0" strokeOpacity=".28" strokeWidth="2" />
      <path d="M327 178 C356 203 375 224 398 255" fill="none" stroke="#263d39" strokeWidth="32" strokeLinecap="round" />
      <path d="M327 178 C356 203 375 224 398 255" fill="none" stroke="#6a7f74" strokeOpacity=".45" strokeWidth="3" strokeDasharray="7 10" />
      {[112, 174, 248, 441, 512, 605].map((x, index) => (
        <g key={x} opacity=".8">
          <ellipse cx={x} cy={index % 2 === 0 ? 100 : 390} rx="32" ry="15" fill="#07100f" />
          <path d={`M${x - 16} ${index % 2 === 0 ? 100 : 390} L${x} ${index % 2 === 0 ? 50 : 340} L${x + 17} ${index % 2 === 0 ? 100 : 390}Z`} fill="#263c35" stroke="#547063" strokeWidth="2" />
        </g>
      ))}
    </svg>
  );
}

export function MapStage({
  progress,
  showNames = false,
  showCast = false,
  walking = false,
  replayProgress,
  children,
}: {
  progress: number;
  showNames?: boolean;
  showCast?: boolean;
  walking?: boolean;
  replayProgress?: number;
  children?: ReactNode;
}) {
  const frame = useCurrentFrame();
  const walk = walking ? interpolate(frame, [0, 135], [0, 1], clamp) : 0;
  const units = baseUnits.map((unit, index) => ({
    ...unit,
    x: unit.x + (walking && index > 1 ? interpolate(walk, [0, 1], [0, index % 2 ? 4 : -4]) : 0),
    y: unit.y + (walking && index > 1 ? interpolate(walk, [0, 1], [0, index % 3 ? -7 : 5]) : 0),
  }));
  return (
    <div
      className="absolute overflow-hidden rounded-[22px] border border-white/10 bg-[#0b1112] shadow-[0_40px_120px_rgba(0,0,0,.72)]"
      style={{
        left: 448,
        top: 92,
        width: 780,
        height: 548,
        opacity: interpolate(progress, [0, 0.25], [0, 1], clamp),
        scale: interpolate(progress, [0, 1], [0.92, 1], { ...clamp, easing: ease }),
        translate: `0 ${interpolate(progress, [0, 1], [28, 0], clamp)}px`,
      }}
    >
      <div className="absolute inset-x-0 top-0 z-30 flex h-11 items-center justify-between border-b border-white/10 bg-[#0c1117]/95 px-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-zinc-200"><Activity className="size-4 text-cyan-300" /> Wailing Caverns · Kresh</div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-500"><Users className="size-3.5" /> 8 visible <span className="rounded bg-cyan-300/10 px-2 py-0.5 text-cyan-200">3D</span></div>
      </div>
      <div className="absolute inset-x-0 bottom-0 top-11 overflow-hidden bg-[#081011] [perspective:1000px]">
        <div
          className="absolute -inset-[70px] origin-center"
          style={{
            transform: `rotateX(${interpolate(progress, [0, 1], [0, 48], clamp)}deg) rotateZ(${interpolate(progress, [0, 1], [0, -6], clamp)}deg) scale(${interpolate(progress, [0, 1], [1.12, 1.02], clamp)}) translate(${walking ? interpolate(walk, [0, 1], [28, -20]) : 0}px, ${walking ? interpolate(walk, [0, 1], [35, -10]) : 0}px)`,
            transformStyle: "preserve-3d",
          }}
        >
          <CaveFloor />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_66%_46%,rgba(250,204,21,.12),transparent_14%),linear-gradient(180deg,transparent,rgba(0,0,0,.2))]" />
          {units.map((unit, index) => <UnitToken key={unit.name} unit={unit} progress={Math.max(0, progress - index * 0.035)} showNames={showNames} showCast={showCast} />)}
          {walking ? (
            <>
              <div className="absolute left-[56%] top-[67%] h-[3px] w-[170px] origin-left rounded-full bg-gradient-to-r from-cyan-300 to-transparent" style={{ rotate: "-29deg", opacity: .65 }} />
              <div className="absolute left-[55%] top-[65%] grid size-12 place-items-center rounded-full border-2 border-cyan-200 bg-cyan-300/20 shadow-[0_0_34px_rgba(34,211,238,.65)]">
                <div className="h-7 w-4 rounded-full bg-cyan-100 shadow-[0_4px_10px_rgba(0,0,0,.8)]" />
              </div>
            </>
          ) : null}
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.25),transparent_28%,transparent_72%,rgba(0,0,0,.48))]" />
      </div>
      {replayProgress !== undefined ? <ReplayBar progress={replayProgress} /> : null}
      {children}
    </div>
  );
}

export function KeyCap({ children, active }: { children: ReactNode; active?: boolean }) {
  return <span className={`grid size-9 place-items-center rounded-md border text-sm font-bold shadow-lg ${active ? "border-cyan-200 bg-cyan-300 text-[#041014]" : "border-white/15 bg-black/55 text-zinc-300"}`}>{children}</span>;
}

const meterData = {
  damage: [
    ["Ashfall", 1248, 100, "#69ccf0"], ["Cinder", 1094, 88, "#fff468"], ["Oakhart", 918, 74, "#ff7c0a"], ["Aegis", 624, 50, "#c79c6e"],
  ],
  healing: [
    ["Welfs", 842, 100, "#0070de"], ["Saelene", 716, 85, "#ffffff"], ["Oakhart", 401, 48, "#ff7c0a"],
  ],
} as const;

export function MeterCard({ kind, x, y, progress }: { kind: "damage" | "healing"; x: number; y: number; progress: number }) {
  const data = meterData[kind];
  const Icon = kind === "damage" ? Swords : HeartPulse;
  return (
    <div
      className="absolute z-40 w-[250px] overflow-hidden rounded-xl border border-white/15 bg-[#0b0f15]/95 shadow-[0_18px_55px_rgba(0,0,0,.7)] backdrop-blur"
      style={{ left: x, top: y, opacity: progress, scale: interpolate(progress, [0, 1], [.86, 1], clamp), translate: `${interpolate(progress, [0, 1], [24, 0], clamp)}px 0` }}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[12px] font-semibold text-zinc-200"><span className="flex items-center gap-2"><Icon className={`size-4 ${kind === "damage" ? "text-rose-300" : "text-emerald-300"}`} />{kind === "damage" ? "Damage Done" : "Healing Done"}</span><span className="text-[10px] text-zinc-500">DPS</span></div>
      <div className="space-y-1.5 p-3">
        {data.map(([name, value, width, color], index) => (
          <div key={name} className="relative h-[24px] overflow-hidden rounded bg-white/[.035]">
            <div className="absolute inset-y-0 left-0 opacity-30" style={{ width: `${width * progress}%`, background: color }} />
            <div className="relative flex h-full items-center justify-between px-2 text-[11px]"><span style={{ color }}>{index + 1}. {name}</span><span className="font-mono text-zinc-300">{Math.round(value * progress)}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReplayBar({ progress }: { progress: number }) {
  return (
    <div className="absolute bottom-4 left-1/2 z-50 w-[520px] -translate-x-1/2 rounded-xl border border-white/15 bg-[#080b10]/95 px-4 py-3 shadow-2xl backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="grid size-8 place-items-center rounded-full bg-cyan-300 text-[#031014]">{progress > .02 ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}</div>
        <span className="font-mono text-[11px] text-zinc-400">00:{String(Math.round(progress * 42)).padStart(2, "0")}</span>
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,.8)]" style={{ width: `${progress * 100}%` }} /></div>
        <span className="font-mono text-[11px] text-zinc-500">00:42</span>
        <span className="rounded bg-white/5 px-2 py-1 text-[10px] text-zinc-300">1×</span>
      </div>
    </div>
  );
}

export function FeaturePill({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[.055] px-4 py-2 text-[15px] text-zinc-300 shadow-xl">{icon}{children}</div>;
}

export function ReplayIcon() {
  return <RotateCcw className="size-4 text-violet-300" />;
}
