import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import { MockInstanceEventsProvider } from "../EventsPanels/__fixtures__/MockInstanceEventsProvider";
import {
  FIXTURE_DURATION_MS,
  getFixturePanelContext,
} from "../EventsPanels/DamageDone/explain/fixture";
import {
  FIXTURE_DURATION_MS as LEADERBOARD_FIXTURE_DURATION_MS,
  getFixturePanelContext as getLeaderboardFixturePanelContext,
} from "../EventsPanels/LeaderboardPanel/explain/fixture";
import {
  FIXTURE_DURATION_MS as CONSUMABLES_FIXTURE_DURATION_MS,
  getFixturePanelContext as getConsumablesFixturePanelContext,
} from "../EventsPanels/Consumables/explain/fixture";
import { PanelExplainerView } from "./PanelExplainerView";

const meta: Meta<typeof PanelExplainerView> = {
  title: "Instance/PanelExplainer",
  component: PanelExplainerView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, context) => (
      <MemoryRouter
        initialEntries={(context.parameters.routerEntries as string[]) ?? ["/"]}
      >
        <TooltipProvider>
          <MockInstanceEventsProvider>
            <Story />
          </MockInstanceEventsProvider>
        </TooltipProvider>
      </MemoryRouter>
    ),
  ],
  args: {
    panelType: "damage_done",
    context: getFixturePanelContext(),
    durationMs: FIXTURE_DURATION_MS,
    onExit: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof PanelExplainerView>;

/**
 * The full lesson shell in example mode — fixture data, no API calls.
 * (Live mode in Storybook would try to fetch event streams.)
 */
export const ExampleMode: Story = {
  args: { initialMode: "example" },
};

/**
 * The lesson shell in live mode: the aggregation has no streams to fetch in
 * Storybook, so the live panel shows its loading/empty state — the sidebar
 * still derives capability states (mostly example-required).
 */
export const LiveModeEmpty: Story = {};

/** Fallback summary/tips shell for a panel without a lesson set. */
export const FallbackPanel: Story = {
  args: { panelType: "damage_taken" },
};

/** Healing Done lesson shell (live mode, no data in stories). */
export const HealingDoneLessons: Story = {
  args: { panelType: "healing_done" },
};

/** Deep-linked healing lessons for probe verification. */
export const HealingChartLesson: Story = {
  args: { panelType: "healing_done" },
  parameters: { routerEntries: ["/?lesson=read-chart"] },
};

export const HealingModesLesson: Story = {
  args: { panelType: "healing_done" },
  parameters: { routerEntries: ["/?lesson=healing-modes"] },
};

export const HealerBreakoutLesson: Story = {
  args: { panelType: "healing_done" },
  parameters: { routerEntries: ["/?lesson=breakout-tour"] },
};

export const TotalVsHpsLesson: Story = {
  args: { panelType: "healing_done" },
  parameters: { routerEntries: ["/?lesson=total-vs-dps"] },
};

export const HealingRanksLesson: Story = {
  args: { panelType: "healing_done" },
  parameters: { routerEntries: ["/?lesson=spell-ranks"] },
};

export const CompareHealersLesson: Story = {
  args: { panelType: "healing_done" },
  parameters: { routerEntries: ["/?lesson=compare-abilities"] },
};

export const HealingFiltersLesson: Story = {
  args: { panelType: "healing_done" },
  parameters: { routerEntries: ["/?lesson=filters"] },
};

export const TimelineReadLesson: Story = {
  args: { panelType: "timeline" },
  parameters: { routerEntries: ["/?lesson=read-chart"] },
};

export const TimelineRangeLesson: Story = {
  args: { panelType: "timeline" },
  parameters: { routerEntries: ["/?lesson=time-range"] },
};

export const TimelineLegendLesson: Story = {
  args: { panelType: "timeline" },
  parameters: { routerEntries: ["/?lesson=legend"] },
};

export const TimelineAggregationsLesson: Story = {
  args: { panelType: "timeline" },
  parameters: { routerEntries: ["/?lesson=aggregations"] },
};

export const TimelineEditSeriesLesson: Story = {
  args: { panelType: "timeline" },
  parameters: { routerEntries: ["/?lesson=edit-series"] },
};

export const TimelineDurabilityLesson: Story = {
  args: { panelType: "timeline" },
  parameters: { routerEntries: ["/?lesson=durability"] },
};

export const DeathLogReadLesson: Story = {
  args: { panelType: "death_log" },
  parameters: { routerEntries: ["/?lesson=read-log"] },
};

export const DeathLogRecapLesson: Story = {
  args: { panelType: "death_log" },
  parameters: { routerEntries: ["/?lesson=death-recap"] },
};

export const DeathLogFloatingLesson: Story = {
  args: { panelType: "death_log" },
  parameters: { routerEntries: ["/?lesson=floating-recap"] },
};

export const DeathLogHealthBarLesson: Story = {
  args: { panelType: "death_log" },
  parameters: { routerEntries: ["/?lesson=health-bar"] },
};

export const AllActivityStreamsLesson: Story = {
  args: { panelType: "all_activity" },
  parameters: { routerEntries: ["/?lesson=streams"] },
};

export const AllActivityQuickFiltersLesson: Story = {
  args: { panelType: "all_activity" },
  parameters: { routerEntries: ["/?lesson=quick-filters"] },
};

export const AllActivityTimeFormatsLesson: Story = {
  args: { panelType: "all_activity" },
  parameters: { routerEntries: ["/?lesson=time-formats"] },
};

export const AllActivityFiltersLesson: Story = {
  args: { panelType: "all_activity" },
  parameters: { routerEntries: ["/?lesson=filters"] },
};

export const EquipmentGearLesson: Story = {
  args: { panelType: "equipment" },
  parameters: { routerEntries: ["/?lesson=understand-gear"] },
};

export const EquipmentTalentsLesson: Story = {
  args: { panelType: "equipment" },
  parameters: { routerEntries: ["/?lesson=read-talents"] },
};

export const EquipmentCompareLesson: Story = {
  args: { panelType: "equipment" },
  parameters: { routerEntries: ["/?lesson=compare-players"] },
};

export const VulnerabilityEstimateLesson: Story = {
  args: { panelType: "vulnerability_effect" },
  parameters: { routerEntries: ["/?lesson=estimate"] },
};

export const ComparisonPanelsLesson: Story = {
  args: { panelType: "comparison", initialMode: "example" },
  parameters: { routerEntries: ["/?lesson=compare-panels"] },
};

export const ComparisonHuntersLesson: Story = {
  args: { panelType: "comparison", initialMode: "example" },
  parameters: { routerEntries: ["/?lesson=compare-hunters"] },
};

export const FocusPlayerLesson: Story = {
  parameters: { routerEntries: ["/?lesson=focus-player"] },
};

export const HealingFocusPlayerLesson: Story = {
  args: { panelType: "healing_done" },
  parameters: { routerEntries: ["/?lesson=focus-player"] },
};

/** Deep-linked video lesson — exercises the lazy Remotion player. */
export const PinBreakoutLesson: Story = {
  parameters: { routerEntries: ["/?lesson=pin-breakout"] },
};

/** Deep-linked breakout tour — the full tabbed AbilityBreakout in a video. */
export const BreakoutTourLesson: Story = {
  parameters: { routerEntries: ["/?lesson=breakout-tour"] },
};

/** Deep-linked spell-ranks lesson — the Ranks toggle splitting a breakout. */
export const SpellRanksLesson: Story = {
  parameters: { routerEntries: ["/?lesson=spell-ranks"] },
};

/** Deep-linked filters lesson — menu, editor, and the filtered chart. */
export const FiltersLesson: Story = {
  parameters: { routerEntries: ["/?lesson=filters"] },
};

/** Deep-linked compare lesson — shared hover/selection across two breakouts. */
export const CompareAbilitiesLesson: Story = {
  parameters: { routerEntries: ["/?lesson=compare-abilities"] },
};

export const LeaderboardExampleMode: Story = {
  args: {
    panelType: "leaderboard",
    context: getLeaderboardFixturePanelContext(),
    durationMs: LEADERBOARD_FIXTURE_DURATION_MS,
    initialMode: "example",
  },
};

export const LeaderboardReadProofLesson: Story = {
  args: {
    panelType: "leaderboard",
    context: getLeaderboardFixturePanelContext(),
    durationMs: LEADERBOARD_FIXTURE_DURATION_MS,
    initialMode: "example",
  },
  parameters: { routerEntries: ["/?lesson=read-proof"] },
};

export const LeaderboardEligibilityChecksLesson: Story = {
  args: {
    panelType: "leaderboard",
    context: getLeaderboardFixturePanelContext(),
    durationMs: LEADERBOARD_FIXTURE_DURATION_MS,
    initialMode: "example",
  },
  parameters: { routerEntries: ["/?lesson=eligibility-checks"] },
};

export const LeaderboardFindBlockersLesson: Story = {
  args: {
    panelType: "leaderboard",
    context: getLeaderboardFixturePanelContext(),
    durationMs: LEADERBOARD_FIXTURE_DURATION_MS,
    initialMode: "example",
  },
  parameters: { routerEntries: ["/?lesson=find-blockers"] },
};

const consumablesArgs = {
  panelType: "consumables_ledger" as const,
  context: getConsumablesFixturePanelContext(),
  durationMs: CONSUMABLES_FIXTURE_DURATION_MS,
  initialMode: "example" as const,
};

export const ConsumablesExampleMode: Story = {
  args: consumablesArgs,
};

export const ConsumablesReadPlayerLesson: Story = {
  args: consumablesArgs,
  parameters: { routerEntries: ["/?lesson=read-consumables"] },
};

export const ConsumablesViewAllLesson: Story = {
  args: consumablesArgs,
  parameters: { routerEntries: ["/?lesson=view-all-consumables"] },
};

export const ConsumablesRaidWideLesson: Story = {
  args: consumablesArgs,
  parameters: { routerEntries: ["/?lesson=raid-wide-consumables"] },
};

export const ConsumablesInspectItemLesson: Story = {
  args: consumablesArgs,
  parameters: { routerEntries: ["/?lesson=inspect-consumable"] },
};

export const ConsumablesUnresolvedLesson: Story = {
  args: consumablesArgs,
  parameters: { routerEntries: ["/?lesson=unresolved-consumables"] },
};
