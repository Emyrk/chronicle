import type { Meta, StoryObj } from "@storybook/react-vite";
import { CheckCircle, Skull } from "lucide-react";
import type { KillType } from "@/api/typesGenerated";
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import {
  EncounterDifficultyMark,
  EncounterDifficultySummary,
  EncounterDifficultyTooltipBody,
} from "./EncounterDifficultyMark";
import type { DifficultyEncounter } from "./encounterDifficulty";

/** Canonical per-boss difficulties in the instance sidebar and header. */

interface Kill extends DifficultyEncounter {
  duration: string;
}

const kill = (
  name: string,
  duration: string,
  difficulty: DifficultyEncounter["difficulty"] = "",
  kill_type: KillType = "clean",
): Kill => ({ name, duration, boss: true, kill_type, difficulty });

const HEROIC = "heroic";

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
      <EncounterDifficultyMark difficulty={kill.difficulty} />
      <span className={cn("text-xs shrink-0 font-mono", selected ? "opacity-70" : "text-muted-foreground")}>
        {kill.duration}
      </span>
    </div>
  );
}

function RaidPreview({ kills, raid, mixedDifficulty = false }: { kills: Kill[]; raid: string; mixedDifficulty?: boolean }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">{raid}</h1>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-muted-foreground">25 Player</span>
          <EncounterDifficultySummary encounters={kills} mixedDifficulty={mixedDifficulty} />
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
  args: { kills: ICC_25_MIXED, raid: "Icecrown Citadel", mixedDifficulty: true },
};

/** Every kill Heroic: the header keeps the full Heroic badge. */
export const ICC25AllHeroic: Story = {
  args: { kills: ICC_25_MIXED.map((k) => ({ ...k, difficulty: HEROIC })), raid: "Icecrown Citadel" },
};

/** Illustrative future identifiers, not a detector or supported game-mode catalog. */
export const FutureVariants: Story = {
  args: { kills: [kill("Boss A", "2:41", "challenge"), kill("Boss B", "3:10", ""), kill("Boss C", "1:20", "mythic_plus")], raid: "Example raid", mixedDifficulty: true },
};

export const NormalKillsHeroicWipe: Story = {
  args: { kills: [kill("Boss A", "2:41", ""), kill("Boss B", "1:10", "heroic", "wipe")], raid: "Mixed attempts", mixedDifficulty: true },
};

export const AllNormal: Story = {
  args: { kills: ICC_25_MIXED.map((k) => ({ ...k, difficulty: "" })), raid: "Normal raid" },
};

export const TooltipGallery: Story = {
  args: { kills: [], raid: "Difficulty tooltips" },
  render: () => <div className="flex flex-wrap gap-4">{["", "heroic", "challenge", "mythic_plus"].map((difficulty) => (
    <div key={difficulty} className="rounded-md border border-white/10 bg-zinc-950 p-3 text-zinc-100"><EncounterDifficultyTooltipBody difficulty={difficulty} /></div>
  ))}</div>,
};
