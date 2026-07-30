/**
 * PanelSelector - Dropdown with submenus and fuzzy search for panel selection
 */

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, Leaf, Scale, Search, Sword, Toolbox, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { PANELS, type EventsPanelType } from "./EventsPanel";

interface PanelOption {
  value: EventsPanelType;
  label: string;
  icon: React.ReactNode;
}

interface PanelCategory {
  label: string;
  /** Direct panel items (leaf nodes) */
  items?: EventsPanelType[];
  /** Nested subcategories */
  subcategories?: PanelCategory[];
  /** Optional explicit icon (defaults to first item's icon) */
  icon?: React.ReactNode;
}

// Category organization - panels get their labels/icons from PANELS registry
const PANEL_CATEGORIES: PanelCategory[] = [
  {
    label: "Damage",
    items: ["damage_done", "vulnerability_effect", "enemy_damage_done", "pet_damage_done", "damage_done_friendly_fire"],
  },
  {
    label: "Healing",
    items: ["healing_done", "healing_taken"],
  },
  {
    label: "Replay",
    items: ["status", "healer_casts"],
  },
  {
    label: "Survivability",
    items: ["damage_taken", "enemy_damage_taken", "mitigation", "absorbed_damage", "resists"], // TODO: Add "avoidance" when spell school data is available
  },
  {
    label: "Resources",
    items: ["extra_attacks", "resource_regen"],
  },
  {
    label: "Deaths",
    items: ["deaths", "death_log"],
  },
  {
    label: "Buffs",
    items: ["aura_uptime"],
  },
  {
    label: "Dispels & Interrupts",
    items: ["dispels_done", "dispels_received", "dispel_log", "interrupts", "interrupt_log"],
  },
  {
    label: "Class",
    // TODO: Make class icons in this style
    icon: <User className="h-4 w-4" />,
    subcategories: [
      {
        label: "Druid",
        items: ["innervate"],
        icon: <Leaf className="h-4 w-4" />,
      },
      {
        label: "Warrior",
        items: ["sunder"],
        icon: <Sword className="h-4 w-4" />,
      },
      {
        label: "Paladin",
        items: ["judgement"],
        icon: <Scale className="h-4 w-4" />,
      },
    ],
  },
  {
    label: "Utility",
    items: ["roles", "timeline", "rotations", "comparison", "all_activity", "metrics", "periods", "pulls_and_cleanup", "possession", "unit_lookup", "equipment", "guilds", "loot", "logging_metadata", "companion_stats", "leaderboard", "empty"],
    icon: <Toolbox className="h-4 w-4" />,
  },
];

// Build panel options from registry
function getPanelOption(value: EventsPanelType): PanelOption {
  const panel = PANELS[value];
  return {
    value,
    label: panel?.label ?? value,
    icon: panel?.icon,
  };
}

// Get category icon: explicit icon, first item's icon, or first subcategory's icon
function getCategoryIcon(category: PanelCategory): React.ReactNode {
  if (category.icon) return category.icon;
  if (category.items && category.items.length > 0) {
    const firstPanel = PANELS[category.items[0]];
    return firstPanel?.icon;
  }
  if (category.subcategories && category.subcategories.length > 0) {
    return getCategoryIcon(category.subcategories[0]);
  }
  return null;
}

// Count total items in a category (including nested)
function getCategoryItemCount(category: PanelCategory): number {
  let count = category.items?.length ?? 0;
  if (category.subcategories) {
    for (const sub of category.subcategories) {
      count += getCategoryItemCount(sub);
    }
  }
  return count;
}

// Get all items from a category recursively (for search)
function getAllCategoryItems(category: PanelCategory): { panelKey: EventsPanelType; categoryPath: string }[] {
  const results: { panelKey: EventsPanelType; categoryPath: string }[] = [];
  
  if (category.items) {
    for (const panelKey of category.items) {
      results.push({ panelKey, categoryPath: category.label });
    }
  }
  
  if (category.subcategories) {
    for (const sub of category.subcategories) {
      const subItems = getAllCategoryItems(sub);
      for (const item of subItems) {
        results.push({
          panelKey: item.panelKey,
          categoryPath: `${category.label} › ${item.categoryPath}`,
        });
      }
    }
  }
  
  return results;
}

/**
 * Simple fuzzy match - checks if all characters in pattern appear in str in order
 */
function fuzzyMatch(pattern: string, str: string): { match: boolean; score: number } {
  const patternLower = pattern.toLowerCase();
  const strLower = str.toLowerCase();

  if (patternLower.length === 0) return { match: true, score: 0 };

  let patternIdx = 0;
  let score = 0;
  let consecutiveBonus = 0;

  for (let i = 0; i < strLower.length && patternIdx < patternLower.length; i++) {
    if (strLower[i] === patternLower[patternIdx]) {
      // Bonus for consecutive matches
      score += 1 + consecutiveBonus;
      consecutiveBonus += 1;
      // Bonus for matching at word start
      if (i === 0 || str[i - 1] === " ") {
        score += 2;
      }
      patternIdx++;
    } else {
      consecutiveBonus = 0;
    }
  }

  return {
    match: patternIdx === patternLower.length,
    score,
  };
}

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

export interface PanelSelectorProps {
  value: EventsPanelType;
  onChange: (value: EventsPanelType) => void;
  className?: string;
}

export function PanelSelector({ value, onChange, className }: PanelSelectorProps) {
  const [searchParams] = useSearchParams();
  const isDebug = searchParams.get("debug") === "true";
  const isPanelVisible = useCallback(
    (key: EventsPanelType) => !PANELS[key].hidden || isDebug,
    [isDebug],
  );
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Track expanded categories by their path (e.g., "Class" or "Class/Druid")
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
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

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery("");
        setExpandedPaths(new Set());
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

    // Sort by score descending
    return results.sort((a, b) => b.score - a.score);
  }, [searchQuery, isPanelVisible]);

  const handleSelect = (panelValue: EventsPanelType) => {
    onChange(panelValue);
    setIsOpen(false);
    setSearchQuery("");
    setExpandedPaths(new Set());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      setSearchQuery("");
      setExpandedPaths(new Set());
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-sm font-medium bg-transparent cursor-pointer hover:text-muted-foreground transition-colors"
        data-help-panel-selector
      >
        {getPanelOption(value).icon}
        {getPanelOption(value).label}
        <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} />
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          className="absolute left-0 top-full mt-1 z-50 w-[260px] bg-popover text-popover-foreground border rounded-md shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95"
          onKeyDown={handleKeyDown}
        >
          {/* Search input */}
          <div className="p-2 border-b">
            <div className="relative">
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
          </div>

          {/* Results */}
          <ScrollArea className="max-h-[350px]">
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
                PANEL_CATEGORIES.map((category) => (
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
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
