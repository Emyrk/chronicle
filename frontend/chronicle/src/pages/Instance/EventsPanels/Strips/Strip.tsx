import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { StripOrientation } from "@/components/layout/GridLayoutEditor";
import { cn } from "@/lib/utils";
import { PANELS } from "../EventsPanel";
import type { PanelContext, PanelDefinition } from "../types";
import { usePanelAggregation } from "../usePanelAggregation";
import { STRIPS } from "./strips";
import type { StripDefinition, StripType } from "./types";

export interface StripProps {
  stripType: StripType;
  orientation: StripOrientation;
  durationMs: number;
  context: PanelContext;
  stripIndex: number;
  stripId: string;
  editable?: boolean;
  onStripTypeChange?: (type: StripType) => void;
}

export function Strip({
  stripType,
  orientation,
  durationMs,
  context,
  stripIndex,
  stripId,
  editable = false,
  onStripTypeChange,
}: StripProps) {
  const strip = STRIPS[stripType];
  const aggregation = usePanelAggregation({
    panel: strip as unknown as PanelDefinition<unknown>,
    context,
    panelIndex: stripIndex,
  });

  if (!strip.supportedOrientations.includes(orientation)) {
    return (
      <StripMessage>
        {strip.label} does not support {orientation} strips.
      </StripMessage>
    );
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-md border border-border/70 bg-card">
      {editable && onStripTypeChange ? (
        <div className="absolute right-3 top-2 z-20">
          <StripSelector value={stripType} onChange={onStripTypeChange} />
        </div>
      ) : null}
      {aggregation.error ? (
        <StripMessage>{aggregation.error.message}</StripMessage>
      ) : (
        strip.render({
          ...aggregation,
          durationMs,
          perSecond: false,
          checkboxChecked: false,
          context,
          orientation,
          panelIndex: stripIndex,
          panelId: stripId,
        })
      )}
    </div>
  );
}

function StripMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-xs text-muted-foreground">
      {children}
    </div>
  );
}

function StripSelector({
  value,
  onChange,
}: {
  value: StripType;
  onChange: (value: StripType) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = STRIPS[value];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1 rounded border border-border/70 bg-background/90 px-2 py-1 text-[10px] font-medium shadow-sm"
      >
        {selected.icon}
        {selected.label}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Strips</div>
          {(Object.entries(STRIPS) as Array<[StripType, StripDefinition<unknown>]>).map(([type, definition]) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                onChange(type);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent",
                type === value && "bg-accent/50",
              )}
            >
              {definition.icon}
              {definition.label}
            </button>
          ))}
          <div className="mt-1 border-t px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Panels</div>
          {Object.entries(PANELS).filter(([, panel]) => !panel.hidden).map(([panelType, panel]) => (
            <div
              key={panelType}
              className="flex cursor-not-allowed items-center gap-2 px-2 py-1 text-xs text-muted-foreground/45"
              title={`${panel.label} does not support being in strips`}
            >
              {panel.icon}
              <span className="truncate">{panel.label}</span>
              <span className="ml-auto text-[9px]">Panel only</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
