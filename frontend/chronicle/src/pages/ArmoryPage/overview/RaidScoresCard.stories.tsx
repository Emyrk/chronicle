import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";
import { MemoryRouter } from "react-router-dom";
import type { CharacterParse } from "@/api/typesGenerated";
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import type { EncounterSummary, RaidSummary } from "../parseAggregation";
import { RaidScoresCard } from "./RaidScoresCard";
import { ScoreCard } from "./ScoreCard";

function parse(encounterName: string, score: number, metricValue: number): CharacterParse {
  return {
    encounter_name: encounterName,
    instance_name: "Blackwing Lair",
    difficulty_name: "Normal",
    max_players: 40,
    instance_id: `instance-${encounterName.toLowerCase().replaceAll(" ", "-")}`,
    run_id: `run-${encounterName.toLowerCase().replaceAll(" ", "-")}`,
    metric: "dps",
    metric_value: metricValue,
    precise_score: score,
    display_score: score,
    rank: 12,
    sample_size: 240,
    status: "ok",
    killed_at: "2026-10-10T20:00:00Z",
    player_spec: "Fire",
  };
}

function encounter(
  encounterName: string,
  score: number,
  best: number,
  kills: number,
  metricValue: number,
): EncounterSummary {
  return {
    encounterName,
    score,
    scoreInputs: [score + 2.4, score, score - 2.4],
    best,
    kills,
    bestMetricValue: metricValue,
    bestParse: parse(encounterName, best, metricValue),
  };
}

const overallRaid: RaidSummary = {
  instanceName: "Blackwing Lair",
  difficultyName: "Normal",
  maxPlayers: 40,
  score: 81,
  best: 96,
  kills: 19,
  encounters: [
    encounter("Razorgore", 88, 96, 7, 1_340),
    encounter("Vaelastrasz", 76, 84, 6, 1_825),
    encounter("Broodlord Lashlayer", 80, 91, 6, 1_275),
  ],
};

const fireRaid: RaidSummary = {
  ...overallRaid,
  score: 89,
  best: 96,
  kills: 12,
  encounters: [
    encounter("Razorgore", 92, 96, 6, 1_410),
    encounter("Vaelastrasz", 86, 92, 6, 1_940),
  ],
};

const frostRaid: RaidSummary = {
  ...overallRaid,
  score: 68,
  best: 79,
  kills: 7,
  encounters: [
    encounter("Razorgore", 72, 79, 4, 1_105),
    encounter("Broodlord Lashlayer", 64, 70, 3, 980),
  ],
};

function MultiSpecRaidScores() {
  const [spec, setSpec] = useState<string | null>(null);
  const raids = spec === "Fire" ? [fireRaid] : spec === "Frost" ? [frostRaid] : [overallRaid];

  const raid = raids[0];

  return (
    <div className="space-y-6">
      <div className="w-full lg:w-[480px]">
        <ScoreCard
          score={{
            value: raid.score,
            display_value: raid.score,
            num_parses: raid.kills,
            encounter_groups: raid.encounters.length,
          }}
          top3={raid.encounters}
          metric="dps"
          onMetricChange={() => undefined}
          playerClass="Mage"
          specs={["Fire", "Frost"]}
          selectedSpec={spec}
          onSpecChange={setSpec}
          isLoading={false}
        />
      </div>
      <RaidScoresCard
        raids={raids}
        metric="dps"
        performanceHistoryPath="/performance-history"
        bossCounts={new Map([["Blackwing Lair", 8]])}
        playerClass="Mage"
        specs={["Fire", "Frost"]}
        selectedSpec={spec}
        onSpecChange={setSpec}
        isLoading={false}
      />
    </div>
  );
}

const meta = {
  title: "pages/Armory/Performance Scores",
  component: MultiSpecRaidScores,
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
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof MultiSpecRaidScores>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MultipleSpecs: Story = {
  play: async ({ canvas }) => {
    const fireButtons = canvas.getAllByRole("button", { name: "Show Fire performance" });
    await userEvent.click(fireButtons[0]);
    fireButtons.forEach((button) => expect(button).toHaveAttribute("aria-pressed", "true"));
    expect(canvas.getAllByText("89").length).toBeGreaterThan(0);
  },
};
