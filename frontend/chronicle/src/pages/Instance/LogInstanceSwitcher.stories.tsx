import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import type { DungeonInstanceSetMember } from "@/api/typesGenerated";
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages";
import { InstanceHeader } from "./InstanceHeader";
import { LogInstanceStepper, LogInstanceTabs } from "./LogInstanceSwitcher";

function member(slug: string, name: string, start: string, end: string, bossKills: number, wipes: number): DungeonInstanceSetMember {
  return { id: slug, slug, name, start_time: start, end_time: end, boss_kills: bossKills, wipes };
}

/** The three City of Dalaran resets from one WoW Forever log (2026-11-15). */
const dalaranResets = [
  member("dal-1", "City of Dalaran", "2026-11-15T23:47:12Z", "2026-11-16T00:32:19Z", 8, 0),
  member("dal-2", "City of Dalaran", "2026-11-16T00:44:05Z", "2026-11-16T01:04:30Z", 1, 1),
  member("dal-3", "City of Dalaran", "2026-11-16T01:12:44Z", "2026-11-16T02:48:14Z", 8, 4),
];

/** Eight resets: the tab strip must scroll rather than squeeze. */
const deadminesFarm = Array.from({ length: 8 }, (_, index) => {
  const start = Date.UTC(2026, 10, 15, 18, 0) + index * 38 * 60_000;
  return member(
    `dm-${index}`,
    "The Deadmines",
    new Date(start).toISOString(),
    new Date(start + 31 * 60_000).toISOString(),
    index === 5 ? 4 : 7,
    index % 3 === 0 ? 1 : 0,
  );
});

interface DemoProps {
  members: DungeonInstanceSetMember[];
  isMobile?: boolean;
}

function InstancePage({ members, isMobile = false }: DemoProps) {
  const { slug } = useParams();
  const current = members.find((m) => m.slug === slug) ?? members[0];
  const elapsed = new Date(current.end_time ?? 0).getTime() - new Date(current.start_time ?? 0).getTime();
  return (
    <>
      <InstanceHeader
        isMobile={isMobile}
        name={current.name}
        backgroundUrl={getInstanceBackground(current.name) ?? undefined}
        titleBadges={isMobile ? <LogInstanceStepper members={members} currentId={current.id} /> : undefined}
        startTimeLabel={new Date(current.start_time ?? 0).toLocaleString()}
        elapsedDurationMs={elapsed}
        combatDurationMs={Math.round(elapsed * 0.6)}
      />
      {!isMobile && <LogInstanceTabs members={members} currentId={current.id} />}
      <div className="rounded-lg border border-dashed border-white/10 p-8 text-center text-sm text-muted-foreground">
        Encounter list and panels for <span className="text-foreground">{current.slug}</span>
      </div>
    </>
  );
}

function Demo(props: DemoProps) {
  return (
    <MemoryRouter initialEntries={[`/instances/${props.members[1]?.slug ?? props.members[0].slug}`]}>
      <Routes>
        <Route path="/instances/:slug" element={<InstancePage {...props} />} />
      </Routes>
    </MemoryRouter>
  );
}

const meta = {
  title: "Instance/LogInstanceSwitcher",
  component: Demo,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="min-h-screen bg-background p-3 text-foreground sm:p-5">
          <div className="mx-auto w-full max-w-[1536px]">
            <Story />
          </div>
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Desktop: a tab per reset under the header. */
export const Tabs: Story = { args: { members: dalaranResets } };

/** Eight resets: tabs scroll horizontally. */
export const TabsManyResets: Story = { args: { members: deadminesFarm } };

/** Phone width: a stepper in the title row, with every reset in its dropdown. */
export const StepperMobile: Story = {
  args: { members: dalaranResets, isMobile: true },
  decorators: [(Story) => <div className="mx-auto w-[360px] max-w-full"><Story /></div>],
};

/** A dungeon run once in its log: no switcher. */
export const SingleInstance: Story = { args: { members: dalaranResets.slice(0, 1) } };
