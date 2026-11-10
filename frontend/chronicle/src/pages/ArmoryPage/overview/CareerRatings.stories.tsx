import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { MemoryRouter } from "react-router-dom";
import { selectSupportedInstanceProgressionBosses } from "@/api/queries";
import type { CareerPlayerResponse, LeaderboardV2PlayerHistory, SupportedInstance } from "@/api/typesGenerated";
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import supportedInstances from "@/pages/Leaderboards/Hub/supportedInstances.fixture.json";
import { CareerRatingCard } from "./CareerRatingCard";
import { JourneyStatsCard } from "./JourneyStatsCard";
import { RaidRatingsCard } from "./RaidRatingsCard";
import { RenownStat } from "./RenownStat";
import { buildRaidRatings, careerStatusText, cohortKey, defaultCohort } from "./careerRatingsModel";
// Real capy responses captured 2026-11-10 (career + leaderboards-v2 player-history).
import careerWarrior from "./fixtures/careerWarrior.json";
import historyWarrior from "./fixtures/historyWarrior.json";
import careerPriest from "./fixtures/careerPriest.json";
import historyPriest from "./fixtures/historyPriest.json";

const progressionBosses = selectSupportedInstanceProgressionBosses(supportedInstances as SupportedInstance[]);

interface CareerRatingsProps {
  career?: CareerPlayerResponse;
  history?: LeaderboardV2PlayerHistory;
  isLoading?: boolean;
  error?: string;
}

/** The two cards as the Armory performance overview arranges them. */
function CareerRatings({ career, history, isLoading = false, error }: CareerRatingsProps) {
  const [selected, setSelected] = useState<string>();
  const cohort =
    career?.cohorts.find((c) => cohortKey(c) === selected) ?? defaultCohort(career?.cohorts ?? []);
  const raids = useMemo(
    () => (cohort ? buildRaidRatings(cohort, history, progressionBosses) : []),
    [cohort, history],
  );
  return (
    <div className="space-y-6">
      <div className="w-full lg:w-[480px]">
        <CareerRatingCard
          data={career}
          cohort={cohort}
          onCohortChange={setSelected}
          isLoading={isLoading}
          error={error}
        />
      </div>
      <RaidRatingsCard
        raids={raids}
        metric={cohort?.summary.chosen_metric ?? "dps"}
        isLoading={isLoading}
        emptyMessage={error ?? (career ? careerStatusText(career.status) : undefined)}
      />
    </div>
  );
}

const meta = {
  title: "pages/Armory/Career Ratings",
  component: CareerRatings,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <TooltipProvider>
          <div className="w-[min(72rem,calc(100vw-3rem))] py-8">
            <Story />
          </div>
        </TooltipProvider>
      </MemoryRouter>
    ),
  ],
  parameters: { layout: "centered" },
} satisfies Meta<typeof CareerRatings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Warrior: Story = {
  args: {
    career: careerWarrior as CareerPlayerResponse,
    history: historyWarrior as LeaderboardV2PlayerHistory,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("15.1")).toBeInTheDocument();
    await expect(canvas.getByText(/Updating/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Show Fury · Fury Prot ratings" }));
    await expect(canvas.getByText("5.3")).toBeInTheDocument();
  },
};

export const MasteryBreakdown: Story = {
  name: "Mastery breakdown tooltip",
  args: {
    career: careerWarrior as CareerPlayerResponse,
    history: historyWarrior as LeaderboardV2PlayerHistory,
  },
  play: async ({ canvas }) => {
    await userEvent.hover(canvas.getByText("15.1"));
    const body = within(document.body);
    await expect((await body.findAllByText("Mastery by raid")).length).toBeGreaterThan(0);
    // Σ weight·mastery over every weighted raid, including the zero ones.
    await expect((await body.findAllByText("Naxxramas")).length).toBeGreaterThan(0);
    await expect((await body.findAllByText("Total")).length).toBeGreaterThan(0);
  },
};

export const JourneyRenown: Story = {
  name: "Journey card: all-spec Renown",
  render: () => (
    <div className="w-full lg:w-[480px]">
      <JourneyStatsCard
        timeInRaid="25h 5m"
        itemsLooted="37"
        renown={<RenownStat cohorts={(careerPriest as CareerPlayerResponse).cohorts} />}
      />
    </div>
  ),
  play: async ({ canvas }) => {
    // Discipline 346 + Holy 61 + Shadow 131.
    await expect(canvas.getByText("538")).toBeInTheDocument();
    await userEvent.hover(canvas.getByText("538"));
    const body = within(document.body);
    await expect((await body.findAllByText("Renown by raid")).length).toBeGreaterThan(0);
  },
};

export const MultiSpecPriest: Story = {
  args: {
    career: careerPriest as CareerPlayerResponse,
    history: historyPriest as LeaderboardV2PlayerHistory,
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Show Holy ratings" }));
    await expect(canvas.getAllByText("HPS").length).toBeGreaterThan(0);
  },
};

const warrior = careerWarrior as CareerPlayerResponse;
const firstCohort = warrior.cohorts[0];

export const WeightsPending: Story = {
  name: "Renown only (weights pending)",
  args: {
    career: {
      ...warrior,
      cohorts: [
        {
          ...firstCohort,
          summary: {
            ...firstCohort.summary,
            mastery: null,
            peak: null,
            performance_status: "weights_pending",
            refresh_pending: false,
          },
        },
      ],
    },
    history: historyWarrior as LeaderboardV2PlayerHistory,
  },
};

export const OneSpecPreparing: Story = {
  name: "One spec still preparing",
  args: {
    career: {
      ...warrior,
      status: "preparing",
      cohorts: [
        { ...firstCohort, summary: { ...firstCohort.summary, refresh_pending: false } },
        {
          ...firstCohort,
          player_spec: "Arms",
          summary: { ...firstCohort.summary, mastery: null, peak: null, chosen_metric: null, performance_status: "preparing", renown: 6 },
        },
      ],
    },
    history: historyWarrior as LeaderboardV2PlayerHistory,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("15.1")).toBeInTheDocument();
    await expect(canvas.queryByText("Ratings are being calculated.")).not.toBeInTheDocument();
  },
};

export const Preparing: Story = {
  args: { career: { ...warrior, status: "preparing", cohorts: [] } },
};

export const NoKills: Story = {
  args: { career: { ...warrior, status: "ready", cohorts: [] } },
};

export const Loading: Story = {
  args: { isLoading: true },
};

export const Failed: Story = {
  args: { error: "Ratings could not be loaded." },
};
