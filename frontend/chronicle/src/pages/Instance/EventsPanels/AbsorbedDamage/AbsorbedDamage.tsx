/**
 * Absorbed Damage panel - React component wrapper for absorbed damage aggregation.
 */

import { Shield } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { absorbedDamageProcessor, type AbsorbedDamageResult } from "./absorbedDamage.processor";
import { AbsorbedDamageContent } from "./AbsorbedDamageContent";
import { ENTITY_GROUPING_OPTIONS, PET_MODE_OPTIONS } from "../processors/resolveEntity";

/**
 * Create the Absorbed Damage panel definition.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAbsorbedDamagePanel(): PanelDefinition<AbsorbedDamageResult, any> {
  return {
    ...absorbedDamageProcessor,
    label: "Absorbed Damage",
    icon: <Shield className="h-4 w-4" />,
    supportsPerSecond: true,
    supportsFiltering: true,
    groupingOptions: ENTITY_GROUPING_OPTIONS,
    petOptions: PET_MODE_OPTIONS,
    defaultFilters: [
      { type: "time_range" as const, value: "controller" },
      { type: "target_type" as const, value: ["player"], applyTo: ["damage"] },
    ],

    render: (props: PanelRenderProps<AbsorbedDamageResult>) => {
      return <AbsorbedDamageContent {...props} />;
    },
  };
}
