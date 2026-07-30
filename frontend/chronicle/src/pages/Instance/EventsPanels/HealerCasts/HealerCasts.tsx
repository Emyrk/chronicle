import { HeartPulse } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { HealerCastsContent } from "./HealerCastsContent";
import {
  healerCastsProcessor,
  type HealerCastEvent,
  type HealerCastsResult,
} from "./healerCasts.processor";

export function createHealerCastsPanel(): PanelDefinition<HealerCastsResult, HealerCastEvent> {
  return {
    ...healerCastsProcessor,
    label: "Healer Casts",
    icon: <HeartPulse className="h-4 w-4" />,
    syncDataMode: "full",
    underConstruction: true,
    render: (props: PanelRenderProps<HealerCastsResult>) => <HealerCastsContent {...props} />,
  };
}
