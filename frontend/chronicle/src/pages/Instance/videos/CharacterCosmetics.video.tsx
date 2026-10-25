/**
 * Feature announcement: supporter character cosmetics.
 *
 * An enchanted raid ledger wakes up across a Damage Done meter, then shows
 * the linked-character editor and the Enabled, Limited, and Disabled viewer
 * controls. 720 frames @ 30fps, 1280x720.
 */
import type { CSSProperties, ReactNode } from "react";
import {
  Check,
  ChevronRight,
  Crown,
  Eye,
  EyeOff,
  Link2,
  ShieldCheck,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import {
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  clamp,
  entranceEasing,
  INTRO_FRAMES,
} from "@/pages/Instance/PanelExplainer/videos/animation";
import {
  LessonIntro,
  StepCaption,
  VideoStage,
} from "@/pages/Instance/PanelExplainer/videos/shared";

const CHART_END = 226;
const EDITOR_START = 206;
const EDITOR_END = 396;
const CONTROLS_START = 376;
const CONTROLS_END = 556;
const FINALE_START = 536;

type NameTreatment =
  | "gilded"
  | "prismatic"
  | "epic"
  | "fel"
  | "frost"
  | "legendary";
type BackgroundTreatment =
  | "sunlit"
  | "starfall"
  | "satin"
  | "arcane"
  | "frosted"
  | "glossy";
type BorderTreatment = "none" | "elite" | "storm" | "chasing";

type Player = {
  name: string;
  className: string;
  color: string;
  value: string;
  dps: string;
  width: number;
  nameStyle: NameTreatment;
  background: BackgroundTreatment;
  border: BorderTreatment;
  flashy: boolean;
};

const PLAYERS: readonly Player[] = [
  {
    name: "Dreadnaught",
    className: "Warrior",
    color: "#c79c6e",
    value: "1.42m",
    dps: "9,408",
    width: 96,
    nameStyle: "gilded",
    background: "sunlit",
    border: "none",
    flashy: false,
  },
  {
    name: "Saelene",
    className: "Priest",
    color: "#f3f4f6",
    value: "1.31m",
    dps: "8,674",
    width: 89,
    nameStyle: "prismatic",
    background: "starfall",
    border: "elite",
    flashy: true,
  },
  {
    name: "Morrow",
    className: "Rogue",
    color: "#fff569",
    value: "1.18m",
    dps: "7,815",
    width: 80,
    nameStyle: "epic",
    background: "satin",
    border: "none",
    flashy: false,
  },
  {
    name: "Hexkind",
    className: "Warlock",
    color: "#9482c9",
    value: "1.09m",
    dps: "7,219",
    width: 74,
    nameStyle: "fel",
    background: "arcane",
    border: "storm",
    flashy: true,
  },
  {
    name: "Welf",
    className: "Mage",
    color: "#69ccf0",
    value: "987k",
    dps: "6,538",
    width: 67,
    nameStyle: "frost",
    background: "frosted",
    border: "none",
    flashy: false,
  },
  {
    name: "Aedrin",
    className: "Paladin",
    color: "#f58cba",
    value: "914k",
    dps: "6,053",
    width: 62,
    nameStyle: "legendary",
    background: "glossy",
    border: "chasing",
    flashy: true,
  },
];

type ViewerMode = "enabled" | "limited" | "disabled";

const ease = { ...clamp, easing: entranceEasing };

export default function CharacterCosmeticsVideo() {
  return (
    <VideoStage>
      <LedgerBackdrop />
      <Sequence from={INTRO_FRAMES - 10}>
        <Announcement />
      </Sequence>
      <LessonIntro
        title="Your character. Your signature."
        bullets={[
          "Supporter cosmetics now appear across raid analysis",
          "Mix a name, background, and border for every linked character",
          "Every viewer chooses how much magic they want to see",
        ]}
      />
    </VideoStage>
  );
}

function LedgerBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-[#05080d]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(214,170,74,0.14),transparent_34%),radial-gradient(circle_at_82%_72%,rgba(98,46,150,0.13),transparent_38%),linear-gradient(145deg,#07111b_0%,#05080d_52%,#0b0a12_100%)]" />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(214,170,74,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(214,170,74,0.045) 1px, transparent 1px)",
          backgroundSize: "54px 54px",
        }}
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/45 to-transparent" />
    </>
  );
}

function Announcement() {
  return (
    <>
      <Sequence durationInFrames={CHART_END}>
        <ChartRevealScene />
      </Sequence>
      <Sequence
        from={EDITOR_START}
        durationInFrames={EDITOR_END - EDITOR_START}
      >
        <EditorScene />
      </Sequence>
      <Sequence
        from={CONTROLS_START}
        durationInFrames={CONTROLS_END - CONTROLS_START}
      >
        <ControlsScene />
      </Sequence>
      <Sequence
        from={FINALE_START}
        durationInFrames={720 - (INTRO_FRAMES - 10) - FINALE_START}
      >
        <Finale />
      </Sequence>
    </>
  );
}

function SceneTitle({
  kicker,
  title,
  detail,
  entrance,
}: {
  kicker: string;
  title: string;
  detail: string;
  entrance: number;
}) {
  return (
    <header
      className="absolute left-[72px] top-[38px] max-w-[820px]"
      style={{
        opacity: entrance,
        translate: `0 ${interpolate(entrance, [0, 1], [16, 0])}px`,
      }}
    >
      <p className="text-[13px] font-bold uppercase tracking-[0.24em] text-amber-300">
        {kicker}
      </p>
      <h1 className="font-wow mt-1 text-[40px] font-bold tracking-tight text-zinc-50">
        {title}
      </h1>
      <p className="mt-1 text-[17px] text-zinc-400">{detail}</p>
    </header>
  );
}

function BrowserFrame({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      className="absolute overflow-hidden rounded-2xl border border-amber-200/20 bg-[#080b10] shadow-[0_28px_80px_rgba(0,0,0,0.55),0_0_40px_rgba(214,170,74,0.06)]"
      style={{ left: 72, right: 72, top: 128, height: 438, ...style }}
    >
      <div className="flex h-9 items-center gap-3 border-b border-white/8 bg-[#11151c] px-4">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
        </div>
        <div className="flex-1 rounded bg-black/35 px-3 py-1 font-mono text-[10px] text-zinc-500">
          chronicleclassic.com/instances/blackwing-lair
        </div>
        <span className="font-wow text-sm font-semibold text-amber-200">
          Chronicle
        </span>
      </div>
      {children}
    </div>
  );
}

function ChartRevealScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({
    frame,
    fps,
    config: { damping: 180 },
    durationInFrames: 28,
  });
  const exit = interpolate(frame, [CHART_END - 22, CHART_END], [1, 0], ease);
  const revealStarted = frame >= 68;
  const allAwake = frame >= 150;
  const step = allAwake ? 3 : revealStarted ? 2 : 1;

  return (
    <div className="absolute inset-0" style={{ opacity: exit }}>
      <SceneTitle
        kicker="Across every raid meter"
        title="A raid roster, enchanted"
        detail="Cosmetics follow linked characters into PlayerMetricChart rows."
        entrance={entrance}
      />
      <BrowserFrame
        style={{
          opacity: entrance,
          translate: `0 ${interpolate(entrance, [0, 1], [22, 0])}px`,
        }}
      >
        <div className="flex items-center justify-between border-b border-white/7 px-5 py-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
              Damage Done
            </p>
            <p className="mt-0.5 text-sm font-semibold text-zinc-200">
              Nefarian · 2:31
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <span className="rounded border border-white/8 bg-white/4 px-2 py-1 text-zinc-200">
              Total
            </span>
            <span>DPS</span>
            <span>Active time</span>
          </div>
        </div>
        <DamageChart frame={frame} mode="enabled" progressive />
      </BrowserFrame>
      <StepCaption
        step={step}
        opacity={interpolate(
          frame,
          [12, 24, CHART_END - 36, CHART_END - 20],
          [0, 1, 1, 0],
          clamp,
        )}
        text={
          step === 1
            ? "The familiar Damage Done chart starts exactly as you know it"
            : step === 2
              ? "Names, backgrounds, and borders wake up row by row"
              : "Every character can carry a different signature across the raid"
        }
      />
    </div>
  );
}

function DamageChart({
  frame,
  mode,
  progressive = false,
  compact = false,
}: {
  frame: number;
  mode: ViewerMode;
  progressive?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "space-y-1.5 px-4 py-3" : "space-y-2 px-5 py-4"}>
      {PLAYERS.map((player, index) => {
        const cosmeticReveal = progressive
          ? interpolate(frame, [62 + index * 13, 88 + index * 13], [0, 1], ease)
          : 1;
        return (
          <PlayerRow
            key={player.name}
            player={player}
            index={index}
            frame={frame}
            mode={mode}
            cosmeticReveal={cosmeticReveal}
            compact={compact}
          />
        );
      })}
    </div>
  );
}

function PlayerRow({
  player,
  index,
  frame,
  mode,
  cosmeticReveal,
  compact,
}: {
  player: Player;
  index: number;
  frame: number;
  mode: ViewerMode;
  cosmeticReveal: number;
  compact: boolean;
}) {
  const cosmeticsAllowed = mode !== "disabled";
  const flashyAllowed = mode === "enabled";
  const showName = cosmeticsAllowed && (!player.flashy || flashyAllowed);
  const showBackground =
    cosmeticsAllowed &&
    ((player.background !== "starfall" && player.background !== "arcane") ||
      flashyAllowed);
  const showBorder =
    cosmeticsAllowed && player.border !== "none" && flashyAllowed;
  const nameProgress = showName ? cosmeticReveal : 0;
  const backgroundProgress = showBackground ? cosmeticReveal : 0;
  const borderProgress = showBorder ? cosmeticReveal : 0;
  const rowHeight = compact ? 39 : 43;

  return (
    <div
      className="relative overflow-hidden rounded-md border border-white/6 bg-[#0e1117]"
      style={{ height: rowHeight }}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-r-sm"
        style={{
          width: `${player.width}%`,
          background: `linear-gradient(90deg, rgba(0,0,0,.25), rgba(0,0,0,.08)), ${player.color}`,
          opacity: 0.62,
        }}
      />

      <div
        className="absolute inset-y-0 left-0 overflow-hidden rounded-r-sm"
        style={{
          width: `${player.width}%`,
          opacity: backgroundProgress * cosmeticBackgroundOpacity(player),
          background: cosmeticBackground(player, frame, index),
        }}
      >
        {player.background === "starfall" && flashyAllowed ? (
          <>
            {[14, 31, 49, 68, 83].map((left, starIndex) => (
              <span
                key={left}
                className="absolute h-1 w-1 rounded-full bg-white"
                style={{
                  left: `${left}%`,
                  top: 7 + (starIndex % 3) * 10,
                  opacity: interpolate(
                    0.5 + Math.sin((frame + starIndex * 15) * 0.22) * 0.5,
                    [0, 1],
                    [0.15, 0.9],
                  ),
                }}
              />
            ))}
          </>
        ) : null}
      </div>

      <div className="absolute inset-0 flex items-center px-3">
        <span
          className="relative w-[220px] shrink-0 truncate text-[15px] font-semibold"
          style={cosmeticNameStyle(player, nameProgress, frame)}
        >
          {player.name}
        </span>
        <span className="ml-auto w-20 text-right font-mono text-[13px] font-semibold text-zinc-100">
          {player.value}
        </span>
        <span className="ml-7 w-20 text-right font-mono text-[12px] text-zinc-400">
          {player.dps}
        </span>
      </div>

      <CosmeticBorder
        player={player}
        frame={frame}
        index={index}
        progress={borderProgress}
      />

      {progressiveSpark(cosmeticReveal) ? (
        <span
          className="absolute inset-y-[-8px] w-14 -skew-x-12 bg-gradient-to-r from-transparent via-amber-100/70 to-transparent blur-[1px]"
          style={{
            left: `${interpolate(cosmeticReveal, [0, 1], [-8, Math.min(92, player.width)])}%`,
            opacity: interpolate(
              cosmeticReveal,
              [0, 0.12, 0.82, 1],
              [0, 1, 0.8, 0],
              clamp,
            ),
          }}
        />
      ) : null}
    </div>
  );
}

function progressiveSpark(progress: number) {
  return progress > 0 && progress < 1;
}

function CosmeticBorder({
  player,
  frame,
  index,
  progress,
}: {
  player: Player;
  frame: number;
  index: number;
  progress: number;
}) {
  if (player.border === "none" || progress <= 0) return null;

  if (player.border === "elite") {
    const phase = positiveModulo(frame + index * 19, 180) / 180;
    const opacity = interpolate(
      phase,
      [0, 0.7, 0.76, 0.88, 1],
      [0, 0, 1, 1, 0],
      clamp,
    );
    const glow = interpolate(phase, [0.7, 0.76, 0.88, 1], [0, 1, 0, 0], clamp);
    return (
      <div
        className="absolute inset-0 rounded-md"
        style={{
          opacity: progress * opacity,
          background:
            "linear-gradient(#f5d27a,#f5d27a) top left/12px 2px no-repeat,linear-gradient(#f5d27a,#f5d27a) top left/2px 10px no-repeat,linear-gradient(#f5d27a,#f5d27a) top right/12px 2px no-repeat,linear-gradient(#f5d27a,#f5d27a) top right/2px 10px no-repeat,linear-gradient(#f5d27a,#f5d27a) bottom left/12px 2px no-repeat,linear-gradient(#f5d27a,#f5d27a) bottom left/2px 10px no-repeat,linear-gradient(#f5d27a,#f5d27a) bottom right/12px 2px no-repeat,linear-gradient(#f5d27a,#f5d27a) bottom right/2px 10px no-repeat",
          filter: `drop-shadow(0 0 1px #000) drop-shadow(0 0 ${glow * 4}px rgba(255,217,94,.9))`,
        }}
      />
    );
  }

  if (player.border === "chasing") {
    const phase = positiveModulo(frame + index * 23, 180) / 180;
    const active = interpolate(
      phase,
      [0, 0.03, 0.39, 0.4, 1],
      [0, 1, 1, 0, 0],
      clamp,
    );
    const topPosition = interpolate(phase, [0, 0.4], [110, -10], clamp);
    const bottomPosition = interpolate(phase, [0, 0.4], [-10, 110], clamp);
    const chase = `color-mix(in oklch, ${player.color} 55%, white)`;
    return (
      <div
        className="absolute inset-0 rounded-md"
        style={{
          opacity: progress * active,
          background: `linear-gradient(90deg,transparent 40%,${chase} 48.5%,#fff 50%,transparent 50.2%) ${topPosition}% 0/250% 2px no-repeat,linear-gradient(270deg,transparent 40%,${chase} 48.5%,#fff 50%,transparent 50.2%) ${bottomPosition}% 100%/250% 2px no-repeat`,
          filter: `drop-shadow(0 0 3px ${chase})`,
        }}
      />
    );
  }

  const phase = positiveModulo(frame + index * 13, 120) / 120;
  const opacity = interpolate(
    phase,
    [0, 0.84, 0.85, 0.87, 0.89, 0.91, 0.93, 1],
    [0, 0, 1, 0.25, 1, 0.4, 0, 0],
    clamp,
  );
  return (
    <div
      className="absolute inset-0 rounded-md"
      style={{
        opacity: progress * opacity,
        boxShadow: "inset 0 0 0 1px #9bd8ff, inset 0 0 6px #4fb3ff88",
        filter: `brightness(${interpolate(opacity, [0, 1], [1, 1.45])})`,
      }}
    />
  );
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function cosmeticBackgroundOpacity(player: Player): number {
  return player.background === "arcane" ? 0.32 : 1;
}

function cosmeticBackground(
  player: Player,
  frame: number,
  index: number,
): string {
  switch (player.background) {
    case "sunlit":
      return "linear-gradient(to right,transparent 50%,rgba(255,215,106,.38))";
    case "starfall":
      return "transparent";
    case "satin":
      return "linear-gradient(to bottom,transparent 15%,rgba(255,255,255,.16) 45%,transparent 80%)";
    case "arcane":
      return `linear-gradient(${90 + Math.sin((frame + index) * 0.03) * 8}deg,transparent 10%,color-mix(in oklch,${player.color} 65%,#a855f7) 50%,transparent 90%)`;
    case "frosted":
      return "linear-gradient(to bottom,rgba(230,247,255,.26),transparent 32%,transparent 68%,rgba(230,247,255,.18))";
    case "glossy":
      return "linear-gradient(to bottom,rgba(255,255,255,.22),rgba(255,255,255,.04) 50%,rgba(0,0,0,.2) 51%,rgba(0,0,0,.05))";
  }
}

function cosmeticNameStyle(
  player: Player,
  progress: number,
  frame: number,
): CSSProperties {
  if (progress <= 0) {
    return { color: player.color };
  }

  const outline =
    "drop-shadow(1px 0 0 #000) drop-shadow(-1px 0 0 #000) drop-shadow(0 1px 0 #000) drop-shadow(0 -1px 0 #000)";
  const common: CSSProperties = {
    fontWeight: 700,
    filter: outline,
    opacity: interpolate(progress, [0, 1], [0.78, 1]),
  };

  if (player.nameStyle === "epic") return { ...common, color: "#d2a6ff" };
  if (player.nameStyle === "frost")
    return {
      ...common,
      color: "#d9f3ff",
      filter: `${outline} drop-shadow(0 0 3px rgba(95,180,232,.4))`,
    };

  const backgrounds: Record<Player["nameStyle"], string> = {
    gilded: "linear-gradient(180deg,#fff7d6 0%,#ffd95e 55%,#e5a82f 100%)",
    prismatic:
      "linear-gradient(90deg,#ffa3a3,#ffe38a,#9dffb8,#8ce0ff,#d1a8ff,#ffa3a3)",
    epic: "linear-gradient(180deg,#d2a6ff,#d2a6ff)",
    fel: "linear-gradient(0deg,#7ee84a,#c2ff70 60%,#f2ffd6)",
    frost: "linear-gradient(180deg,#fff,#d9f3ff,#a3dcff)",
    legendary: "linear-gradient(110deg,#ff9d33 30%,#fff1d9 48%,#ff9d33 65%)",
  };

  return {
    ...common,
    color: "transparent",
    backgroundImage: backgrounds[player.nameStyle],
    backgroundSize:
      player.nameStyle === "prismatic" ? "280% 100%" : "220% 100%",
    backgroundPosition: `${(frame * (player.nameStyle === "fel" ? 1.2 : 2.3)) % 220}% 50%`,
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    filter:
      player.nameStyle === "fel"
        ? `${outline} drop-shadow(0 0 ${2 + (0.5 + Math.sin(frame * 0.08) * 0.5) * 2}px rgba(90,255,42,.48))`
        : outline,
  };
}

function EditorScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({
    frame,
    fps,
    config: { damping: 190 },
    durationInFrames: 24,
  });
  const exit = interpolate(
    frame,
    [EDITOR_END - EDITOR_START - 22, EDITOR_END - EDITOR_START],
    [1, 0],
    ease,
  );
  const nameSelected = frame >= 43;
  const backgroundSelected = frame >= 84;
  const borderSelected = frame >= 125;
  const selectedCount =
    Number(nameSelected) + Number(backgroundSelected) + Number(borderSelected);
  const selectedPlayer: Player = {
    ...PLAYERS[1],
    nameStyle: nameSelected ? "prismatic" : "epic",
    background: backgroundSelected ? "starfall" : "satin",
    border: borderSelected ? "elite" : "none",
    flashy: true,
  };

  return (
    <div className="absolute inset-0" style={{ opacity: exit }}>
      <SceneTitle
        kicker="Account → Characters"
        title="Build a signature, slot by slot"
        detail="Each linked character gets its own name, background, and border."
        entrance={entrance}
      />
      <BrowserFrame
        style={{
          opacity: entrance,
          translate: `0 ${interpolate(entrance, [0, 1], [20, 0])}px`,
        }}
      >
        <div className="grid h-[399px] grid-cols-[270px_1fr]">
          <div className="border-r border-white/8 bg-[#0b0e14] p-4">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.17em] text-zinc-500">
              <Link2 className="h-3.5 w-3.5 text-emerald-400" /> Linked
              characters
            </div>
            <div className="rounded-xl border border-amber-300/35 bg-amber-300/6 p-3 shadow-[inset_3px_0_0_rgba(251,191,36,.6)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-bold text-zinc-100">Saelene</p>
                  <p className="text-[11px] text-zinc-500">
                    60 Priest · Tel'Abim
                  </p>
                </div>
                <Check className="h-4 w-4 text-amber-300" />
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-[10px] text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" /> Active supporter
              </div>
            </div>
            <div className="mt-2 rounded-lg border border-white/6 px-3 py-2 opacity-55">
              <p className="text-sm font-semibold text-[#69ccf0]">Welf</p>
              <p className="text-[10px] text-zinc-500">60 Mage · Turtle WoW</p>
            </div>
            <div className="mt-2 rounded-lg border border-white/6 px-3 py-2 opacity-55">
              <p className="text-sm font-semibold text-[#c79c6e]">
                Dreadnaught
              </p>
              <p className="text-[10px] text-zinc-500">60 Warrior · Tel'Abim</p>
            </div>
          </div>

          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-100">
                  Customize Saelene
                </p>
                <p className="text-[11px] text-zinc-500">
                  Previewed wherever this character appears in logs.
                </p>
              </div>
              <span className="rounded-full border border-violet-400/50 bg-violet-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-300">
                Exalted
              </span>
            </div>

            <div className="mt-3 rounded-lg border border-white/8 bg-[#090c12] p-2.5">
              <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600">
                Live preview
              </p>
              <PlayerRow
                player={selectedPlayer}
                index={1}
                frame={frame}
                mode="enabled"
                cosmeticReveal={1}
                compact={false}
              />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3">
              <CosmeticSlot
                label="Name"
                value={nameSelected ? "Prismatic" : "Epic"}
                icon={<Sparkles className="h-4 w-4" />}
                selected={nameSelected}
                progress={interpolate(frame, [34, 43, 51], [0, 1, 0], clamp)}
                swatch="linear-gradient(90deg,#ffa3a3,#ffe38a,#9dffb8,#8ce0ff,#d1a8ff)"
              />
              <CosmeticSlot
                label="Background"
                value={backgroundSelected ? "Starfall" : "Satin"}
                icon={<Wand2 className="h-4 w-4" />}
                selected={backgroundSelected}
                progress={interpolate(frame, [75, 84, 92], [0, 1, 0], clamp)}
                swatch="radial-gradient(circle at 30% 30%,#fff 0 1px,transparent 1.6px) 0 0/31px 100%,radial-gradient(circle at 75% 70%,#fff7d6 0 .8px,transparent 1.3px) 0 0/53px 100%,linear-gradient(to right,rgba(0,0,0,.3),rgba(0,0,0,.15)),#f3f4f6"
              />
              <CosmeticSlot
                label="Border"
                value={borderSelected ? "Elite" : "Default"}
                icon={<Crown className="h-4 w-4" />}
                selected={borderSelected}
                progress={interpolate(frame, [116, 125, 133], [0, 1, 0], clamp)}
                swatch="linear-gradient(#f5d27a,#f5d27a) top left/12px 2px no-repeat,linear-gradient(#f5d27a,#f5d27a) top left/2px 10px no-repeat,linear-gradient(#f5d27a,#f5d27a) top right/12px 2px no-repeat,linear-gradient(#f5d27a,#f5d27a) top right/2px 10px no-repeat,linear-gradient(#f5d27a,#f5d27a) bottom left/12px 2px no-repeat,linear-gradient(#f5d27a,#f5d27a) bottom left/2px 10px no-repeat,linear-gradient(#f5d27a,#f5d27a) bottom right/12px 2px no-repeat,linear-gradient(#f5d27a,#f5d27a) bottom right/2px 10px no-repeat,#17130b"
              />
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3">
              <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                <span className="rounded bg-white/5 px-2 py-1">
                  {selectedCount}/3 slots changed
                </span>
                {borderSelected ? (
                  <span className="text-amber-300">Ready to save</span>
                ) : (
                  <span>Choose a treatment</span>
                )}
              </div>
              <div
                className="rounded-md bg-amber-300 px-4 py-1.5 text-xs font-bold text-amber-950 shadow-[0_0_18px_rgba(251,191,36,.24)]"
                style={{ opacity: borderSelected ? 1 : 0.45 }}
              >
                Save cosmetics
              </div>
            </div>
          </div>
        </div>
      </BrowserFrame>
      <StepCaption
        step={4}
        opacity={interpolate(
          frame,
          [
            10,
            22,
            EDITOR_END - EDITOR_START - 35,
            EDITOR_END - EDITOR_START - 20,
          ],
          [0, 1, 1, 0],
          clamp,
        )}
        text={
          selectedCount < 2
            ? "Choose a name treatment for a linked character"
            : selectedCount < 3
              ? "Add a background without changing the chart itself"
              : "Finish with a border, then save the full signature"
        }
      />
    </div>
  );
}

function CosmeticSlot({
  label,
  value,
  icon,
  selected,
  progress,
  swatch,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  selected: boolean;
  progress: number;
  swatch: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-lg border bg-[#0c1017] p-2.5"
      style={{
        borderColor: selected
          ? "rgba(252,211,77,.62)"
          : "rgba(255,255,255,.09)",
        boxShadow: selected ? "inset 0 0 20px rgba(251,191,36,.06)" : undefined,
        scale: interpolate(progress, [0, 1], [1, 0.96]),
      }}
    >
      <div className="flex items-center justify-between text-zinc-400">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.13em]">
          {icon}
          {label}
        </span>
        {selected ? <Check className="h-3.5 w-3.5 text-amber-300" /> : null}
      </div>
      <div
        className="mt-2 h-8 rounded border border-white/10"
        style={{ background: swatch, opacity: selected ? 1 : 0.45 }}
      />
      <p className="mt-1.5 text-xs font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

function ControlsScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({
    frame,
    fps,
    config: { damping: 190 },
    durationInFrames: 24,
  });
  const exit = interpolate(
    frame,
    [CONTROLS_END - CONTROLS_START - 22, CONTROLS_END - CONTROLS_START],
    [1, 0],
    ease,
  );
  const mode: ViewerMode =
    frame < 58 ? "enabled" : frame < 116 ? "limited" : "disabled";
  const step = mode === "enabled" ? 5 : mode === "limited" ? 6 : 7;
  const modeChangedAt = mode === "enabled" ? 0 : mode === "limited" ? 58 : 116;
  const modePulse = interpolate(
    frame,
    [modeChangedAt, modeChangedAt + 8, modeChangedAt + 18],
    [0, 1, 0],
    clamp,
  );

  return (
    <div className="absolute inset-0" style={{ opacity: exit }}>
      <SceneTitle
        kicker="Account → Settings"
        title="The viewer controls the volume"
        detail="Enabled, Limited, and Disabled change only what you see."
        entrance={entrance}
      />
      <BrowserFrame
        style={{
          opacity: entrance,
          translate: `0 ${interpolate(entrance, [0, 1], [20, 0])}px`,
        }}
      >
        <div className="flex h-[399px]">
          <div className="w-[294px] shrink-0 border-r border-white/8 bg-[#0b0e14] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Eye className="h-4 w-4 text-amber-300" />
              <div>
                <p className="text-sm font-semibold text-zinc-100">
                  Character cosmetics
                </p>
                <p className="text-[10px] text-zinc-500">
                  Choose how raid rows appear to you.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <ModeOption
                mode="enabled"
                selected={mode === "enabled"}
                title="Enabled"
                detail="All static and animated effects"
              />
              <ModeOption
                mode="limited"
                selected={mode === "limited"}
                title="Limited"
                detail="Static cosmetics only"
              />
              <ModeOption
                mode="disabled"
                selected={mode === "disabled"}
                title="Disabled"
                detail="Standard player rows"
              />
            </div>
            <div
              className="mt-4 rounded-lg border px-3 py-2 text-[11px]"
              style={{
                borderColor:
                  mode === "enabled"
                    ? "rgba(192,132,252,.35)"
                    : mode === "limited"
                      ? "rgba(96,165,250,.35)"
                      : "rgba(161,161,170,.25)",
                background:
                  mode === "enabled"
                    ? "rgba(88,28,135,.18)"
                    : mode === "limited"
                      ? "rgba(30,64,175,.14)"
                      : "rgba(39,39,42,.5)",
                scale: interpolate(modePulse, [0, 1], [1, 1.025]),
              }}
            >
              <p className="font-semibold text-zinc-200">
                {mode === "enabled"
                  ? "Full enchantment"
                  : mode === "limited"
                    ? "A quieter ledger"
                    : "Classic Chronicle"}
              </p>
              <p className="mt-0.5 text-zinc-500">
                {mode === "enabled"
                  ? "Motion, glints, and static styles."
                  : mode === "limited"
                    ? "Flashy slots are hidden. Static ones remain."
                    : "No cosmetic styling is rendered."}
              </p>
            </div>
          </div>

          <div className="min-w-0 flex-1 p-3">
            <div className="flex items-center justify-between px-1 pb-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-zinc-500">
                  Damage Done · live preview
                </p>
                <p className="text-xs text-zinc-300">Nefarian</p>
              </div>
              <ModePill mode={mode} />
            </div>
            <DamageChart frame={frame + CONTROLS_START} mode={mode} compact />
            {mode === "limited" ? (
              <div className="mx-4 mt-1.5 flex items-center justify-between rounded-md border border-sky-400/20 bg-sky-400/7 px-3 py-1.5 text-[10px]">
                <span className="flex items-center gap-1.5 text-sky-200">
                  <EyeOff className="h-3 w-3" /> Animated name, background, and
                  border effects hidden
                </span>
                <span className="text-amber-200">
                  Static gold, epic, frost, satin retained
                </span>
              </div>
            ) : null}
            {mode === "disabled" ? (
              <div className="mx-4 mt-1.5 flex items-center gap-2 rounded-md border border-zinc-600/30 bg-zinc-800/35 px-3 py-1.5 text-[10px] text-zinc-400">
                <EyeOff className="h-3 w-3" /> Standard class-color rows
                restored for every player
              </div>
            ) : null}
          </div>
        </div>
      </BrowserFrame>
      <StepCaption
        step={step}
        opacity={interpolate(
          frame,
          [
            10,
            22,
            CONTROLS_END - CONTROLS_START - 35,
            CONTROLS_END - CONTROLS_START - 20,
          ],
          [0, 1, 1, 0],
          clamp,
        )}
        text={
          mode === "enabled"
            ? "Enabled shows the complete supporter cosmetic"
            : mode === "limited"
              ? "Limited suppresses flashy effects while static treatments stay"
              : "Disabled restores the standard Chronicle player rows"
        }
      />
    </div>
  );
}

function ModeOption({
  mode,
  selected,
  title,
  detail,
}: {
  mode: ViewerMode;
  selected: boolean;
  title: string;
  detail: string;
}) {
  const Icon = mode === "enabled" ? Zap : mode === "limited" ? Eye : EyeOff;
  const color =
    mode === "enabled" ? "#c084fc" : mode === "limited" ? "#60a5fa" : "#a1a1aa";
  return (
    <div
      className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
      style={{
        borderColor: selected ? color : "rgba(255,255,255,.08)",
        background: selected
          ? `color-mix(in oklch, ${color} 12%, transparent)`
          : "rgba(255,255,255,.018)",
        boxShadow: selected ? `inset 3px 0 0 ${color}` : undefined,
      }}
    >
      <Icon
        className="h-4 w-4 shrink-0"
        style={{ color: selected ? color : "#71717a" }}
      />
      <div className="min-w-0">
        <p
          className="text-xs font-semibold"
          style={{ color: selected ? "#f4f4f5" : "#a1a1aa" }}
        >
          {title}
        </p>
        <p className="truncate text-[10px] text-zinc-600">{detail}</p>
      </div>
      <span
        className="ml-auto h-3.5 w-3.5 rounded-full border"
        style={{
          borderColor: selected ? color : "#52525b",
          background: selected ? color : "transparent",
          boxShadow: selected ? `inset 0 0 0 3px #0b0e14` : undefined,
        }}
      />
    </div>
  );
}

function ModePill({ mode }: { mode: ViewerMode }) {
  const color =
    mode === "enabled" ? "#c084fc" : mode === "limited" ? "#60a5fa" : "#a1a1aa";
  return (
    <span
      className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em]"
      style={{ color, borderColor: `${color}88`, background: `${color}12` }}
    >
      {mode}
    </span>
  );
}

function Finale() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({
    frame,
    fps,
    config: { damping: 170, stiffness: 130 },
    durationInFrames: 30,
  });
  const glint = interpolate(frame, [18, 82], [-20, 120], clamp);
  const sigils = [
    { left: 162, top: 154, color: "#f5c75b", delay: 0 },
    { left: 1038, top: 142, color: "#9dffb8", delay: 7 },
    { left: 1114, top: 482, color: "#c084fc", delay: 14 },
    { left: 122, top: 496, color: "#69ccf0", delay: 21 },
  ];

  return (
    <div className="absolute inset-0 bg-[#05080d]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgba(181,132,46,0.18),transparent_36%),radial-gradient(circle_at_68%_34%,rgba(126,232,74,0.08),transparent_28%),radial-gradient(circle_at_28%_68%,rgba(192,132,252,0.09),transparent_30%)]" />
      {sigils.map((sigil, index) => {
        const appear = spring({
          frame: frame - sigil.delay,
          fps,
          config: { damping: 160 },
          durationInFrames: 24,
        });
        return (
          <div
            key={index}
            className="absolute grid h-14 w-14 place-items-center rounded-full border"
            style={{
              left: sigil.left,
              top: sigil.top,
              color: sigil.color,
              borderColor: `${sigil.color}4d`,
              opacity: appear * 0.72,
              scale: interpolate(appear, [0, 1], [0.55, 1]),
              boxShadow: `0 0 28px ${sigil.color}22, inset 0 0 20px ${sigil.color}16`,
              rotate: `${(frame + sigil.delay) * (index % 2 === 0 ? 0.18 : -0.14)}deg`,
            }}
          >
            {index === 0 ? (
              <Crown className="h-6 w-6" />
            ) : index === 1 ? (
              <Zap className="h-6 w-6" />
            ) : index === 2 ? (
              <Sparkles className="h-6 w-6" />
            ) : (
              <Wand2 className="h-6 w-6" />
            )}
          </div>
        );
      })}

      <div
        className="absolute inset-x-[150px] top-[146px] overflow-hidden rounded-[28px] border border-amber-200/20 bg-black/25 px-16 py-14 text-center shadow-[0_35px_120px_rgba(0,0,0,.65),inset_0_0_80px_rgba(251,191,36,.04)]"
        style={{
          opacity: entrance,
          scale: interpolate(entrance, [0, 1], [0.93, 1]),
          translate: `0 ${interpolate(entrance, [0, 1], [24, 0])}px`,
        }}
      >
        <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/8 px-4 py-1.5 text-[12px] font-bold uppercase tracking-[0.2em] text-amber-200">
          <Sparkles className="h-4 w-4" /> Supporter feature
        </div>
        <h1 className="font-wow mt-5 text-[68px] font-bold tracking-tight text-zinc-50">
          Character cosmetics
        </h1>
        <p className="mx-auto mt-2 max-w-[760px] text-[22px] leading-snug text-zinc-300">
          Make every raid row unmistakably yours.
        </p>
        <div className="relative mx-auto mt-8 flex w-fit items-center gap-3 overflow-hidden rounded-xl border border-amber-200/35 bg-amber-300 px-7 py-3 text-[22px] font-bold text-amber-950 shadow-[0_0_34px_rgba(251,191,36,.22)]">
          <span
            className="absolute inset-y-0 w-28 -skew-x-12 bg-gradient-to-r from-transparent via-white/55 to-transparent"
            style={{ left: `${glint}%` }}
          />
          Customize in Account <ChevronRight className="h-5 w-5" /> Characters
        </div>
        <p className="mt-5 flex items-center justify-center gap-2 text-[15px] text-zinc-500">
          <Eye className="h-4 w-4 text-sky-400" /> Display controls in Account{" "}
          <ChevronRight className="h-3.5 w-3.5" /> Settings
        </p>
      </div>
    </div>
  );
}
