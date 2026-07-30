import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { ChevronDown, ExternalLink, Filter, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { StripOrientation } from "@/components/layout/GridLayoutEditor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card/Card";
import { PortalContainerProvider, usePortalContainer } from "@/components/ui/PortalContainerContext";
import { cn } from "@/lib/utils";
import { PanelFilterEditor } from "../PanelFilterEditor";
import type { PanelFilter } from "../processors/filters";
import { openPanelPopup, syncPopupAppearance, type PanelPopup } from "../panelPopup";
import type { PanelContext, PanelDefinition } from "../types";
import { usePanelAggregation } from "../usePanelAggregation";
import { STRIPS } from "./strips";
import type { StripDefinition, StripType } from "./types";

function parseOptionTokens(option: string | null | undefined): string[] {
  return option?.split(",").map((token) => token.trim()).filter(Boolean) ?? [];
}

function optionValue(tokens: string[], prefix: string): string | null {
  const token = tokens.find((candidate) => candidate.startsWith(prefix));
  return token ? token.slice(prefix.length) : null;
}

function updateOptionMeta(
  tokens: string[],
  borderColor: string | null,
  customTitle: string | null,
): string | null {
  const next = tokens.filter((token) => !token.startsWith("bc:") && !token.startsWith("t:"));
  if (borderColor) next.push(`bc:${borderColor}`);
  if (customTitle) next.push(`t:${customTitle}`);
  return next.length > 0 ? next.join(",") : null;
}

export interface StripProps {
  stripType: StripType;
  orientation: StripOrientation;
  durationMs: number;
  context: PanelContext;
  stripIndex: number;
  stripId: string;
  onStripTypeChange?: (type: StripType) => void;
  panelOption?: string | null;
  onPanelOptionChange?: (option: string | null) => void;
  seedFilters?: PanelFilter[];
  seedFiltersVersion?: number;
  onFiltersChange?: (filters: PanelFilter[]) => void;
}

export function Strip({
  stripType,
  orientation,
  durationMs,
  context,
  stripIndex,
  stripId,
  onStripTypeChange,
  panelOption,
  onPanelOptionChange,
  seedFilters,
  seedFiltersVersion,
  onFiltersChange,
}: StripProps) {
  const strip = STRIPS[stripType];
  const optionTokens = useMemo(() => parseOptionTokens(panelOption), [panelOption]);
  const borderColor = optionValue(optionTokens, "bc:");
  const customTitle = optionValue(optionTokens, "t:");
  const inheritedPortalContainer = usePortalContainer();
  const [filters, setFiltersState] = useState<PanelFilter[]>(() => seedFilters ?? strip.defaultFilters ?? []);
  const [popup, setPopup] = useState<PanelPopup | null>(null);
  const popupRef = useRef<PanelPopup | null>(null);
  const appliedSeedVersion = useRef(-1);

  useEffect(() => {
    if (seedFiltersVersion == null || seedFiltersVersion === appliedSeedVersion.current) return;
    appliedSeedVersion.current = seedFiltersVersion;
    queueMicrotask(() => setFiltersState(seedFilters ?? strip.defaultFilters ?? []));
  }, [seedFilters, seedFiltersVersion, strip.defaultFilters]);

  const panelContext = useMemo(
    () => filters.length > 0 ? { filters } : null,
    [filters],
  );
  const aggregation = usePanelAggregation({
    panel: strip as unknown as PanelDefinition<unknown>,
    context,
    panelContext,
    panelContextKey: JSON.stringify(filters),
    panelIndex: stripIndex,
  });
  const hasCustomFilters = JSON.stringify(filters) !== JSON.stringify(strip.defaultFilters ?? []);

  const setFilters = useCallback((next: PanelFilter[]) => {
    setFiltersState(next);
    onFiltersChange?.(next);
  }, [onFiltersChange]);

  const setBorderColor = useCallback((color: string | null) => {
    onPanelOptionChange?.(updateOptionMeta(optionTokens, color, customTitle));
  }, [customTitle, onPanelOptionChange, optionTokens]);

  const setCustomTitle = useCallback((title: string | null) => {
    onPanelOptionChange?.(updateOptionMeta(optionTokens, borderColor, title));
  }, [borderColor, onPanelOptionChange, optionTokens]);

  const dockStrip = useCallback(() => {
    const current = popupRef.current;
    popupRef.current = null;
    setPopup(null);
    if (current && !current.window.closed) current.window.close();
  }, []);

  const popOutEditor = useCallback(() => {
    const existing = popupRef.current;
    if (existing && !existing.window.closed) {
      existing.window.focus();
      return;
    }
    const ownerWindow = inheritedPortalContainer?.ownerDocument.defaultView ?? window;
    const next = openPanelPopup(ownerWindow, `${stripId}-editor`, `${strip.label} settings — Chronicle`);
    if (!next) {
      toast.error("The strip editor popup was blocked. Allow popups for Chronicle and try again.");
      return;
    }
    popupRef.current = next;
    setPopup(next);
    next.window.focus();
  }, [inheritedPortalContainer, strip.label, stripId]);

  useEffect(() => {
    if (!popup) return;
    const popupWindow = popup.window;
    const close = () => {
      if (popupRef.current?.window === popupWindow) {
        popupRef.current = null;
        setPopup(null);
      }
    };
    const sync = () => {
      if (!popupWindow.closed) syncPopupAppearance(document, popupWindow.document);
    };
    sync();
    popupWindow.addEventListener("beforeunload", close);
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => {
      popupWindow.removeEventListener("beforeunload", close);
      observer.disconnect();
    };
  }, [popup]);

  useEffect(() => () => {
    const current = popupRef.current;
    popupRef.current = null;
    if (current && !current.window.closed) current.window.close();
  }, []);

  if (!strip.supportedOrientations.includes(orientation)) {
    return <StripMessage>{strip.label} does not support {orientation} strips.</StripMessage>;
  }

  const renderedStrip = aggregation.error ? (
    <StripMessage>{aggregation.error.message}</StripMessage>
  ) : strip.render({
    ...aggregation,
    durationMs,
    perSecond: false,
    checkboxChecked: false,
    context,
    orientation,
    panelContext,
    panelIndex: stripIndex,
    panelId: stripId,
    hasCustomFilters,
  });

  return (
    <PortalContainerProvider container={popup?.container ?? inheritedPortalContainer}>
      <div
        className="group/strip relative h-full min-h-0 overflow-visible rounded-md border border-border/70 bg-card"
        style={borderColor ? { borderColor } : undefined}
        onMouseDown={(event) => {
          if (event.shiftKey && event.button === 0) {
            event.preventDefault();
            popOutEditor();
          }
        }}
      >
        {renderedStrip}
        <div className="pointer-events-none absolute inset-x-3 top-2 z-30 flex items-center justify-between gap-2 opacity-0 transition-opacity group-hover/strip:opacity-100 group-focus-within/strip:opacity-100">
          <div className="pointer-events-auto flex min-w-0 items-center gap-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {customTitle ? <span className="truncate text-xs font-medium">{customTitle}</span> : null}
            {onStripTypeChange ? (
              <span className={customTitle ? "text-muted-foreground" : undefined}>
                <StripSelector value={stripType} onChange={onStripTypeChange} />
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-medium">{strip.icon}{strip.label}</span>
            )}
          </div>
          <div className="pointer-events-auto flex items-center gap-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn("h-6 gap-1 px-2 text-[10px]", hasCustomFilters && "text-emerald-500")}
              onClick={popOutEditor}
              title="Pop out strip to edit filters"
            >
              <Filter className="h-3 w-3" />
              Filters
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[10px]" onClick={popOutEditor}>
              <ExternalLink className="h-3 w-3" />
              Edit
            </Button>
          </div>
        </div>
        {popup ? (
          <>
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-card/90 text-center backdrop-blur-sm">
              <div>
                <p className="text-xs font-medium">Editing {strip.label} in a pop-out window</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => popup.window.focus()}>Focus window</Button>
                  <Button size="sm" onClick={dockStrip}><Undo2 className="mr-1.5 h-3.5 w-3.5" />Dock</Button>
                </div>
              </div>
            </div>
            {ReactDOM.createPortal(
              <div className="grid h-full grid-rows-[120px_1fr] gap-3 bg-background p-3 text-foreground">
                <Card className="relative mb-0 overflow-hidden p-0">{renderedStrip}</Card>
                <Card className="mb-0 min-h-0 overflow-auto p-4 styled-scrollbar">
                  <PanelFilterEditor
                    panelLabel={strip.label}
                    panelIcon={strip.icon}
                    fixedFilters={strip.fixedFilters ?? []}
                    filters={filters}
                    onChange={setFilters}
                    onReset={() => setFilters(strip.defaultFilters ?? [])}
                    onClose={dockStrip}
                    filteringSupported={strip.supportsFiltering === true}
                    borderColor={borderColor}
                    onBorderColorChange={onPanelOptionChange ? setBorderColor : undefined}
                    customTitle={customTitle}
                    onCustomTitleChange={onPanelOptionChange ? setCustomTitle : undefined}
                  />
                </Card>
              </div>,
              popup.container,
            )}
          </>
        ) : null}
      </div>
    </PortalContainerProvider>
  );
}

function StripMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center px-4 text-xs text-muted-foreground">{children}</div>;
}

function StripSelector({ value, onChange }: { value: StripType; onChange: (value: StripType) => void }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selected = STRIPS[value];

  const cancelClose = () => {
    if (closeTimer.current === null) return;
    clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, 250);
  };

  useEffect(() => cancelClose, []);

  return (
    <div className="relative" onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
      <button type="button" onClick={() => setOpen((current) => !current)} className="flex items-center gap-1 text-xs font-medium">
        {selected.icon}{selected.label}<ChevronDown className="h-3 w-3" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Strips</div>
          {(Object.entries(STRIPS) as Array<[StripType, StripDefinition<unknown>]>).map(([type, definition]) => (
            <button key={type} type="button" onClick={() => { onChange(type); setOpen(false); }} className={cn("flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent", type === value && "bg-accent/50")}>
              {definition.icon}{definition.label}
            </button>
          ))}
          <div className="mt-1 border-t px-2 py-2 text-center text-[10px] text-muted-foreground">
            Panels not supported here
          </div>
        </div>
      ) : null}
    </div>
  );
}
