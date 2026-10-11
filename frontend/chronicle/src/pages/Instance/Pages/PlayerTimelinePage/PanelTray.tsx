import { useState } from "react";
import { ChevronDown, ChevronRight, LayoutPanelTop } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChartDataRegistryProvider } from "../../EventsPanels/ChartDataRegistry";
import { EventsPanel, type EventsPanelType } from "../../EventsPanels/EventsPanel";
import type { PanelContext } from "../../EventsPanels/types";

const TRAY_PANEL_IDS = ["tray-1", "tray-2"] as const;
const DEFAULT_TRAY_TYPES: EventsPanelType[] = ["damage_done", "healing_done"];
/** Timing slots past the layout grid's 0–3, so the tray never shares one. */
const TRAY_PANEL_INDEX_BASE = 10;

interface PanelTrayProps {
  context: PanelContext;
  durationMs: number;
}

/** Two regular panels above the timeline, collapsed until the row is expanded. */
export function PanelTray({ context, durationMs }: PanelTrayProps) {
  const [open, setOpen] = useState(false);
  // Panels mount on first open and stay mounted, so collapsing keeps their picks and results.
  const [opened, setOpened] = useState(false);
  const [types, setTypes] = useState<EventsPanelType[]>(DEFAULT_TRAY_TYPES);
  const [options, setOptions] = useState<(string | null)[]>([null, null]);

  const setAt = <T,>(list: T[], index: number, value: T) => list.map((v, i) => (i === index ? value : v));

  return (
    <div className="rounded-lg border border-border bg-card/40">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          setOpened(true);
        }}
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <LayoutPanelTop className="size-3.5" />
        <span className="font-medium text-foreground">Panels</span>
        <span>{open ? "Pick any panel for each slot." : "Expand to use two regular panels with the timeline."}</span>
      </button>
      <div className={cn("grid-cols-1 gap-3 px-3 pb-3 md:grid-cols-2", open ? "grid" : "hidden")}>
        {opened && (
          <ChartDataRegistryProvider>
            {TRAY_PANEL_IDS.map((id, index) => (
              <div key={id} className="h-[34rem] min-h-0">
                <EventsPanel
                  panelType={types[index]}
                  onPanelTypeChange={(next) => setTypes((list) => setAt(list, index, next))}
                  durationMs={durationMs}
                  context={context}
                  panelIndex={TRAY_PANEL_INDEX_BASE + index}
                  panelId={id}
                  panelOption={options[index]}
                  onPanelOptionChange={(next) => setOptions((list) => setAt(list, index, next))}
                />
              </div>
            ))}
          </ChartDataRegistryProvider>
        )}
      </div>
    </div>
  );
}
