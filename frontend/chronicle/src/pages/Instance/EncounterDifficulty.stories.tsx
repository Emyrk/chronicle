import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { CheckCircle, Flame, Skull } from "lucide-react";
import { HeroicBadge } from "@/components/HeroicBadge";
import { HintTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";

/**
 * Design exploration: marking each boss kill's difficulty inside one log.
 *
 * ICC 10/25 lets a raid toggle Heroic per boss, so one run can mix Normal and
 * Heroic kills. Ulduar has no toggle: each boss has its own hard mode trigger,
 * and some are tiered (Freya's elders, Yogg-Saron's keepers, Leviathan's towers).
 *
 * Encounters carry no difficulty today; these fixtures stand in for a future
 * per-encounter field. Rows mirror the instance sidebar (267px, same classes).
 */

type Mode = "normal" | "heroic" | "hard";

interface BossKill {
  name: string;
  duration: string;
  mode: Mode;
  /** Tiered hard modes: the count reached this kill (towers, elders, keepers). */
  tier?: number;
  /** What happened on this kill, shown in the tooltip. */
  detail?: string;
  wipe?: boolean;
}

/** Tiered hard modes are a count. `hardest` says which end of the scale is hardest. */
interface HardModeScale {
  unit: string;
  units: string;
  min: number;
  max: number;
  hardest: "max" | "min";
}

/** How each Ulduar hard mode is triggered, so the tooltip can teach it. */
const ULDUAR_HARD_MODES: Record<string, { trigger: string; scale?: HardModeScale }> = {
  "Flame Leviathan": {
    trigger: "Leave the towers standing. Each tower buffs Leviathan.",
    scale: { unit: "tower", units: "towers", min: 1, max: 4, hardest: "max" },
  },
  "XT-002 Deconstructor": { trigger: "Destroy the Heart during a heart phase. XT-002 heals and enrages." },
  "Assembly of Iron": { trigger: "Kill Steelbreaker last, after Molgeim and Brundir." },
  "Hodir": { trigger: "Kill Hodir before the Rare Cache shatters." },
  "Thorim": { trigger: "Reach Thorim before Sif leaves, so she joins the fight." },
  "Freya": {
    trigger: "Leave the elders alive. Each one gives Freya an ability.",
    scale: { unit: "elder", units: "elders", min: 1, max: 3, hardest: "max" },
  },
  "Mimiron": { trigger: "Press the big red button. The room fills with fire." },
  "General Vezax": { trigger: "Let the Saronite Vapors form the Saronite Animus and kill it." },
  "Yogg-Saron": {
    trigger: "Accept less help from the keepers. Fewer keepers is harder.",
    scale: { unit: "keeper", units: "keepers", min: 0, max: 3, hardest: "min" },
  },
};

function tierLabel(kill: BossKill): string | undefined {
  const scale = ULDUAR_HARD_MODES[kill.name]?.scale;
  if (!scale || kill.tier === undefined) return undefined;
  return `${kill.tier} ${kill.tier === 1 ? scale.unit : scale.units}`;
}

const ICC_25_MIXED: BossKill[] = [
  { name: "Lord Marrowgar", duration: "2:41", mode: "heroic" },
  { name: "Lady Deathwhisper", duration: "4:02", mode: "heroic" },
  { name: "Gunship Battle", duration: "2:15", mode: "heroic" },
  { name: "Deathbringer Saurfang", duration: "3:20", mode: "heroic" },
  { name: "Festergut", duration: "3:48", mode: "heroic" },
  { name: "Rotface", duration: "3:31", mode: "normal" },
  { name: "Professor Putricide", duration: "6:12", mode: "normal", wipe: true },
  { name: "Professor Putricide", duration: "7:05", mode: "normal" },
  { name: "Blood Prince Council", duration: "4:10", mode: "heroic" },
  { name: "Blood-Queen Lana'thel", duration: "4:44", mode: "heroic" },
  { name: "Valithria Dreamwalker", duration: "5:30", mode: "normal" },
  { name: "Sindragosa", duration: "6:20", mode: "normal" },
  { name: "The Lich King", duration: "11:02", mode: "normal" },
];

const ULDUAR_25: BossKill[] = [
  { name: "Flame Leviathan", duration: "3:55", mode: "hard", tier: 4, detail: "All four towers left standing" },
  { name: "Ignis the Furnace Master", duration: "2:48", mode: "normal" },
  { name: "Razorscale", duration: "3:12", mode: "normal" },
  { name: "XT-002 Deconstructor", duration: "4:30", mode: "hard", detail: "Heart destroyed" },
  { name: "Assembly of Iron", duration: "3:40", mode: "hard", detail: "Steelbreaker killed last" },
  { name: "Kologarn", duration: "1:58", mode: "normal" },
  { name: "Auriaya", duration: "2:20", mode: "normal" },
  { name: "Hodir", duration: "2:41", mode: "hard", detail: "Killed before the cache shattered" },
  { name: "Thorim", duration: "3:05", mode: "hard", detail: "Sif stayed for the fight" },
  { name: "Freya", duration: "4:50", mode: "hard", tier: 2, detail: "2 of 3 elders alive at pull" },
  { name: "Mimiron", duration: "8:12", mode: "normal" },
  { name: "General Vezax", duration: "4:15", mode: "normal" },
  { name: "Yogg-Saron", duration: "9:40", mode: "hard", tier: 1, detail: "1 keeper assisting" },
];


function KillIcon({ wipe }: { wipe?: boolean }) {
  return wipe
    ? <Skull className="h-4 w-4 shrink-0 text-red-500" />
    : <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />;
}

/** Shared sidebar row: status icon, name (with optional marker slots), duration. */
function Row({ kill, selected, before, after, nameClass, title }: {
  kill: BossKill;
  selected?: boolean;
  before?: ReactNode;
  after?: ReactNode;
  nameClass?: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left cursor-pointer",
        selected
          ? "bg-primary-darker text-primary-foreground border-l-3 border-l-primary-foreground/70 shadow-sm"
          : "hover:bg-accent/50",
        kill.wipe && !selected && "opacity-60",
      )}
    >
      <KillIcon wipe={kill.wipe} />
      {before}
      <span className={cn("truncate flex-1", selected && "font-semibold", nameClass)}>{kill.name}</span>
      {after}
      <span className={cn("text-xs shrink-0 font-mono", selected ? "opacity-70" : "text-muted-foreground")}>
        {kill.duration}
      </span>
    </div>
  );
}

/** Small hard mode chip, amber so it never reads as the purple Heroic badge. */
function HardModeChip({ tier, compact }: { tier?: string; compact?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-amber-400/40 bg-amber-600/80 px-1.5 py-0.5 text-[10px] font-bold text-white">
      {compact ? "HM" : <><Flame className="h-2.5 w-2.5" />{tier ?? "HM"}</>}
    </span>
  );
}

/** Pips from easiest to hardest, filled up to this kill's tier. */
function TierScale({ scale, tier }: { scale: HardModeScale; tier: number }) {
  const steps = Array.from({ length: scale.max - scale.min + 1 }, (_, i) => scale.min + i);
  // Order the pips easiest → hardest so "more filled" always means "harder".
  const ordered = scale.hardest === "max" ? steps : [...steps].reverse();
  const reached = ordered.indexOf(tier);
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {ordered.map((step, i) => (
          <div key={step} className="flex flex-col items-center gap-0.5">
            <span className={cn("h-1.5 w-6 rounded-full", i <= reached ? "bg-amber-500" : "bg-white/15")} />
            <span className={cn("text-[10px] font-mono", step === tier ? "text-amber-300 font-bold" : "text-muted-foreground")}>
              {step}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
        <span>easier</span>
        <span>hardest</span>
      </div>
    </div>
  );
}

/** Tooltip body: what this kill was, and how the mode is triggered. */
function ModeTooltipBody({ kill }: { kill: BossKill }) {
  if (kill.mode === "heroic") {
    return <span className="text-xs font-semibold text-purple-300">Heroic</span>;
  }
  const info = ULDUAR_HARD_MODES[kill.name];
  const tier = tierLabel(kill);
  return (
    <div className="max-w-64 text-xs">
      <div className="flex items-center gap-1.5 font-semibold text-amber-300">
        <Flame className="h-3.5 w-3.5" /> Hard mode{tier && <span className="text-foreground">· {tier}</span>}
      </div>
      {kill.detail && <div className="mt-1 text-foreground">{kill.detail}</div>}
      {info && (
        <div className="mt-2 border-t border-white/10 pt-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">How it's triggered</div>
          <p className="text-muted-foreground">{info.trigger}</p>
        </div>
      )}
      {info?.scale && kill.tier !== undefined && <TierScale scale={info.scale} tier={kill.tier} />}
    </div>
  );
}

/**
 * Tooltip on the marker only: the real row already shows the kill-parse
 * tooltip on hover, so the difficulty tooltip can't own the whole row.
 */
function ModeTooltip({ kill, children }: { kill: BossKill; children: ReactNode }) {
  if (kill.mode === "normal") return <>{children}</>;
  return (
    <HintTooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" className={kill.mode === "hard" ? "p-3" : undefined}>
        <ModeTooltipBody kill={kill} />
      </TooltipContent>
    </HintTooltip>
  );
}

/* ---------- Candidate treatments ---------- */

/** A: trailing soft-tint chip. Purple "H" for heroic; amber "HM" for hard mode, tier in the tooltip. */
function ChipRow({ kill, selected }: { kill: BossKill; selected?: boolean }) {
  const marker = kill.mode === "heroic"
    ? <span className="inline-flex shrink-0 cursor-help"><StyledMark kill={kill} style="soft" /></span>
    : kill.mode === "hard"
      ? <span className="inline-flex shrink-0 cursor-help"><StyledMark kill={kill} style="soft" compact /></span>
      : null;
  return <Row kill={kill} selected={selected} after={marker && <ModeTooltip kill={kill}>{marker}</ModeTooltip>} />;
}

/** B: chip carries the tier for tiered hard modes ("2 elders"), plain "HM" otherwise. */
function TierChipRow({ kill, selected }: { kill: BossKill; selected?: boolean }) {
  const marker = kill.mode === "heroic"
    ? <span className="inline-flex shrink-0 cursor-help"><StyledMark kill={kill} style="soft" /></span>
    : kill.mode === "hard"
      ? <span className="inline-flex shrink-0 cursor-help"><StyledMark kill={kill} style="soft" /></span>
      : null;
  return <Row kill={kill} selected={selected} after={marker && <ModeTooltip kill={kill}>{marker}</ModeTooltip>} />;
}

/** C: leading glyph only (no text), quietest option. Purple diamond = heroic, amber flame = hard mode. */
function GlyphRow({ kill, selected }: { kill: BossKill; selected?: boolean }) {
  const glyph = kill.mode === "heroic"
    ? <span className="h-2 w-2 shrink-0 cursor-help rotate-45 bg-purple-500 shadow-[0_0_6px_rgba(168,85,247,0.8)]" />
    : kill.mode === "hard"
      ? <Flame className="h-3.5 w-3.5 shrink-0 cursor-help text-amber-500" />
      : <span className="w-2 shrink-0" />;
  return <Row kill={kill} selected={selected} before={<ModeTooltip kill={kill}>{glyph}</ModeTooltip>} />;
}

/** D: tinted name only. Risk: purple also means a 75–94 parse in WoW parse colours. No marker to hover, so the name carries the tooltip. */
function TintRow({ kill, selected }: { kill: BossKill; selected?: boolean }) {
  const nameClass = selected
    ? undefined
    : kill.mode === "heroic" ? "text-purple-400" : kill.mode === "hard" ? "text-amber-400" : undefined;
  return <ModeTooltip kill={kill}><div><Row kill={kill} selected={selected} nameClass={nameClass} /></div></ModeTooltip>;
}

/* ---------- Instance header summary ---------- */

function HeaderSummary({ kills, maxPlayers }: { kills: BossKill[]; maxPlayers: number }) {
  const final = kills.filter((k) => !k.wipe);
  const heroic = final.filter((k) => k.mode === "heroic").length;
  const hard = final.filter((k) => k.mode === "hard").length;
  const allHeroic = heroic > 0 && heroic === final.length;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm text-muted-foreground font-medium">{maxPlayers} Player</span>
      {allHeroic && <HeroicBadge />}
      {!allHeroic && heroic > 0 && (
        <span className="inline-flex items-center gap-1 rounded border border-purple-400/30 bg-purple-600/30 px-2 py-0.5 text-xs font-bold text-purple-100">
          Heroic {heroic}/{final.length}
        </span>
      )}
      {hard > 0 && (
        <HintTooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-help items-center gap-1 rounded border border-amber-400/40 bg-amber-600/30 px-2 py-0.5 text-xs font-bold text-amber-100">
              <Flame className="h-3 w-3" /> {hard} hard mode{hard === 1 ? "" : "s"}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="p-3">
            <HardModeList kills={final} />
          </TooltipContent>
        </HintTooltip>
      )}
    </div>
  );
}

/** Header tooltip: every boss that has a hard mode, and whether this run did it. */
function HardModeList({ kills }: { kills: BossKill[] }) {
  const withHardMode = kills.filter((k) => ULDUAR_HARD_MODES[k.name]);
  return (
    <div className="w-60 text-xs">
      <div className="mb-1.5 font-semibold">Hard modes this run</div>
      <ul className="space-y-1">
        {withHardMode.map((k) => (
          <li key={k.name} className={cn("flex items-center gap-2", k.mode !== "hard" && "text-muted-foreground")}>
            {k.mode === "hard"
              ? <Flame className="h-3 w-3 shrink-0 text-amber-400" />
              : <span className="h-3 w-3 shrink-0 text-center leading-3">–</span>}
            <span className="flex-1 truncate">{k.name}</span>
            <span className={cn("shrink-0", k.mode === "hard" && "text-amber-300")}>
              {k.mode === "hard" ? tierLabel(k) ?? "Hard" : "Normal"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Every tooltip body laid out flat, for review without hovering. */
function TooltipGallery({ kills }: { kills: BossKill[] }) {
  const marked = kills.filter((k) => k.mode !== "normal" && !k.wipe);
  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="rounded-md border bg-popover p-3 shadow-md"><HardModeList kills={kills.filter((k) => !k.wipe)} /></div>
      {marked.map((k) => (
        <div key={k.name} className="rounded-md border bg-popover p-3 shadow-md">
          <ModeTooltipBody kill={k} />
        </div>
      ))}
    </div>
  );
}

/* ---------- Layout helpers ---------- */

type RowComponent = (props: { kill: BossKill; selected?: boolean }) => ReactNode;

function SidebarColumn({ title, note, kills, RowFor }: {
  title: string;
  note: string;
  kills: BossKill[];
  RowFor: RowComponent;
}) {
  return (
    <div className="w-[251px] shrink-0">
      <div className="mb-1 text-sm font-semibold">{title}</div>
      <p className="mb-3 min-h-10 text-xs text-muted-foreground">{note}</p>
      <div className="space-y-1">
        {kills.map((kill, i) => <RowFor key={`${kill.name}-${i}`} kill={kill} selected={i === 3} />)}
      </div>
    </div>
  );
}

const CANDIDATES: { title: string; note: string; RowFor: RowComponent }[] = [
  { title: "A · Trailing chip", note: "Soft-tint purple H; amber HM. Tier lives in the tooltip.", RowFor: ChipRow },
  { title: "B · Chip with tier", note: "Same as A, but tiered hard modes print the tier (\"2 elders\").", RowFor: TierChipRow },
  { title: "C · Leading glyph", note: "No text, lowest noise. Needs the legend/tooltip to learn.", RowFor: GlyphRow },
  { title: "D · Tinted name", note: "Quietest, but purple collides with parse colours.", RowFor: TintRow },
];

function Comparison({ kills, raid, maxPlayers }: { kills: BossKill[]; raid: string; maxPlayers: number }) {
  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-xl font-bold">{raid}</h1>
        <HeaderSummary kills={kills} maxPlayers={maxPlayers} />
      </div>
      <div className="flex gap-8">
        {CANDIDATES.map((c) => <SidebarColumn key={c.title} {...c} kills={kills} />)}
      </div>
    </div>
  );
}

/* ---------- Marker styles (B's placement, different chip looks) ---------- */

type MarkStyle = "current" | "soft" | "outline" | "solid" | "letter";

const MARK_STYLES: { style: MarkStyle; title: string; note: string }[] = [
  { style: "current", title: "Current", note: "Today's HeroicBadge: solid, glow, shimmer." },
  { style: "soft", title: "Soft tint", note: "Translucent fill, coloured text. Matches the header chips." },
  { style: "outline", title: "Outline", note: "Border and text only; lightest box." },
  { style: "solid", title: "Flat solid", note: "Solid fill like today, without glow or shimmer." },
  { style: "letter", title: "Letter only", note: "Bold coloured letters, no box at all." },
];

const MARK_BOX = "inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold leading-none";

/** `compact` prints "HM" even for tiered hard modes (option A). */
function StyledMark({ kill, style, compact }: { kill: BossKill; style: MarkStyle; compact?: boolean }) {
  if (kill.mode === "normal") return null;
  const heroic = kill.mode === "heroic";
  const label = heroic ? "H" : (!compact && tierLabel(kill)) || "HM";
  const flame = !heroic && <Flame className="h-2.5 w-2.5" />;
  if (style === "current") {
    return heroic ? <HeroicBadge size="sm" /> : <HardModeChip tier={tierLabel(kill)} />;
  }
  const look: Record<Exclude<MarkStyle, "current">, string> = {
    soft: heroic
      ? "bg-purple-500/20 text-purple-200 ring-1 ring-inset ring-purple-400/40"
      : "bg-amber-500/15 text-amber-200 ring-1 ring-inset ring-amber-400/40",
    outline: heroic
      ? "border border-purple-400/70 text-purple-300"
      : "border border-amber-400/70 text-amber-300",
    solid: heroic ? "bg-purple-600 text-white" : "bg-amber-600 text-white",
    letter: cn("px-0 text-xs", heroic ? "text-purple-400" : "text-amber-400"),
  };
  return <span className={cn(MARK_BOX, look[style])}>{flame}{label}</span>;
}

const STYLE_SAMPLE: BossKill[] = [
  ICC_25_MIXED[3],
  ICC_25_MIXED[4],
  ICC_25_MIXED[5],
  ...ULDUAR_25.filter((k) => ["XT-002 Deconstructor", "Freya", "Yogg-Saron", "Mimiron"].includes(k.name)),
];

function MarkerStyles() {
  return (
    <div className="flex flex-wrap gap-8">
      {MARK_STYLES.map(({ style, title, note }) => (
        <div key={style} className="w-[251px] shrink-0">
          <div className="mb-1 text-sm font-semibold">{title}</div>
          <p className="mb-3 min-h-8 text-xs text-muted-foreground">{note}</p>
          <div className="space-y-1">
            {STYLE_SAMPLE.map((kill, i) => {
              const mark = <StyledMark kill={kill} style={style} />;
              return (
                <Row
                  key={kill.name}
                  kill={kill}
                  selected={i === 0}
                  after={kill.mode !== "normal" && (
                    <ModeTooltip kill={kill}><span className="inline-flex shrink-0 cursor-help">{mark}</span></ModeTooltip>
                  )}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: "Instance/EncounterDifficulty",
  component: Comparison,
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="min-h-screen overflow-x-auto bg-background p-8 text-foreground">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Comparison>;

export default meta;

type Story = StoryObj<typeof meta>;

/** ICC 25 with the Heroic toggle flipped off from Rotface on (plus Blood Wing back on). */
export const ICC25Mixed: Story = {
  args: { kills: ICC_25_MIXED, raid: "Icecrown Citadel", maxPlayers: 25 },
};

/** ICC 25 fully Heroic: the header keeps today's single Heroic badge. */
export const ICC25AllHeroic: Story = {
  args: {
    kills: ICC_25_MIXED.map((k) => ({ ...k, mode: "heroic" as const })),
    raid: "Icecrown Citadel",
    maxPlayers: 25,
  },
};

/** Ulduar 25: per-boss hard modes, three of them tiered. */
export const Ulduar25HardModes: Story = {
  args: { kills: ULDUAR_25, raid: "Ulduar", maxPlayers: 25 },
};

/** Every Ulduar hard mode tooltip (and the header's list) open at once, for copy and layout review. */
export const UlduarTooltips: Story = {
  args: { kills: ULDUAR_25, raid: "Ulduar", maxPlayers: 25 },
  render: ({ kills }) => <TooltipGallery kills={kills} />,
};

/** Option B's placement with five chip looks, for picking a calmer Heroic "H". */
export const MarkerStyleOptions: Story = {
  args: { kills: [], raid: "", maxPlayers: 25 },
  render: () => <MarkerStyles />,
};

/** Normal-only run: no markers anywhere, header unchanged. */
export const NormalOnly: Story = {
  args: {
    kills: ICC_25_MIXED.map((k) => ({ ...k, mode: "normal" as const })),
    raid: "Icecrown Citadel",
    maxPlayers: 25,
  },
};
