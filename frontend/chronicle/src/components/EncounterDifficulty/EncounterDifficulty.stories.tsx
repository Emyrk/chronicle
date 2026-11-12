import type { Meta, StoryObj } from "@storybook/react-vite";
import { CheckCircle, Skull } from "lucide-react";
import type { KillType } from "@/api/typesGenerated";
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import {
  EncounterDifficultyMark,
  EncounterDifficultySummary,
  EncounterDifficultyTooltipBody,
  HardModeList,
} from "./EncounterDifficultyMark";
import type { DifficultyEncounter } from "./encounterDifficulty";

/**
 * Per-boss difficulty: ICC toggles Heroic per boss, so one run can mix Normal
 * and Heroic kills; Ulduar bosses each have a hard mode, some tiered (Freya's
 * elders, Yogg-Saron's keepers, Leviathan's towers). Rows mirror the instance
 * sidebar (267px, same classes).
 */

interface Kill extends DifficultyEncounter {
  duration: string;
}

const kill = (
  name: string,
  duration: string,
  difficulty?: DifficultyEncounter["difficulty"],
  kill_type: KillType = "clean",
): Kill => ({ name, duration, boss: true, kill_type, difficulty });

const HEROIC = { mode: "heroic" } as const;
const HM = { mode: "hard_mode" } as const;

const ICC_25_MIXED: Kill[] = [
  kill("Lord Marrowgar", "2:41", HEROIC),
  kill("Lady Deathwhisper", "4:02", HEROIC),
  kill("Gunship Battle", "2:15", HEROIC),
  kill("Deathbringer Saurfang", "3:20", HEROIC),
  kill("Festergut", "3:48", HEROIC),
  kill("Rotface", "3:31"),
  kill("Professor Putricide", "6:12", undefined, "wipe"),
  kill("Professor Putricide", "7:05"),
  kill("Blood Prince Council", "4:10", HEROIC),
  kill("Blood-Queen Lana'thel", "4:44", HEROIC),
  kill("Valithria Dreamwalker", "5:30"),
  kill("Sindragosa", "6:20"),
  kill("The Lich King", "11:02"),
];

const ULDUAR_25: Kill[] = [
  kill("Flame Leviathan", "3:55", { mode: "hard_mode", tier: 4 }),
  kill("Ignis the Furnace Master", "2:48"),
  kill("Razorscale", "3:12"),
  kill("XT-002 Deconstructor", "4:30", HM),
  kill("Assembly of Iron", "3:40", HM),
  kill("Kologarn", "1:58"),
  kill("Auriaya", "2:20"),
  kill("Hodir", "2:41", HM),
  kill("Thorim", "3:05", HM),
  kill("Freya", "4:50", { mode: "hard_mode", tier: 2 }),
  kill("Mimiron", "8:12"),
  kill("General Vezax", "4:15"),
  kill("Yogg-Saron", "9:40", { mode: "hard_mode", tier: 1 }),
];

function SidebarRow({ kill, selected }: { kill: Kill; selected: boolean }) {
  const wipe = kill.kill_type === "wipe";
  return (
    <div
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left cursor-pointer",
        selected
          ? "bg-primary-darker text-primary-foreground border-l-3 border-l-primary-foreground/70 shadow-sm"
          : "hover:bg-accent/50",
        wipe && !selected && "opacity-60",
      )}
    >
      {wipe
        ? <Skull className="h-4 w-4 shrink-0 text-red-500" />
        : <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />}
      <span className={cn("truncate flex-1", selected && "font-semibold")}>{kill.name}</span>
      <EncounterDifficultyMark encounterName={kill.name} difficulty={kill.difficulty} />
      <span className={cn("text-xs shrink-0 font-mono", selected ? "opacity-70" : "text-muted-foreground")}>
        {kill.duration}
      </span>
    </div>
  );
}

function RaidPreview({ kills, raid, instanceHeroic = false }: { kills: Kill[]; raid: string; instanceHeroic?: boolean }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">{raid}</h1>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-muted-foreground">25 Player</span>
          <EncounterDifficultySummary encounters={kills} instanceHeroic={instanceHeroic} />
        </div>
      </div>
      <div className="w-[251px] space-y-1">
        {kills.map((k, i) => <SidebarRow key={`${k.name}-${i}`} kill={k} selected={i === 3} />)}
      </div>
    </div>
  );
}

const meta = {
  title: "Instance/EncounterDifficulty",
  component: RaidPreview,
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="min-h-screen bg-background p-8 text-foreground">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof RaidPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

/** ICC 25 with Heroic toggled off from Rotface on, then back on for the Blood Wing. */
export const ICC25Mixed: Story = {
  args: { kills: ICC_25_MIXED, raid: "Icecrown Citadel" },
};

/** Every kill Heroic: the header keeps the full Heroic badge. */
export const ICC25AllHeroic: Story = {
  args: { kills: ICC_25_MIXED.map((k) => ({ ...k, difficulty: HEROIC })), raid: "Icecrown Citadel" },
};

/** Ulduar 25 hard modes: plain ("HM") and tiered ("4 towers", "2 elders", "1 keeper"). */
export const Ulduar25HardModes: Story = {
  args: { kills: ULDUAR_25, raid: "Ulduar" },
};

/** No per-boss data yet: the header falls back to the instance-level Heroic flag. */
export const LegacyInstanceHeroic: Story = {
  args: { kills: ICC_25_MIXED.map((k) => ({ ...k, difficulty: undefined })), raid: "Icecrown Citadel", instanceHeroic: true },
};

/** Every hard mode tooltip, and the header's list, open at once for copy review. */
export const UlduarTooltips: Story = {
  args: { kills: ULDUAR_25, raid: "Ulduar" },
  render: ({ kills }) => {
    const done = kills.filter((k) => k.kill_type !== "wipe");
    return (
      <div className="flex flex-wrap items-start gap-4">
        <div className="rounded-md border border-white/10 bg-zinc-950 p-3 text-zinc-100"><HardModeList kills={done} /></div>
        {done.flatMap((k) => k.difficulty ? [
          <div key={k.name} className="rounded-md border border-white/10 bg-zinc-950 p-3 text-zinc-100">
            <EncounterDifficultyTooltipBody encounterName={k.name} difficulty={k.difficulty} />
          </div>,
        ] : [])}
      </div>
    );
  },
};
