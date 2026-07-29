/**
 * Roles panel - React component for displaying inferred player roles
 * 
 * This panel doesn't have its own processor - it reuses the damage_taken
 * and healing_done processors to infer roles.
 */

import { Users } from "lucide-react";
import type { PanelDefinition } from "../types";
import { RolesContent } from "./RolesContent";
import { damageTakenProcessor } from "../processors";

/**
 * Create a Roles panel definition.
 * 
 * Note: This panel reuses the damage_taken processor just to satisfy the 
 * PanelDefinition interface. The actual role inference happens in RolesContent
 * using both damage_taken and healing_done data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createRolesPanel(): PanelDefinition<any, any> {
  return {
    // Use damage_taken processor as a base (we need SOMETHING for the architecture)
    // but RolesContent will internally fetch both damage_taken and healing_done
    ...damageTakenProcessor,
    id: "roles",
    label: "Roles",
    icon: <Users className="h-4 w-4" />,
    selfManagesAggregation: true,
    syncDataMode: "full",
    
    render: (props) => {
      // RolesContent handles its own data fetching
      return <RolesContent context={props.context} />;
    },
  };
}
