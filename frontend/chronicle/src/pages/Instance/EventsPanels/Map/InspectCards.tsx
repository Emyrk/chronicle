import { X } from "lucide-react";
import { createUnitAurasPanel } from "../UnitAuras/UnitAuras";
import type { PanelContext } from "../types";
import { useEmbeddedPanel, type EmbeddedPanelRender } from "../useEmbeddedPanel";

const UNIT_AURAS_PANEL = createUnitAurasPanel();

interface InspectCardsProps {
  guids: readonly string[];
  onRemove: (guid: string) => void;
  /** The map's Raid Frames render (shared with its grid): health, power and casts. */
  raidFrames: EmbeddedPanelRender;
  context: PanelContext;
  durationMs: number;
}

/**
 * A card per inspected unit: the Raid Frames panel's inspect frame (health,
 * power, cast) over the Unit Auras panel's icons, each drawn for `u:<guid>`
 * from one run of its panel.
 */
export function InspectCards({ guids, onRemove, raidFrames, context, durationMs }: InspectCardsProps) {
  const auras = useEmbeddedPanel({ panel: UNIT_AURAS_PANEL, context, durationMs, enabled: guids.length > 0 });
  if (guids.length === 0) return null;
  return (
    <div aria-label="Inspected units" className="styled-scrollbar flex min-h-0 flex-col gap-1 overflow-y-auto">
      {guids.map((guid) => (
        <div key={guid} className="pointer-events-auto relative flex w-44 shrink-0 flex-col gap-1 rounded-sm border border-black/80 bg-black/75 p-1.5 text-white shadow-[0_4px_16px_rgba(0,0,0,.5)]">
          <button
            type="button"
            onClick={() => onRemove(guid)}
            title="Stop inspecting"
            aria-label="Stop inspecting"
            className="absolute right-0.5 top-0.5 rounded p-0.5 text-white/50 hover:text-red-300"
          >
            <X className="h-3 w-3" />
          </button>
          {raidFrames(`u:${guid}`)}
          {auras(`u:${guid}`)}
        </div>
      ))}
    </div>
  );
}
