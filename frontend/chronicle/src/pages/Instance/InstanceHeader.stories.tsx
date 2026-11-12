import type { Meta, StoryObj } from "@storybook/react-vite";
import { BarChart3, CircleHelp, List, Menu, RotateCcw, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import type { DifficultyEncounter } from "@/components/EncounterDifficulty/encounterDifficulty";
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages";
import { InstanceHeader } from "./InstanceHeader";

const encounters: DifficultyEncounter[] = Array.from({ length: 12 }, (_, index) => ({
  name: `Boss ${index + 1}`,
  boss: true,
  kill_type: "clean",
  difficulty: index < 2 ? "" : "heroic",
}));

const difficulty = {
  maxPlayers: 25,
  encounters,
  mixedDifficulty: true,
};

function ModeSwitch() {
  return (
    <div className="flex items-center rounded-sm border border-white/10 bg-background/40 p-0.5 text-xs">
      <Button size="sm" className="h-7 gap-1.5 rounded-sm px-2.5">
        <List className="h-3.5 w-3.5" />
        Encounters
      </Button>
      <Button variant="ghost" size="sm" className="h-7 gap-1.5 rounded-sm px-2.5">
        <BarChart3 className="h-3.5 w-3.5" />
        Overview
        <span className="text-[9px] font-bold text-amber-400">BETA</span>
      </Button>
    </div>
  );
}

function DesktopActions() {
  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5">
        <Share2 className="h-4 w-4" /> Share
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5">
        <RotateCcw className="h-4 w-4" /> Replay
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5">
        <CircleHelp className="h-4 w-4" /> Help
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open instance menu">
        <Menu className="h-4 w-4" />
      </Button>
    </>
  );
}

const meta = {
  title: "Instance/InstanceHeader",
  component: InstanceHeader,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="min-h-screen bg-background p-3 text-foreground sm:p-5">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
  args: {
    name: "Icecrown Citadel",
    backgroundUrl: getInstanceBackground("Icecrown Citadel") ?? undefined,
    difficulty,
    realm: "Onyxia",
    startTimeLabel: "10/31/2026, 3:12:47 PM",
    elapsedDurationMs: 8_229_000,
    combatDurationMs: 6_135_000,
  },
} satisfies Meta<typeof InstanceHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Full desktop header at the width where all controls should remain calm and readable. */
export const Desktop: Story = {
  args: {
    isMobile: false,
    desktopModeSwitch: <ModeSwitch />,
    desktopActions: <DesktopActions />,
  },
  render: (args) => (
    <div className="mx-auto w-full max-w-[1536px]">
      <InstanceHeader {...args} />
    </div>
  ),
};

/** Narrow phone header. Difficulty gets its own row, and the mixed breakdown stays in one compact badge. */
export const Mobile: Story = {
  args: {
    isMobile: true,
    mobileMenu: (
      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open instance menu">
        <Menu className="h-4 w-4" />
      </Button>
    ),
  },
  render: (args) => (
    <div className="mx-auto w-[360px] max-w-full">
      <InstanceHeader {...args} />
    </div>
  ),
};

/** The guild line remains separate on mobile so long identities do not compete with timing data. */
export const MobileWithGuild: Story = {
  ...Mobile,
  args: {
    ...Mobile.args,
    guild: <span className="text-amber-500">&lt;Really Long Guild Name&gt;</span>,
  },
};
