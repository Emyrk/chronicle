import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { CheckCircle, Flame, Skull } from "lucide-react";
import { HeroicBadge } from "@/components/HeroicBadge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
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
  /** Ulduar tiered hard modes: short label shown in the row, e.g. "3 elders". */
  tier?: string;
  /** What triggered the hard mode, shown in the tooltip. */
  detail?: string;
  wipe?: boolean;
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
  { name: "Flame Leviathan", duration: "3:55", mode: "hard", tier: "4 towers", detail: "All four towers left standing" },
  { name: "Ignis the Furnace Master", duration: "2:48", mode: "normal" },
  { name: "Razorscale", duration: "3:12", mode: "normal" },
  { name: "XT-002 Deconstructor", duration: "4:30", mode: "hard", detail: "Heart destroyed" },
  { name: "Assembly of Iron", duration: "3:40", mode: "hard", detail: "Steelbreaker killed last" },
  { name: "Kologarn", duration: "1:58", mode: "normal" },
  { name: "Auriaya", duration: "2:20", mode: "normal" },
  { name: "Hodir", duration: "2:41", mode: "hard", detail: "Killed before the cache shattered" },
  { name: "Thorim", duration: "3:05", mode: "hard", detail: "Sif stayed for the fight" },
  { name: "Freya", duration: "4:50", mode: "hard", tier: "2 elders", detail: "2 of 3 elders alive at pull" },
  { name: "Mimiron", duration: "8:12", mode: "normal" },
  { name: "General Vezax", duration: "4:15", mode: "normal" },
  { name: "Yogg-Saron", duration: "9:40", mode: "hard", tier: "1 keeper", detail: "1 keeper assisting" },
];

const MODE_LABEL: Record<Mode, string> = { normal: "Normal", heroic: "Heroic", hard: "Hard mode" };

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

function ModeTooltip({ kill, children }: { kill: BossKill; children: ReactNode }) {
  if (kill.mode === "normal") return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">
        <div className="text-xs">
          <div className="font-semibold">{MODE_LABEL[kill.mode]}</div>
          {kill.detail && <div className="text-muted-foreground">{kill.detail}</div>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/* ---------- Candidate treatments ---------- */

/** A: trailing chip. Reuses HeroicBadge ("H") for heroic; amber "HM" for hard mode, tier in the tooltip. */
function ChipRow({ kill, selected }: { kill: BossKill; selected?: boolean }) {
  const marker = kill.mode === "heroic"
    ? <HeroicBadge size="sm" />
    : kill.mode === "hard"
      ? <HardModeChip compact />
      : null;
  return <ModeTooltip kill={kill}><div><Row kill={kill} selected={selected} after={marker} /></div></ModeTooltip>;
}

/** B: chip carries the tier for tiered hard modes ("2 elders"), plain "HM" otherwise. */
function TierChipRow({ kill, selected }: { kill: BossKill; selected?: boolean }) {
  const marker = kill.mode === "heroic"
    ? <HeroicBadge size="sm" />
    : kill.mode === "hard"
      ? <HardModeChip tier={kill.tier} />
      : null;
  return <ModeTooltip kill={kill}><div><Row kill={kill} selected={selected} after={marker} /></div></ModeTooltip>;
}

/** C: leading glyph only (no text), quietest option. Purple diamond = heroic, amber flame = hard mode. */
function GlyphRow({ kill, selected }: { kill: BossKill; selected?: boolean }) {
  const glyph = kill.mode === "heroic"
    ? <span className="h-2 w-2 shrink-0 rotate-45 bg-purple-500 shadow-[0_0_6px_rgba(168,85,247,0.8)]" />
    : kill.mode === "hard"
      ? <Flame className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      : <span className="w-2 shrink-0" />;
  return <ModeTooltip kill={kill}><div><Row kill={kill} selected={selected} before={glyph} /></div></ModeTooltip>;
}

/** D: tinted name only. Risk: purple also means a 75–94 parse in WoW parse colours. */
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
        <span className="inline-flex items-center gap-1 rounded border border-amber-400/40 bg-amber-600/30 px-2 py-0.5 text-xs font-bold text-amber-100">
          <Flame className="h-3 w-3" /> {hard} hard mode{hard === 1 ? "" : "s"}
        </span>
      )}
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
  { title: "A · Trailing chip", note: "Existing purple H badge; amber HM. Tier lives in the tooltip.", RowFor: ChipRow },
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

/** Normal-only run: no markers anywhere, header unchanged. */
export const NormalOnly: Story = {
  args: {
    kills: ICC_25_MIXED.map((k) => ({ ...k, mode: "normal" as const })),
    raid: "Icecrown Citadel",
    maxPlayers: 25,
  },
};
