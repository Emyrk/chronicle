import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/Sonner/Sonner";
import { ALL_ACHIEVEMENTS, SERIES } from "./achievements.fixtures";
import { AchievementNextStep } from "./AchievementNextStep";
import {
  AchievementBackfillToastCard,
  AchievementToastCard,
  type AchievementToastProps,
} from "./AchievementToast";
import { showAchievementBackfillToast, showAchievementToast } from "./showAchievementToast";

const byId = (id: string) => ALL_ACHIEVEMENTS.find((achievement) => achievement.id === id)!;

function toastProps(id: string, categoryIcon: string): AchievementToastProps {
  const achievement = byId(id);
  const series = SERIES.find((candidate) => candidate.id === achievement.series_id);
  const tierCount = ALL_ACHIEVEMENTS.filter((candidate) => candidate.series_id === achievement.series_id && candidate.tier > 0).length;
  return {
    achievement,
    categoryIcon,
    series: series && achievement.tier > 0 ? { name: series.name, tierCount } : undefined,
  };
}

/** Completion toasts and in-context hints. These are the components the app calls, not mock copies. */
const meta = {
  title: "Features/Achievements/Notifications",
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="p-6">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Toasts: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <AchievementToastCard {...toastProps("layouts-4", "layout-grid")} />
      <AchievementToastCard {...toastProps("filter-craft-5", "telescope")} />
      <AchievementToastCard {...toastProps("command-center", "layout-grid")} />
      <AchievementToastCard {...toastProps("side-by-side", "telescope")} />
      <AchievementBackfillToastCard count={7} points={60} />
    </div>
  ),
};

/** Fires through sonner exactly as the app will. */
export const LiveToasts: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Toaster />
      <Button onClick={() => showAchievementToast(toastProps("keybinds-1", "keyboard"))}>Earn Keybinds I</Button>
      <Button onClick={() => showAchievementToast(toastProps("layouts-5", "layout-grid"))}>Earn Layouts V (reward)</Button>
      <Button variant="outline" onClick={() => showAchievementBackfillToast(12, 105)}>
        Backfill summary
      </Button>
    </div>
  ),
};

function NextStepDemo() {
  const [visible, setVisible] = useState({ save: true, actionBar: true, filter: true });
  return (
    <div className="flex flex-col gap-3">
      {visible.save && (
        <AchievementNextStep
          achievement={byId("layouts-4")}
          hint="Like this arrangement? Save it to your Layout Book."
          onDismiss={() => setVisible((current) => ({ ...current, save: false }))}
        />
      )}
      {visible.actionBar && (
        <AchievementNextStep
          achievement={byId("layouts-5")}
          hint="Assign this layout to an action-bar slot to switch to it with one key."
          onDismiss={() => setVisible((current) => ({ ...current, actionBar: false }))}
        />
      )}
      {visible.filter && (
        <AchievementNextStep
          achievement={byId("filter-craft-3")}
          hint="Filters can be combined. Add a second condition with AND."
          onDismiss={() => setVisible((current) => ({ ...current, filter: false }))}
        />
      )}
    </div>
  );
}

export const NextStepHints: Story = { render: () => <NextStepDemo /> };
