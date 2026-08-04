import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { MockInstanceEventsProvider } from "../EventsPanels/__fixtures__/MockInstanceEventsProvider";
import {
  FIXTURE_DURATION_MS,
  getFixturePanelContext,
} from "../EventsPanels/DamageDone/explain/fixture";
import { PanelExplainerView } from "./PanelExplainerView";

const meta: Meta<typeof PanelExplainerView> = {
  title: "Instance/PanelExplainer",
  component: PanelExplainerView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, context) => (
      <MemoryRouter initialEntries={(context.parameters.routerEntries as string[]) ?? ["/"]}>
        <MockInstanceEventsProvider>
          <Story />
        </MockInstanceEventsProvider>
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
