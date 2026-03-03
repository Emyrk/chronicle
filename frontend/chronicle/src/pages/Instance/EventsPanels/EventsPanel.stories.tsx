/**
 * Storybook stories for EventsPanel - one story per panel type.
 * Uses fixture data for visual regression testing with Chromatic.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, waitFor, expect } from "storybook/test";
import { MemoryRouter } from "react-router-dom";
import { EventsPanel, PANELS, type EventsPanelType } from "./EventsPanel";
import { MockInstanceEventsProvider } from "./__fixtures__/MockInstanceEventsProvider";
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import { PanelTimingProvider } from "./PanelTimingContext";
import type { PanelContext } from "./types";
import type { Instance } from "../InstancePage";

// Import fixture instance data
import fixtureInstanceRaw from "./__fixtures__/instance.json";

// Cast to Instance type (JSON import is typed as unknown)
const fixtureInstance = fixtureInstanceRaw as unknown as Instance;

// Find a good boss encounter for testing (Jin'do the Hexxer - ~60s fight)
const bossEncounter = fixtureInstance.encounters.find(
  (e) => e.id === "8447484c-60a6-4b5e-8f02-01c78fdf76a8"
);

// Calculate duration from encounter times
function getEncounterDurationMs(encounter: typeof bossEncounter): number {
  if (!encounter?.start_time || !encounter?.end_time) return 60000;
  return new Date(encounter.end_time).getTime() - new Date(encounter.start_time).getTime();
}

const mockContext: PanelContext = {
  instance: fixtureInstance,
  selectedEncounterIds: bossEncounter ? [bossEncounter.id] : [],
  entitySelection: { enemyIds: new Set(), playerIds: new Set() },
  onSelectEncounters: () => {},
  onTogglePlayer: () => {},
  onTogglePlayers: () => {},
};

const durationMs = getEncounterDurationMs(bossEncounter);

const meta: Meta<typeof EventsPanel> = {
  title: "Panels/EventsPanel",
  component: EventsPanel,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <TooltipProvider>
          <MockInstanceEventsProvider>
            <PanelTimingProvider panelCount={1}>
              <div className="w-[600px] h-[560px] p-4 bg-background">
                <Story />
              </div>
            </PanelTimingProvider>
          </MockInstanceEventsProvider>
        </TooltipProvider>
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: "centered",
    // Chromatic settings
    chromatic: {
      // Wait for worker processing to complete
      delay: 3000,
      // Capture at these viewport widths
      viewports: [600],
    },
  },
};

export default meta;
type Story = StoryObj<typeof EventsPanel>;

/**
 * Create a story for a specific panel type.
 * Includes a play function that waits for processing to complete.
 */
function createPanelStory(panelType: EventsPanelType): Story {
  const panel = PANELS[panelType];
  
  return {
    args: {
      panelType,
      durationMs,
      context: mockContext,
      panelIndex: 0,
      onPanelTypeChange: () => {},
    },
    name: panel.label,
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      
      // Wait for "Processing..." to disappear (worker finished)
      await waitFor(
        () => {
          const processing = canvas.queryByText(/Processing/i);
          expect(processing).not.toBeInTheDocument();
        },
        { timeout: 10000 }
      );
      
      // Additional wait for render to stabilize
      await new Promise((resolve) => setTimeout(resolve, 500));
    },
  };
}

// ============================================================================
// Damage Panels
// ============================================================================

export const DamageDone: Story = createPanelStory("damage_done");
export const EnemyDamageDone: Story = createPanelStory("enemy_damage_done");
export const PetDamageDone: Story = createPanelStory("pet_damage_done");
export const FriendlyFire: Story = createPanelStory("damage_done_friendly_fire");
export const DamageTaken: Story = createPanelStory("damage_taken");
export const EnemyDamageTaken: Story = createPanelStory("enemy_damage_taken");

// ============================================================================
// Healing Panels
// ============================================================================

export const HealingDone: Story = createPanelStory("healing_done");
export const HealingTaken: Story = createPanelStory("healing_taken");

// ============================================================================
// Death & Survival Panels
// ============================================================================

export const Deaths: Story = createPanelStory("deaths");
export const DeathLog: Story = createPanelStory("death_log");
export const Mitigation: Story = createPanelStory("mitigation");

// ============================================================================
// Resource & Utility Panels
// ============================================================================

export const ExtraAttacks: Story = createPanelStory("extra_attacks");
export const ResourceRegen: Story = createPanelStory("resource_regen");
export const Roles: Story = createPanelStory("roles");

// ============================================================================
// Class-specific Panels
// ============================================================================

export const Innervate: Story = createPanelStory("innervate");
export const Sunder: Story = createPanelStory("sunder");
export const Judgement: Story = createPanelStory("judgement");

// ============================================================================
// Debug Panels
// ============================================================================

export const AllActivity: Story = createPanelStory("all_activity");
export const Empty: Story = createPanelStory("empty");
