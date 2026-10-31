/**
 * PanelExplorer - A roomy, searchable view of every panel, shown over the panel it will replace.
 * The dropdown stays for quick picks; this is for browsing what you can pick.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Compass, History, Search, Star, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventsPanelType } from "./EventsPanel";
import { fuzzyMatch, getAllCategoryItems, getCategoryIcon, getPanelOption, PANEL_CATEGORIES, readRecentPanels } from "./panelCategories";
import type { listSelectableCustomPanels } from "./custom/pluginRegistry";
import type { LuaPanelOption } from "./LuaPanel/luaPanelRegistry";
import { ModuleIcon } from "../../LuaProjects/ModuleIcon";

interface ExplorerItem {
  value: EventsPanelType;
  label: string;
  icon: React.ReactNode;
  description?: string;
  /** Where it sits inside its section: the subcategory for built-ins, the plugin for developer panels. */
  group?: string;
  stars?: number;
  /** Extra text search matches against, beyond the label and description. */
  keywords?: string;
}

interface ExplorerSection {
  label: string;
  icon: React.ReactNode;
  items: ExplorerItem[];
}

interface SearchResult {
  item: ExplorerItem;
  section: string;
  score: number;
}

const ALL = "All";
const ITEM_SELECTOR = "[data-explorer-item]";

/** Fuzzy match on the label first; otherwise a plain substring hit in the description ranks below every label match. */
function searchScore(query: string, item: ExplorerItem): number | null {
  const label = fuzzyMatch(query, item.label);
  if (label.match) return label.score;
  const text = `${item.description ?? ""} ${item.group ?? ""} ${item.keywords ?? ""}`.toLowerCase();
  return text.includes(query.toLowerCase()) ? -1 : null;
}

/** The nearest item in the next row up or down, so arrows work across sections with different column counts. */
function itemInDirection(from: HTMLElement, items: HTMLElement[], down: boolean): HTMLElement | undefined {
  const origin = from.getBoundingClientRect();
  const originX = origin.left + origin.width / 2;
  let best: HTMLElement | undefined;
  let bestScore = Infinity;
  for (const item of items) {
    const rect = item.getBoundingClientRect();
    const gap = down ? rect.top - origin.bottom : origin.top - rect.bottom;
    if (gap < -1) continue;
    const score = gap * 1000 + Math.abs(rect.left + rect.width / 2 - originX);
    if (score < bestScore) { best = item; bestScore = score; }
  }
  return best;
}

export interface PanelExplorerProps {
  value: EventsPanelType;
  onSelect: (value: EventsPanelType) => void;
  onClose: () => void;
  isPanelVisible: (key: EventsPanelType) => boolean;
  trackedModules: readonly LuaPanelOption[];
  modulesStatus: "loading" | "error" | "ready";
  onRetryModules: () => void;
  customPanels: ReturnType<typeof listSelectableCustomPanels>;
  /** Fill the viewport instead of the panel, when there is no panel to cover. */
  floating?: boolean;
}

export function PanelExplorer({ value, onSelect, onClose, isPanelVisible, trackedModules, modulesStatus, onRetryModules, customPanels, floating }: PanelExplorerProps) {
  const [query, setQuery] = useState("");
  const [section, setSection] = useState(ALL);
  const [recent] = useState(readRecentPanels);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const trimmed = query.trim();

  useEffect(() => {
    searchRef.current?.focus();
    resultsRef.current?.querySelector<HTMLElement>("[data-current]")?.scrollIntoView({ block: "nearest" });
  }, []);

  const sections = useMemo<ExplorerSection[]>(() => {
    const builtIn = PANEL_CATEGORIES.map((category) => ({
      label: category.label,
      icon: getCategoryIcon(category),
      items: getAllCategoryItems(category).filter(({ panelKey }) => isPanelVisible(panelKey)).map(({ panelKey, categoryPath }) => {
        const option = getPanelOption(panelKey);
        // Nested categories read "Class › Druid"; the top level is already the section heading.
        const group = categoryPath.includes("›") ? categoryPath.split("›").slice(1).join("›").trim() : undefined;
        return { value: option.value, label: option.label, icon: option.icon, description: option.description, group };
      }),
    }));
    const modules = trackedModules.map((option) => ({
      value: option.ref, label: option.label, icon: <ModuleIcon name={option.icon} className="h-4 w-4" />,
      description: option.description || undefined, stars: option.stars,
    }));
    const developer = customPanels.map((item) => ({
      value: item.ref, label: item.panel.name, icon: <Wrench className="h-4 w-4" />,
      description: item.panel.description, group: item.installation.manifest.plugin.name, keywords: item.installation.repository,
    }));
    return [
      ...builtIn,
      { label: "Your modules", icon: <Star className="h-4 w-4" />, items: modules },
      { label: "Developer", icon: <Wrench className="h-4 w-4" />, items: developer },
    ].filter((candidate) => candidate.items.length > 0);
  }, [isPanelVisible, trackedModules, customPanels]);

  const recentSection = useMemo<ExplorerSection | null>(() => {
    const byValue = new Map(sections.flatMap((candidate) => candidate.items.map((item) => [item.value, item] as const)));
    const items = recent.flatMap((candidate) => byValue.get(candidate) ?? []);
    return items.length > 0 ? { label: "Recent", icon: <History className="h-4 w-4" />, items } : null;
  }, [sections, recent]);

  // Search ranks everything as one list; the pills then show how many hits each section has.
  const results = useMemo<SearchResult[] | null>(() => {
    if (!trimmed) return null;
    return sections
      .flatMap((candidate) => candidate.items.map((item) => ({ item, section: candidate.label, score: searchScore(trimmed, item) })))
      .filter((result): result is SearchResult => result.score !== null)
      .sort((a, b) => b.score - a.score);
  }, [sections, trimmed]);

  const matchCounts = useMemo(() => {
    const counts = new Map<string, number>([[ALL, results?.length ?? 0]]);
    for (const result of results ?? []) counts.set(result.section, (counts.get(result.section) ?? 0) + 1);
    return counts;
  }, [results]);

  const browsing = useMemo(() => {
    if (section !== ALL) return sections.filter((candidate) => candidate.label === section);
    return recentSection ? [recentSection, ...sections] : sections;
  }, [sections, section, recentSection]);
  const shownResults = results && (section === ALL ? results : results.filter((result) => result.section === section));

  const items = () => Array.from(resultsRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);

  const onSearchKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items()[0]?.focus();
    } else if (event.key === "Enter" && shownResults?.[0]) {
      event.preventDefault();
      onSelect(shownResults[0].item.value);
    }
  };

  const onResultsKeyDown = (event: React.KeyboardEvent) => {
    const from = event.target as HTMLElement;
    if (!from.matches(ITEM_SELECTOR)) return;
    const all = items();
    const index = all.indexOf(from);
    let next: HTMLElement | null | undefined;
    if (event.key === "ArrowLeft") next = all[index - 1];
    else if (event.key === "ArrowRight") next = all[index + 1];
    else if (event.key === "ArrowDown") next = itemInDirection(from, all, true);
    else if (event.key === "ArrowUp") next = itemInDirection(from, all, false) ?? searchRef.current;
    else return;
    event.preventDefault();
    next?.focus();
  };

  const onDialogKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    // A floating explorer covers the page, so Tab stays inside it.
    if (!floating || event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button, input, a[href]") ?? []);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first?.focus(); }
  };

  const renderItem = (item: ExplorerItem, tag?: string) => {
    const isCurrent = item.value === value;
    return (
      <button
        key={item.value}
        type="button"
        data-explorer-item
        data-current={isCurrent || undefined}
        aria-current={isCurrent || undefined}
        onClick={() => onSelect(item.value)}
        className={cn(
          "flex min-w-0 items-start gap-2 rounded-md border border-border/70 px-2.5 py-2 text-left text-sm hover:border-sky-400/60 hover:bg-muted/50 focus:outline-none focus-visible:border-sky-400 focus-visible:ring-1 focus-visible:ring-sky-400",
          isCurrent && "border-sky-400/60 bg-sky-400/10",
        )}
      >
        <span className="mt-0.5 shrink-0 text-muted-foreground">{item.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-medium" title={item.label}>{item.label}</span>
            {isCurrent && <span className="shrink-0 rounded bg-sky-400/20 px-1 text-[10px] font-medium text-sky-600 dark:text-sky-300">Current</span>}
          </span>
          {item.description && <span className="line-clamp-2 text-xs text-muted-foreground">{item.description}</span>}
          {(tag ?? item.group) && <span className="mt-0.5 block truncate text-[10px] uppercase tracking-wide text-muted-foreground/80">{tag ?? item.group}</span>}
          {item.stars !== undefined && (
            <span className="mt-0.5 inline-flex items-center gap-0.5 text-xs text-muted-foreground" title={`${item.stars} people track this module`}>
              <Star className="size-3" />{item.stars}
            </span>
          )}
        </span>
      </button>
    );
  };

  const grid = "grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-1.5";

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-label="Explore panels"
      aria-modal={floating || undefined}
      className={cn(
        "z-40 flex flex-col overflow-hidden bg-card text-card-foreground",
        floating ? "fixed inset-4 z-[9999] rounded-xl border shadow-2xl" : "absolute inset-0 rounded-[inherit]",
      )}
      onKeyDown={onDialogKeyDown}
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
            onKeyDown={onSearchKeyDown}
            placeholder="Search panels and modules…"
            aria-label="Search panels and modules"
            className="w-full rounded border bg-transparent py-1.5 pl-8 pr-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <button type="button" onClick={onClose} aria-label="Close explorer" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      <div className="styled-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-1.5" role="group" aria-label="Panel categories">
        {[ALL, ...sections.map((candidate) => candidate.label)].map((label) => {
          const count = results ? matchCounts.get(label) ?? 0 : undefined;
          return (
            <button
              key={label}
              type="button"
              aria-pressed={section === label}
              onClick={() => setSection(label)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs",
                section === label ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                count === 0 && section !== label && "opacity-50",
              )}
            >
              {label}
              {count !== undefined && <span className="tabular-nums text-muted-foreground">{count}</span>}
            </button>
          );
        })}
      </div>

      <div ref={resultsRef} className="styled-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-3" onKeyDown={onResultsKeyDown}>
        {shownResults ? (
          shownResults.length > 0 && (
            <div className={grid}>
              {shownResults.map(({ item, section: from }) => renderItem(item, item.group ? `${from} › ${item.group}` : from))}
            </div>
          )
        ) : (
          browsing.map((candidate) => (
            <section key={candidate.label} aria-label={candidate.label}>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {candidate.icon}{candidate.label}
                <span className="font-normal normal-case tracking-normal">{candidate.items.length}</span>
              </h4>
              <div className={grid}>{candidate.items.map((item) => renderItem(item))}</div>
            </section>
          ))
        )}
        {shownResults?.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <p>No panels match “{trimmed}”{section !== ALL && ` in ${section}`}.</p>
            {section !== ALL && !!matchCounts.get(ALL) && (
              <button type="button" onClick={() => setSection(ALL)} className="mt-1 text-xs text-sky-600 hover:underline dark:text-sky-300">
                Show {matchCounts.get(ALL)} {matchCounts.get(ALL) === 1 ? "match" : "matches"} in all categories
              </button>
            )}
            <p className="mt-1 text-xs">
              Looking for a module? Track it from the{" "}
              <Link to="/modules" target="_blank" rel="noreferrer" className="text-sky-600 hover:underline dark:text-sky-300">module gallery</Link>
              {" "}and it shows up here.
            </p>
          </div>
        )}
        {modulesStatus === "loading" && <p className="text-center text-xs text-muted-foreground">Loading your modules…</p>}
        {modulesStatus === "error" && (
          <p className="text-center text-xs text-muted-foreground">
            Couldn't load your modules.{" "}
            <button type="button" onClick={onRetryModules} className="text-sky-600 hover:underline dark:text-sky-300">Retry</button>
          </p>
        )}
      </div>
    </div>
  );
}
