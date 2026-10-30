/**
 * PanelExplorer - A roomy, searchable view of every panel, shown over the panel it will replace.
 * The dropdown stays for quick picks; this is for browsing, and it lists public modules too.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Blocks, Compass, Search, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventsPanelType } from "./EventsPanel";
import { fuzzyMatch, getAllCategoryItems, getCategoryIcon, getPanelOption, PANEL_CATEGORIES } from "./panelCategories";
import type { listSelectableCustomPanels } from "./custom/pluginRegistry";
import { publicLuaPanelOptions, usePublicLuaPanels, type LuaPanelOption } from "./LuaPanel/luaPanelRegistry";
import { ModuleIcon } from "../../LuaProjects/ModuleIcon";

interface ExplorerItem {
  value: EventsPanelType;
  label: string;
  icon: React.ReactNode;
  /** A second line: the subcategory for built-ins, the description for modules. */
  detail?: string;
  stars?: number;
  /** Extra text search matches against, beyond the label. */
  keywords?: string;
}

interface ExplorerSection {
  label: string;
  icon: React.ReactNode;
  items: ExplorerItem[];
}

const ALL = "All";

function moduleItems(options: readonly LuaPanelOption[]): ExplorerItem[] {
  return options.map((option) => ({
    value: option.ref, label: option.label, icon: <ModuleIcon name={option.icon} className="h-4 w-4" />,
    detail: option.description || undefined, stars: option.stars, keywords: option.description,
  }));
}

export interface PanelExplorerProps {
  value: EventsPanelType;
  onSelect: (value: EventsPanelType) => void;
  onClose: () => void;
  isPanelVisible: (key: EventsPanelType) => boolean;
  trackedModules: readonly LuaPanelOption[];
  customPanels: ReturnType<typeof listSelectableCustomPanels>;
  /** Fill the viewport instead of the panel, when there is no panel to cover. */
  floating?: boolean;
}

export function PanelExplorer({ value, onSelect, onClose, isPanelVisible, trackedModules, customPanels, floating }: PanelExplorerProps) {
  const [query, setQuery] = useState("");
  const [section, setSection] = useState(ALL);
  const searchRef = useRef<HTMLInputElement>(null);
  const publicQuery = usePublicLuaPanels();

  useEffect(() => { searchRef.current?.focus(); }, []);

  const sections = useMemo<ExplorerSection[]>(() => {
    const builtIn = PANEL_CATEGORIES.map((category) => ({
      label: category.label,
      icon: getCategoryIcon(category),
      items: getAllCategoryItems(category).filter(({ panelKey }) => isPanelVisible(panelKey)).map(({ panelKey, categoryPath }) => {
        const option = getPanelOption(panelKey);
        // Nested categories read "Class › Druid"; the top level is already the section heading.
        const detail = categoryPath.includes("›") ? categoryPath.split("›").slice(1).join("›").trim() : undefined;
        return { value: option.value, label: option.label, icon: option.icon, detail };
      }),
    }));
    const tracked = new Set(trackedModules.map((option) => option.ref));
    const browse = publicLuaPanelOptions(publicQuery.data ?? []).filter((option) => !tracked.has(option.ref));
    const developer = customPanels.map((item) => ({
      value: item.ref, label: item.panel.name, icon: <Blocks className="h-4 w-4" />,
      detail: item.installation.manifest.plugin.name, keywords: `${item.panel.description ?? ""} ${item.installation.repository}`,
    }));
    return [
      ...builtIn,
      { label: "Your modules", icon: <Star className="h-4 w-4" />, items: moduleItems(trackedModules) },
      { label: "More modules", icon: <Blocks className="h-4 w-4" />, items: moduleItems(browse) },
      { label: "Developer", icon: <Blocks className="h-4 w-4" />, items: developer },
    ].filter((candidate) => candidate.items.length > 0);
  }, [isPanelVisible, trackedModules, publicQuery.data, customPanels]);

  const shown = useMemo(() => {
    const picked = section === ALL ? sections : sections.filter((candidate) => candidate.label === section);
    if (!query.trim()) return picked;
    return picked.map((candidate) => ({
      ...candidate,
      items: candidate.items
        .map((item) => ({ item, ...fuzzyMatch(query, `${item.label} ${item.keywords ?? ""}`) }))
        .filter(({ match }) => match)
        .sort((a, b) => b.score - a.score)
        .map(({ item }) => item),
    })).filter((candidate) => candidate.items.length > 0);
  }, [sections, section, query]);

  return (
    <div
      role="dialog"
      aria-label="Explore panels"
      className={cn(
        "z-40 flex flex-col overflow-hidden bg-card text-card-foreground",
        floating ? "fixed inset-4 z-[9999] rounded-xl border shadow-2xl" : "absolute inset-0 rounded-[inherit]",
      )}
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-2 border-b p-2">
        <Compass className="size-4 shrink-0 text-muted-foreground" />
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search panels and modules..."
            aria-label="Search panels and modules"
            className="w-full rounded border bg-transparent py-1.5 pl-8 pr-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <button type="button" onClick={onClose} aria-label="Close explorer" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      <div className="styled-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-1.5" role="tablist" aria-label="Panel categories">
        {[ALL, ...sections.map((candidate) => candidate.label)].map((label) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={section === label}
            onClick={() => setSection(label)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs",
              section === label ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="styled-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {shown.map((candidate) => (
          <section key={candidate.label} aria-label={candidate.label}>
            <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {candidate.icon}{candidate.label}
              <span className="font-normal normal-case tracking-normal">{candidate.items.length}</span>
            </h4>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-1.5">
              {candidate.items.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => onSelect(item.value)}
                  className={cn(
                    "flex min-w-0 items-start gap-2 rounded-md border border-border/70 px-2.5 py-2 text-left text-sm hover:border-sky-400/60 hover:bg-muted/50",
                    item.value === value && "border-sky-400/60 bg-sky-400/10",
                  )}
                >
                  <span className="mt-0.5 shrink-0 text-muted-foreground">{item.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium" title={item.label}>{item.label}</span>
                    {item.detail && <span className="line-clamp-2 text-xs text-muted-foreground">{item.detail}</span>}
                    {item.stars !== undefined && (
                      <span className="mt-0.5 inline-flex items-center gap-0.5 text-xs text-muted-foreground" title={`${item.stars} people track this module`}>
                        <Star className="size-3" />{item.stars}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
        {shown.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No panels found</p>}
        {publicQuery.isPending && section !== "Your modules" && <p className="text-center text-xs text-muted-foreground">Loading modules...</p>}
      </div>
    </div>
  );
}
