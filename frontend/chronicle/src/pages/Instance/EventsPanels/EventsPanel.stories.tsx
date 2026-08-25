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
import type { PanelContext, PanelRenderProps } from "./types";
import type { SunderResult } from "./Sunder/sunder.processor";
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
  selectedPhaseIds: [],
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
async function waitForPanelRender(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);

  await waitFor(
    () => {
      const processing = canvas.queryByText(/Processing/i);
      expect(processing).not.toBeInTheDocument();
    },
    { timeout: 10000 },
  );

  await new Promise((resolve) => setTimeout(resolve, 500));
}

function createPanelStory(panelType: EventsPanelType, context: PanelContext = mockContext): Story {
  const panel = PANELS[panelType];
  
  return {
    args: {
      panelType,
      durationMs,
      context,
      panelIndex: 0,
      onPanelTypeChange: () => {},
    },
    name: panel.label,
    play: async ({ canvasElement }) => {
      await waitForPanelRender(canvasElement);
    },
  };
}

const vehicleControllerGuids = Object.keys(fixtureInstance.players ?? {});
const vehicleRangeStart = bossEncounter ? new Date(bossEncounter.start_time).getTime() : Date.now();
const vehicleStoryContext: PanelContext = {
  ...mockContext,
  instance: {
    ...fixtureInstance,
    vehicleControlIntervals: {
      intervals: [
        {
          session_id: "rfc-vehicle-demo",
          vehicle_guid: "0xF15000812400008F",
          controller_guid: vehicleControllerGuids[0] ?? "0x000000000000000B",
          vehicle_name: "Salvaged Siege Engine",
          controller_name: fixtureInstance.players?.[vehicleControllerGuids[0]]?.name ?? "Chroniclee",
          assigned_at_ms: vehicleRangeStart - 3_000,
          released_at_ms: vehicleRangeStart + 24_000,
          assigned_ordinal: 8,
          release_reason: "explicit",
        },
        {
          session_id: "rfc-vehicle-demo",
          vehicle_guid: "0xF15000812B000090",
          controller_guid: vehicleControllerGuids[1] ?? vehicleControllerGuids[0] ?? "0x000000000000000C",
          vehicle_name: "Salvaged Siege Turret",
          controller_name: fixtureInstance.players?.[vehicleControllerGuids[1]]?.name ?? "Chroniclea",
          assigned_at_ms: vehicleRangeStart + 11_000,
          assigned_ordinal: 12,
        },
      ],
      diagnostics: [
        {
          kind: "stale_release",
          session_id: "rfc-vehicle-demo",
          timestamp_ms: vehicleRangeStart + 18_000,
          ordinal: 14,
          vehicle_guid: "0xF15000812B000090",
          controller_guid: vehicleControllerGuids[0] ?? "0x000000000000000B",
          vehicle_name: "Salvaged Siege Turret",
          controller_name: fixtureInstance.players?.[vehicleControllerGuids[0]]?.name ?? "Chroniclee",
          active_controller_guid: vehicleControllerGuids[1] ?? vehicleControllerGuids[0],
        },
      ],
    },
  },
};

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
export const Vehicles: Story = createPanelStory("vehicle", vehicleStoryContext);

// ============================================================================
// Class-specific Panels
// ============================================================================

export const Innervate: Story = createPanelStory("innervate");
const sunderDebugEvents = Array.from({ length: 15 }, (_, index) => ({
  offsetMs: 1200 + index * 750,
  type: index < 5 ? "landed" as const : "refreshed" as const,
  casterName: `Warrior ${index + 1}`,
  stackCount: Math.min(index + 1, 5),
}));

const sunderResult: SunderResult = {
  warriors: {
    warrior: {
      guid: "warrior",
      name: "Warrior 1",
      effectiveSunders: 5,
      refreshSunders: 10,
      failedSunders: 0,
      contributionsToFirst5: { incendius: 5 },
    },
  },
  targets: {
    incendius: {
      guid: "incendius",
      name: "Incendius",
      encounterId: bossEncounter?.id ?? "encounter",
      timeToFiveStacksMs: 4913,
      first5Contributors: [],
      totalSunders: 15,
      debugEvents: sunderDebugEvents,
    },
  },
  confirmedSunders: [],
  _encounterStarts: {},
  _targetStacks: {},
  _auraState: { encounters: {} },
};

const sunderRenderProps: PanelRenderProps<SunderResult> = {
  result: sunderResult,
  totalEvents: 15,
  processingTimeMs: 15,
  durationMs,
  perSecond: true,
  checkboxChecked: true,
  loading: false,
  processing: false,
  error: null,
  context: mockContext,
  panelOption: "cb,target:incendius",
};

export const Sunder: Story = {
  args: {
    panelType: "sunder",
    durationMs,
    context: mockContext,
    panelIndex: 0,
    onPanelTypeChange: () => {},
  },
  render: () => (
    <div className="h-full min-h-0">
      {PANELS.sunder.render(sunderRenderProps)}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const scrollArea = canvasElement.querySelector<HTMLElement>("[data-sunder-debug-scroll]");
    expect(scrollArea).not.toBeNull();
    const viewport = scrollArea!.querySelector<HTMLElement>("[data-slot='scroll-area-viewport']");
    expect(viewport).not.toBeNull();

    viewport!.scrollTop = viewport!.scrollHeight;
    viewport!.dispatchEvent(new Event("scroll", { bubbles: true }));

    await waitFor(() => {
      const rows = canvasElement.querySelectorAll<HTMLElement>("[data-sunder-debug-row]");
      const lastRow = rows.item(rows.length - 1);
      const footer = canvasElement.querySelector<HTMLElement>("[data-panel-performance-footer]");
      expect(rows).toHaveLength(15);
      expect(lastRow).not.toBeNull();
      expect(footer).not.toBeNull();
      expect(lastRow!.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        footer!.getBoundingClientRect().top,
      );
    });
  },
};
export const Judgement: Story = createPanelStory("judgement");

// ============================================================================
// Debug Panels
// ============================================================================

export const AllActivity: Story = createPanelStory("all_activity");
export const Empty: Story = createPanelStory("empty");
