/**
 * Storybook story for the Damage Done Explain page.
 *
 * Opens in deterministic example mode so the entire reference can be
 * inspected without backend services or live event streams.
 */

import { createElement, type ReactNode, useMemo } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DamageDoneExplainView } from "./DamageDoneExplainView";
import { getFixturePanelContext, FIXTURE_DURATION_MS } from "./fixture";
import { InstanceEventsContext, type CachedStream } from "@/hooks/instanceEvents";

// ── Minimal InstanceEventsContext mock ──
// usePanelAggregation calls useInstanceEventsContext unconditionally (React
// hooks rules), but with enabled:false it never fetches. We provide a no-op
// context so the hook doesn't throw.

function MockEventsProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => ({
    instanceId: "example-instance",
    getStream: () => null,
    fetchStream: () => Promise.resolve({} as CachedStream),
    isFetching: () => false,
  }), []);

  return createElement(InstanceEventsContext.Provider, { value }, children);
}

// ── Story meta ──

const meta = {
  title: "Panels/DamageDoneExplain",
  component: DamageDoneExplainView,
  decorators: [
    (Story) => createElement(MockEventsProvider, null, createElement(Story)),
  ],
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof DamageDoneExplainView>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Example mode — fully deterministic, no backend required.
 *
 * Shows the complete Explain page with all 8 lessons, curated fixture
 * data (5 players, parse pills, spell ranks), and the production
 * DamageDoneContent rendering pipeline. Toggle Per Second, click
 * player rows for breakouts, and try Focus mode.
 */
export const ExampleMode: Story = {
  args: {
    panelType: "damage_done",
    context: getFixturePanelContext(),
    durationMs: FIXTURE_DURATION_MS,
    onExit: () => {},
    initialDataMode: "example",
  },
};

/**
 * Starting with no active lesson — shows the lesson list in its default state.
 */
export const ExampleModeDefault: Story = {
  args: {
    panelType: "damage_done",
    context: getFixturePanelContext(),
    durationMs: FIXTURE_DURATION_MS,
    onExit: () => {},
    initialDataMode: "example",
  },
};

/**
 * Enemy damage variant — same explain page, different panel processor.
 */
export const EnemyDamageExplain: Story = {
  args: {
    panelType: "enemy_damage_done",
    context: getFixturePanelContext(),
    durationMs: FIXTURE_DURATION_MS,
    onExit: () => {},
    initialDataMode: "example",
  },
};
