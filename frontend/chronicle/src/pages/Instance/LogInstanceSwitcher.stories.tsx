import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages";
import { InstanceHeader } from "./InstanceHeader";
import {
  type LogInstanceSibling,
  LogInstanceStepper,
  LogInstanceTabs,
  LogInstanceTimeline,
} from "./LogInstanceSwitcher";

/** The three City of Dalaran resets from one WoW Forever log (2026-11-15). */
const dalaranResets: LogInstanceSibling[] = [
  { id: "dal-1", name: "City of Dalaran", startTime: "2026-11-15T23:47:12Z", endTime: "2026-11-16T00:32:19Z", bossKills: 8, bossTotal: 8, wipes: 0 },
  { id: "dal-2", name: "City of Dalaran", startTime: "2026-11-16T00:44:05Z", endTime: "2026-11-16T01:04:30Z", bossKills: 1, bossTotal: 8, wipes: 1 },
  { id: "dal-3", name: "City of Dalaran", startTime: "2026-11-16T01:12:44Z", endTime: "2026-11-16T02:48:14Z", bossKills: 8, bossTotal: 8, wipes: 4 },
];

/** A night that mixes dungeons with a repeated one. */
const mixedNight: LogInstanceSibling[] = [
  { id: "rfc", name: "Ragefire Chasm", startTime: "2026-11-15T19:02:00Z", endTime: "2026-11-15T19:24:00Z", bossKills: 4, bossTotal: 4, wipes: 0 },
  { id: "dal-a", name: "City of Dalaran", startTime: "2026-11-15T19:40:00Z", endTime: "2026-11-15T20:31:00Z", bossKills: 8, bossTotal: 8, wipes: 1 },
  { id: "dal-b", name: "City of Dalaran", startTime: "2026-11-15T20:38:00Z", endTime: "2026-11-15T21:20:00Z", bossKills: 8, bossTotal: 8, wipes: 0 },
  { id: "stocks", name: "The Stockade", startTime: "2026-11-15T21:41:00Z", endTime: "2026-11-15T22:02:00Z", bossKills: 3, bossTotal: 4, wipes: 2 },
];

/** Eight resets: the strip must scroll rather than squeeze. */
const longNight: LogInstanceSibling[] = Array.from({ length: 8 }, (_, index) => {
  const start = Date.UTC(2026, 10, 15, 18, 0) + index * 38 * 60_000;
  return {
    id: `dm-${index}`,
    name: "The Deadmines",
    startTime: new Date(start).toISOString(),
    endTime: new Date(start + 31 * 60_000).toISOString(),
    bossKills: index === 5 ? 4 : 7,
    bossTotal: 7,
    wipes: index % 3 === 0 ? 1 : 0,
  };
});

type Variant = "tabs" | "stepper" | "timeline";

function Demo({ instances, variant, isMobile = false }: { instances: LogInstanceSibling[]; variant: Variant; isMobile?: boolean }) {
  const [currentId, setCurrentId] = useState(instances[1]?.id ?? instances[0].id);
  const current = instances.find((instance) => instance.id === currentId) ?? instances[0];
  const switcher = { instances, currentId, onSelect: setCurrentId };
  const elapsed = new Date(current.endTime).getTime() - new Date(current.startTime).getTime();

  return (
    <>
      <InstanceHeader
        isMobile={isMobile}
        name={current.name}
        backgroundUrl={getInstanceBackground(current.name) ?? undefined}
        titleBadges={variant === "stepper" ? <LogInstanceStepper {...switcher} /> : undefined}
        startTimeLabel={new Date(current.startTime).toLocaleString()}
        elapsedDurationMs={elapsed}
        combatDurationMs={Math.round(elapsed * 0.6)}
      />
      {variant === "tabs" && <LogInstanceTabs {...switcher} />}
      {variant === "timeline" && <LogInstanceTimeline {...switcher} />}
      <div className="rounded-lg border border-dashed border-white/10 p-8 text-center text-sm text-muted-foreground">
        Encounter list and panels for <span className="text-foreground">{current.id}</span>
      </div>
    </>
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

/** A: tabs under the header. Most discoverable; every reset's outcome is visible without clicking. */
export const Tabs: Story = { args: { instances: dalaranResets, variant: "tabs" } };

/** B: a stepper beside the title. Smallest footprint; the list lives in the dropdown. */
export const Stepper: Story = { args: { instances: dalaranResets, variant: "stepper" } };

/** C: the log as a timeline. Shows the shape of the night, including breaks between resets. */
export const Timeline: Story = { args: { instances: dalaranResets, variant: "timeline" } };

/** Different dungeons in one log; only the repeated name gets "#n". */
export const TabsMixedDungeons: Story = { args: { instances: mixedNight, variant: "tabs" } };

export const TimelineMixedDungeons: Story = { args: { instances: mixedNight, variant: "timeline" } };

/** Eight resets: tabs scroll horizontally. */
export const TabsManyResets: Story = { args: { instances: longNight, variant: "tabs" } };

export const StepperManyResets: Story = { args: { instances: longNight, variant: "stepper" } };

export const TimelineManyResets: Story = { args: { instances: longNight, variant: "timeline" } };

/** Phone width: the stepper stays in the title row. */
export const StepperMobile: Story = {
  args: { instances: dalaranResets, variant: "stepper", isMobile: true },
  decorators: [(Story) => <div className="mx-auto w-[360px] max-w-full"><Story /></div>],
};

export const TabsMobile: Story = {
  args: { instances: dalaranResets, variant: "tabs", isMobile: true },
  decorators: [(Story) => <div className="mx-auto w-[360px] max-w-full"><Story /></div>],
};

/** A log with one instance: no switcher is shown in any variant. */
export const SingleInstance: Story = { args: { instances: dalaranResets.slice(0, 1), variant: "tabs" } };
