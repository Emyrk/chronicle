import { Hash } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { SpellCountContent } from "./SpellCountContent";
import {
  spellCountProcessor,
  type SpellCountEvent,
  type SpellCountResult,
} from "./spellCount.processor";

const SPELL_COUNT_STREAMS = ["spell_go", "spell_fail"];

export function createSpellCountPanel(): PanelDefinition<SpellCountResult, SpellCountEvent> {
  return {
    ...spellCountProcessor,
    label: "Spell Casts",
    icon: <Hash className="h-4 w-4" />,
    supportsFiltering: true,
    fixedFilters: [
      { type: "source_type", value: ["player"], applyTo: SPELL_COUNT_STREAMS },
    ],
    defaultFilters: [
      { type: "time_range", value: "controller", applyTo: SPELL_COUNT_STREAMS },
    ],
    render: (props: PanelRenderProps<SpellCountResult>) => <SpellCountContent {...props} />,
  };
}
