import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { ChevronDown, ExternalLink, Filter, Search, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { StripOrientation } from "@/components/layout/GridLayoutEditor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card/Card";
import { PortalContainerProvider, usePortalContainer } from "@/components/ui/PortalContainerContext";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import { PanelFilterEditor } from "../PanelFilterEditor";
import type { PanelFilter } from "../processors/filters";
import { openPanelPopup, syncPopupAppearance, type PanelPopup } from "../panelPopup";
import type { PanelContext, PanelDefinition } from "../types";
import { usePanelAggregation } from "../usePanelAggregation";
import { STRIPS } from "./strips";
import {
  parseStripOptionTokens,
  stripTitleMode,
  updateStripTitleMode,
  type StripTitleMode,
} from "./stripOptions";
import type { StripDefinition, StripType } from "./types";

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
  const isMobile = useIsMobile();
  const strip = STRIPS[stripType];
  const optionTokens = useMemo(() => parseStripOptionTokens(panelOption), [panelOption]);
  const borderColor = optionValue(optionTokens, "bc:");
  const customTitle = optionValue(optionTokens, "t:");
  const titleMode = stripTitleMode(panelOption);
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

  const setTitleMode = useCallback((mode: StripTitleMode) => {
    onPanelOptionChange?.(updateStripTitleMode(panelOption, mode));
  }, [onPanelOptionChange, panelOption]);

  const dockStrip = useCallback(() => {
    const current = popupRef.current;
    popupRef.current = null;
    setPopup(null);
    if (current && !current.window.closed) current.window.close();
  }, []);

  const popOutEditor = useCallback(() => {
    if (isMobile) return;
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
  }, [inheritedPortalContainer, isMobile, strip.label, stripId]);

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
    panelOption,
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
          if (!isMobile && event.shiftKey && event.button === 0) {
            event.preventDefault();
            popOutEditor();
          }
        }}
      >
        {renderedStrip}
        {!isMobile ? (
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
        ) : null}
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
                  <div className="flex h-full min-h-0 flex-col gap-4">
                    {stripType === "raid_durability" ? (
                      <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-3">
                        <div className="mb-2">
                          <div className="text-sm font-medium">Title</div>
                          <div className="text-xs text-muted-foreground">Choose how the strip title is displayed.</div>
                        </div>
                        <div className="grid grid-cols-3 gap-1 rounded-md bg-background/70 p-1">
                          {(["overlay", "large", "none"] as StripTitleMode[]).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setTitleMode(mode)}
                              disabled={!onPanelOptionChange}
                              className={cn(
                                "rounded px-2 py-1.5 text-xs font-medium capitalize transition-colors",
                                titleMode === mode
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                              )}
                            >
                              {mode}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="min-h-0 flex-1">
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
                    </div>
                  </div>
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

interface StripDropdownPosition {
  left: number;
  top?: number;
  bottom?: number;
  resultsMaxHeight: number;
}

function fuzzyStripMatch(pattern: string, label: string): { match: boolean; score: number } {
  const patternLower = pattern.toLowerCase();
  const labelLower = label.toLowerCase();
  let patternIndex = 0;
  let score = 0;
  let consecutiveBonus = 0;

  for (let index = 0; index < labelLower.length && patternIndex < patternLower.length; index++) {
    if (labelLower[index] === patternLower[patternIndex]) {
      score += 1 + consecutiveBonus;
      consecutiveBonus += 1;
      if (index === 0 || label[index - 1] === " ") score += 2;
      patternIndex += 1;
    } else {
      consecutiveBonus = 0;
    }
  }

  return { match: patternIndex === patternLower.length, score };
}

function StripSelector({ value, onChange }: { value: StripType; onChange: (value: StripType) => void }) {
  const portalContainer = usePortalContainer();
  const portalWindow = portalContainer?.ownerDocument.defaultView;
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownPosition, setDropdownPosition] = useState<StripDropdownPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selected = STRIPS[value];

  const stripOptions = useMemo(() => {
    const options = Object.entries(STRIPS) as Array<[StripType, StripDefinition<unknown>]>;
    const query = searchQuery.trim();
    if (!query) return options;

    return options
      .map(([type, definition]) => ({
        type,
        definition,
        ...fuzzyStripMatch(query, definition.label),
      }))
      .filter((option) => option.match)
      .sort((a, b) => b.score - a.score)
      .map(({ type, definition }) => [type, definition] as [StripType, StripDefinition<unknown>]);
  }, [searchQuery]);

  const updateDropdownPosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect || !portalWindow) return;

    const viewportMargin = 8;
    const dropdownGap = 4;
    const searchHeight = 58;
    const spaceBelow = portalWindow.innerHeight - rect.bottom - viewportMargin - dropdownGap;
    const spaceAbove = rect.top - viewportMargin - dropdownGap;
    const openBelow = spaceBelow >= 240 || spaceBelow >= spaceAbove;
    const availableHeight = Math.max(80, openBelow ? spaceBelow : spaceAbove);
    const left = Math.min(
      Math.max(viewportMargin, rect.left),
      Math.max(viewportMargin, portalWindow.innerWidth - 260 - viewportMargin),
    );

    setDropdownPosition({
      left,
      ...(openBelow
        ? { top: rect.bottom + dropdownGap }
        : { bottom: portalWindow.innerHeight - rect.top + dropdownGap }),
      resultsMaxHeight: Math.max(40, Math.min(350, availableHeight - searchHeight)),
    });
  }, [portalWindow]);

  useEffect(() => {
    const portalDocument = portalContainer?.ownerDocument;
    if (!portalDocument) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setOpen(false);
        setDropdownPosition(null);
        setSearchQuery("");
      }
    };

    portalDocument.addEventListener("mousedown", handleClickOutside);
    return () => portalDocument.removeEventListener("mousedown", handleClickOutside);
  }, [portalContainer]);

  useEffect(() => {
    const portalDocument = portalContainer?.ownerDocument;
    if (!open || !portalDocument || !portalWindow) return;

    portalWindow.addEventListener("resize", updateDropdownPosition);
    portalDocument.addEventListener("scroll", updateDropdownPosition, true);
    return () => {
      portalWindow.removeEventListener("resize", updateDropdownPosition);
      portalDocument.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [open, portalContainer, portalWindow, updateDropdownPosition]);

  useEffect(() => {
    if (open) searchInputRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setDropdownPosition(null);
    setSearchQuery("");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) {
            close();
          } else {
            updateDropdownPosition();
            setOpen(true);
          }
        }}
        className="flex items-center gap-1.5 bg-transparent text-xs font-medium transition-colors hover:text-muted-foreground cursor-pointer"
      >
        {selected.icon}
        {selected.label}
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && dropdownPosition && portalContainer && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] flex w-[260px] flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
          style={{
            left: dropdownPosition.left,
            top: dropdownPosition.top,
            bottom: dropdownPosition.bottom,
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              close();
              triggerRef.current?.focus();
            }
          }}
        >
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search strips..."
                className="w-full rounded border bg-transparent py-1.5 pl-8 pr-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <ScrollArea
            className="styled-scrollbar"
            style={{ maxHeight: dropdownPosition.resultsMaxHeight }}
          >
            <div className="p-1">
              {stripOptions.length > 0 ? stripOptions.map(([type, definition]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    onChange(type);
                    close();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer",
                    type === value && "bg-accent/50",
                  )}
                >
                  <span className="shrink-0 text-muted-foreground">{definition.icon}</span>
                  <span className="truncate">{definition.label}</span>
                </button>
              )) : (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                  No strips found
                </div>
              )}
              <div className="mt-1 border-t px-2 py-2 text-center text-[10px] text-muted-foreground">
                Panels not supported here
              </div>
            </div>
          </ScrollArea>
        </div>,
        portalContainer,
      )}
    </div>
  );
}
