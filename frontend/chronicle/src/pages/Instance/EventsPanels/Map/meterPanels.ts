import { createActivityLogPanel } from "../ActivityLog/ActivityLog";
import { createDamageDonePanel } from "../DamageDone/DamageDone";
import { createDamageTakenPanel } from "../DamageTaken/DamageTaken";
import { createDeathsPanel } from "../Deaths/Deaths";
import { createDispelsDonePanel } from "../Dispel/Dispel";
import { createHealingDonePanel } from "../HealingDone/HealingDone";
import { createHealingTakenPanel } from "../HealingTaken/HealingTaken";
import { createInterruptsPanel } from "../Interrupt/Interrupt";
import type { PanelDefinition } from "../types";

/**
 * Panels a map meter window can show: the bar-chart (PlayerMetricChart)
 * panels and the Activity Log, built from their own factories so a window
 * runs the same processor and filters as the panel's card.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- meters hold panels of every result type
type AnyPanel = PanelDefinition<any, any>;

interface MeterPanel {
  label: string;
  panel: AnyPanel;
  /** Log capabilities the meter needs beyond the panel's own requiredCapabilities. */
  requires?: readonly string[];
}

function meter(label: string, panel: AnyPanel, requires?: readonly string[]): MeterPanel {
  return { label, panel, requires };
}

export const METER_PANELS = {
  damage_done: meter("Damage Done", createDamageDonePanel("players")),
  healing_done: meter("Healing Done", createHealingDonePanel("players")),
  damage_taken: meter("Damage Taken", createDamageTakenPanel("players")),
  healing_taken: meter("Healing Taken", createHealingTakenPanel("players")),
  enemy_damage_done: meter("Enemy Damage Done", createDamageDonePanel("enemies")),
  deaths: meter("Deaths", createDeathsPanel()),
  dispels_done: meter("Dispels", createDispelsDonePanel()),
  interrupts: meter("Interrupts", createInterruptsPanel(), ["interrupt"]),
  activity_log: meter("Activity Log", createActivityLogPanel()),
};

export type MeterPanelKey = keyof typeof METER_PANELS;

export function isMeterPanelKey(value: unknown): value is MeterPanelKey {
  return typeof value === "string" && value in METER_PANELS;
}

/** Whether the log supports the meter (its panel's and its own capability needs). */
export function meterAvailable(meter: MeterPanel, capabilities: readonly string[]): boolean {
  return [...(meter.panel.requiredCapabilities ?? []), ...(meter.requires ?? [])].every((capability) => capabilities.includes(capability));
}
