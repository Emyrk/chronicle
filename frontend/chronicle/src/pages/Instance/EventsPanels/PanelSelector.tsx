/**
 * PanelSelector - Dropdown with submenus and fuzzy search for panel selection
 */

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { Blocks, ChevronDown, ChevronRight, Compass, Search, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePortalContainer } from "@/components/ui/PortalContainerContext";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { PANELS, type EventsPanelType } from "./EventsPanel";
import { fuzzyMatch, getAllCategoryItems, getCategoryIcon, getCategoryItemCount, getPanelOption, PANEL_CATEGORIES, rememberRecentPanel, type PanelCategory, type PanelOption } from "./panelCategories";

import { listSelectableCustomPanels, resolveCustomPanel, useCustomPanelRegistry } from "./custom/pluginRegistry";
import { isCustomPanelRef } from "./custom/pluginTypes";
import { isLuaPanelRef, parseLuaPanelRef, publicLuaPanelOptions, trackedLuaPanelOptions, useLuaPanelCatalog, usePublicLuaPanels } from "./LuaPanel/luaPanelRegistry";
import { ModuleIcon } from "../../LuaProjects/ModuleIcon";
import { PanelExplorer } from "./PanelExplorer";

/** Props for the recursive CategoryNode component */
interface CategoryNodeProps {
  category: PanelCategory;
  path: string;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  selectedValue: EventsPanelType;
  onSelect: (value: EventsPanelType) => void;
  isPanelVisible: (key: EventsPanelType) => boolean;
}

/** Recursive component for rendering category tree with nested subcategories */
function CategoryNode({
  category,
  path,
  expandedPaths,
  onToggle,
  selectedValue,
  onSelect,
  isPanelVisible,
}: CategoryNodeProps) {
  const isExpanded = expandedPaths.has(path);
  const hasChildren = (category.items && category.items.length > 0) || 
                      (category.subcategories && category.subcategories.length > 0);

  return (
    <div>
      {/* Category header */}
      <button
        type="button"
        onClick={() => onToggle(path)}
        className="w-full text-left px-2 py-1.5 text-sm font-medium rounded-sm flex items-center gap-1.5 hover:bg-accent/50 cursor-pointer"
      >
        <ChevronRight
          className={cn(
            "size-4 transition-transform",
            isExpanded && "rotate-90"
          )}
        />
        <span className="text-muted-foreground">{getCategoryIcon(category)}</span>
        {category.label}
        <span className="text-xs text-muted-foreground ml-auto">
          {getCategoryItemCount(category)}
        </span>
      </button>

      {/* Expanded content: subcategories first, then items */}
      {isExpanded && hasChildren && (
        <div className="ml-2 border-l pl-1">
          {/* Render subcategories */}
          {category.subcategories?.map((sub) => (
            <CategoryNode
              key={sub.label}
              category={sub}
              path={`${path}/${sub.label}`}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              selectedValue={selectedValue}
              onSelect={onSelect}
              isPanelVisible={isPanelVisible}
            />
          ))}
          
          {/* Render direct items */}
          {category.items?.filter(isPanelVisible).map((panelKey) => {
            const item = getPanelOption(panelKey);
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => onSelect(item.value)}
                className={cn(
                  "w-full text-left pl-6 pr-2 py-1.5 text-sm rounded-sm flex items-center gap-2",
                  "hover:bg-accent hover:text-accent-foreground cursor-pointer",
                  item.value === selectedValue && "bg-accent/50"
                )}
              >
                <span className="text-muted-foreground shrink-0">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface DropdownPosition {
  left: number;
  top?: number;
  bottom?: number;
  resultsMaxHeight: number;
}

export interface PanelSelectorProps {
  value: EventsPanelType;
  onChange: (value: EventsPanelType) => void;
  className?: string;
  excludedValues?: ReadonlySet<EventsPanelType>;
}

export function PanelSelector({ value, onChange, className, excludedValues }: PanelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const customRegistry = useCustomPanelRegistry(isOpen || isCustomPanelRef(value));
  const customPanels = useMemo(() => listSelectableCustomPanels(customRegistry), [customRegistry]);
  const [explorerHost, setExplorerHost] = useState<HTMLElement | "floating" | null>(null);
  const luaCatalog = useLuaPanelCatalog(isOpen || explorerHost !== null || isLuaPanelRef(value));
  const luaPanels = useMemo(() => trackedLuaPanelOptions(luaCatalog.data ?? []), [luaCatalog.data]);
  const selectedLua = parseLuaPanelRef(value);
  const trackedSelection = luaPanels.find((candidate) => candidate.ref === value);
  // A saved or shared layout can name a module you don't track; name it from the public list.
  const publicModules = usePublicLuaPanels(!!selectedLua && !trackedSelection && luaCatalog.isFetched);
  const selectedCustom = isCustomPanelRef(value) ? resolveCustomPanel(value, customRegistry) : null;
  const selectedOption = selectedCustom
    ? { value, label: selectedCustom.panel?.name ?? selectedCustom.panelId ?? "Unavailable developer panel", icon: <Wrench className="h-4 w-4" /> }
    : selectedLua ? (() => {
      const item = trackedSelection ?? publicLuaPanelOptions(publicModules.data ?? []).find((candidate) => candidate.ref === value);
      return { value, label: item?.label ?? `Module (${selectedLua.channel})`, icon: <ModuleIcon name={item?.icon} className="h-4 w-4" /> };
    })()
    : getPanelOption(value);
  const [searchParams] = useSearchParams();
  const portalContainer = usePortalContainer();
  const portalWindow = portalContainer?.ownerDocument.defaultView;
  const isDebug = searchParams.get("debug") === "true";
  const isPanelVisible = useCallback(
    (key: EventsPanelType) => !excludedValues?.has(key) && (!PANELS[key].hidden || isDebug),
    [excludedValues, isDebug],
  );
  const [searchQuery, setSearchQuery] = useState("");
  // Track expanded categories by their path (e.g., "Class" or "Class/Druid")
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Toggle a category's expanded state (accordion behavior - only one branch at a time)
  const toggleExpanded = (path: string) => {
    setExpandedPaths(prev => {
      if (prev.has(path)) {
        // Collapsing: remove this path and any children
        const next = new Set<string>();
        for (const p of prev) {
          if (!p.startsWith(path)) {
            next.add(p);
          }
        }
        return next;
      } else {
        // Expanding: keep only ancestor paths, add this one
        const next = new Set<string>();
        for (const p of prev) {
          // Keep if this new path is a child of existing (e.g., expanding "Class/Druid" keeps "Class")
          if (path.startsWith(p + "/") || path === p) {
            next.add(p);
          }
        }
        next.add(path);
        return next;
      }
    });
  };

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

  // Close on outside click. The dropdown is portaled, so check both roots.
  useEffect(() => {
    const portalDocument = portalContainer?.ownerDocument;
    if (!portalDocument) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setIsOpen(false);
        setDropdownPosition(null);
        setSearchQuery("");
        setExpandedPaths(new Set());
      }
    }
    portalDocument.addEventListener("mousedown", handleClickOutside);
    return () => portalDocument.removeEventListener("mousedown", handleClickOutside);
  }, [portalContainer]);

  // Keep the portaled dropdown anchored while its panel or viewport moves.
  useEffect(() => {
    const portalDocument = portalContainer?.ownerDocument;
    if (!isOpen || !portalDocument || !portalWindow) return;

    portalWindow.addEventListener("resize", updateDropdownPosition);
    portalDocument.addEventListener("scroll", updateDropdownPosition, true);
    return () => {
      portalWindow.removeEventListener("resize", updateDropdownPosition);
      portalDocument.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [isOpen, portalContainer, portalWindow, updateDropdownPosition]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Filter panels based on search (searches all nested items)
  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) return null;

    const results: { option: PanelOption; category: string; score: number }[] = [];

    for (const category of PANEL_CATEGORIES) {
      const allItems = getAllCategoryItems(category);
      for (const { panelKey, categoryPath } of allItems) {
        if (!isPanelVisible(panelKey)) continue;
        const option = getPanelOption(panelKey);
        const { match, score } = fuzzyMatch(searchQuery, option.label);
        if (match) {
          results.push({ option, category: categoryPath, score });
        }
      }
    }

    for (const item of customPanels) {
      const haystack = `${item.panel.name} ${item.panel.description ?? ""} ${item.installation.manifest.plugin.name} ${item.installation.repository}`;
      const { match, score } = fuzzyMatch(searchQuery, haystack);
      if (match) results.push({
        option: { value: item.ref, label: item.panel.name, icon: <Wrench className="h-4 w-4" /> },
        category: `Developer › ${item.installation.manifest.plugin.name}`,
        score,
      });
    }

    for (const item of luaPanels) {
      const { match, score } = fuzzyMatch(searchQuery, item.label);
      if (match) results.push({ option: { value: item.ref, label: item.label, icon: <ModuleIcon name={item.icon} className="h-4 w-4" /> }, category: "Modules", score });
    }
    // Sort by score descending
    return results.sort((a, b) => b.score - a.score);
  }, [searchQuery, isPanelVisible, customPanels, luaPanels]);

  const handleSelect = (panelValue: EventsPanelType) => {
    rememberRecentPanel(panelValue);
    onChange(panelValue);
    setIsOpen(false);
    setDropdownPosition(null);
    setSearchQuery("");
    setExpandedPaths(new Set());
    closeExplorer();
  };

  // Give focus back to the panel header the explorer was opened from.
  const closeExplorer = () => {
    if (!explorerHost) return;
    setExplorerHost(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  // The explorer covers the panel this selector belongs to; without one it floats over the page.
  const openExplorer = () => {
    setExplorerHost(containerRef.current?.closest<HTMLElement>("[data-panel-explorer-host]") ?? "floating");
    setIsOpen(false);
    setDropdownPosition(null);
    setSearchQuery("");
    setExpandedPaths(new Set());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      setDropdownPosition(null);
      setSearchQuery("");
      setExpandedPaths(new Set());
      triggerRef.current?.focus();
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
            setDropdownPosition(null);
          } else {
            updateDropdownPosition();
            setIsOpen(true);
          }
        }}
        className="flex items-center gap-1.5 text-sm font-medium bg-transparent cursor-pointer hover:text-muted-foreground transition-colors"
        data-help-panel-selector
      >
        {selectedOption.icon}
        {selectedOption.label}
        <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} />
      </button>

      {/* Dropdown panel. Render outside PanelCard's overflow boundary. */}
      {isOpen && dropdownPosition && portalContainer && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] flex w-[260px] flex-col bg-popover text-popover-foreground border rounded-md shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95"
          style={{
            left: dropdownPosition.left,
            top: dropdownPosition.top,
            bottom: dropdownPosition.bottom,
          }}
          onKeyDown={handleKeyDown}
        >
          {/* Search input */}
          <div className="flex items-center gap-1.5 p-2 border-b">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search panels..."
                className="w-full pl-8 pr-2 py-1.5 text-sm bg-transparent border rounded focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <button
              type="button"
              onClick={openExplorer}
              title="Browse every panel and module"
              className="inline-flex shrink-0 items-center gap-1 rounded border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Compass className="size-3.5" /> Explore
            </button>
          </div>

          {/* Results */}
          <ScrollArea
            className="styled-scrollbar"
            style={{ maxHeight: dropdownPosition.resultsMaxHeight }}
          >
            <div className="p-1">
              {filteredResults ? (
                // Search results
                filteredResults.length > 0 ? (
                  filteredResults.map(({ option, category }) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleSelect(option.value)}
                      className={cn(
                        "w-full text-left px-2 py-1.5 text-sm rounded-sm flex items-center gap-2",
                        "hover:bg-accent hover:text-accent-foreground cursor-pointer",
                        option.value === value && "bg-accent/50"
                      )}
                    >
                      <span className="text-muted-foreground">{option.icon}</span>
                      <span className="flex-1">{option.label}</span>
                      <span className="text-xs text-muted-foreground">{category}</span>
                    </button>
                  ))
                ) : (
                  <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                    No panels found
                  </div>
                )
              ) : (
                // Category tree (recursive)
                <>
                  {PANEL_CATEGORIES.map((category) => (
                    <CategoryNode
                      key={category.label}
                      category={category}
                      path={category.label}
                      expandedPaths={expandedPaths}
                      onToggle={toggleExpanded}
                      selectedValue={value}
                      onSelect={handleSelect}
                      isPanelVisible={isPanelVisible}
                    />
                  ))}
                  {luaPanels.length > 0 && (
                    <div>
                      <button type="button" onClick={() => toggleExpanded("Lua")} className="w-full px-2 py-1.5 text-left text-sm font-medium rounded-sm flex items-center gap-1.5 hover:bg-accent/50">
                        <ChevronRight className={cn("size-4 transition-transform", expandedPaths.has("Lua") && "rotate-90")} />
                        <Blocks className="h-4 w-4 text-muted-foreground" /> Modules
                        <span className="ml-auto text-xs text-muted-foreground">{luaPanels.length}</span>
                      </button>
                      {expandedPaths.has("Lua") && <div className="ml-2 border-l pl-1">{luaPanels.map((item) => (
                        <button key={item.ref} type="button" onClick={() => handleSelect(item.ref)} className={cn("flex w-full items-center gap-2 pl-6 pr-2 py-1.5 text-left text-sm rounded-sm hover:bg-accent", item.ref === value && "bg-accent/50")}>
                          <ModuleIcon name={item.icon} className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{item.label}</span>
                        </button>
                      ))}</div>}
                    </div>
                  )}
                  {customPanels.length > 0 && (
                    <div>
                      <button type="button" onClick={() => toggleExpanded("Custom")} className="w-full px-2 py-1.5 text-left text-sm font-medium rounded-sm flex items-center gap-1.5 hover:bg-accent/50">
                        <ChevronRight className={cn("size-4 transition-transform", expandedPaths.has("Custom") && "rotate-90")} />
                        <Wrench className="h-4 w-4 text-muted-foreground" /> Developer
                        <span className="ml-auto text-xs text-muted-foreground">{customPanels.length}</span>
                      </button>
                      {expandedPaths.has("Custom") && <div className="ml-2 border-l pl-1">{customPanels.map((item) => (
                        <button key={item.ref} type="button" onClick={() => handleSelect(item.ref)} className={cn("w-full pl-6 pr-2 py-1.5 text-left text-sm rounded-sm flex items-center gap-2 hover:bg-accent", item.ref === value && "bg-accent/50")}>
                          <Wrench className="h-4 w-4 text-muted-foreground" /><span className="min-w-0"><span className="block truncate">{item.panel.name}</span><span className="block truncate text-[10px] text-muted-foreground">{item.installation.manifest.plugin.name}</span></span>
                        </button>
                      ))}</div>}
                    </div>
                  )}
                </>
              )}
              <div className="mt-1 border-t px-2 py-2 text-center text-[10px] text-muted-foreground">
                Strips not supported here
              </div>
            </div>
          </ScrollArea>
        </div>,
        portalContainer,
      )}

      {explorerHost && (explorerHost !== "floating" || portalContainer) && createPortal(
        <PanelExplorer
          value={value}
          onSelect={handleSelect}
          onClose={closeExplorer}
          isPanelVisible={isPanelVisible}
          trackedModules={luaPanels}
          modulesStatus={luaCatalog.isError ? "error" : luaCatalog.isLoading ? "loading" : "ready"}
          onRetryModules={() => void luaCatalog.refetch()}
          customPanels={customPanels}
          floating={explorerHost === "floating"}
        />,
        explorerHost === "floating" ? portalContainer! : explorerHost,
      )}
    </div>
  );
}
