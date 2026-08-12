import { useCallback, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Cross,
  Loader2,
  Search,
  Shield,
  Swords,
  Users,
  X,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { CLASS_CSS_VAR, CLASS_DISPLAY } from "@/pages/Rankings/classDisplay";
import { parseColor } from "@/pages/Instance/parseColors";
import type { GearClassInfo } from "@/pages/Gear/classInfo";
import type { DragPayload, PlayerEntry } from "./types";

/** Unique observed specs, most recent first: "Fury / Protection". */
function rosterSpecLabel(p: PlayerEntry): string {
  const specs = [...new Set(p.specRoles.map((sr) => sr.spec).filter(Boolean))];
  if (specs.length === 0) return CLASS_DISPLAY[p.cls] ?? p.cls;
  return specs.join(" / ");
}

const ROLE_GLYPHS = [
  { value: "tank", label: "Tank", Icon: Shield },
  { value: "heal", label: "Healer", Icon: Cross },
  { value: "dps", label: "DPS", Icon: Swords },
] as const;

function toggled(set: ReadonlySet<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/** Rows revealed per scroll batch; the list grows as the sentinel comes into view. */
const SCROLL_BATCH = 50;

interface RosterDrawerProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  classes: GearClassInfo[];
  /** Roster members not yet placed on the board or bench. */
  available: PlayerEntry[];
  rosterLoading: boolean;
  hasGuild: boolean;
  dragRef: React.RefObject<DragPayload | null>;
}

/**
 * Left rail of the builder: draggable class placeholders plus the selected
 * guild's roster, filtered by class squares, role glyphs, and search.
 */
export function RosterDrawer({
  collapsed,
  onToggleCollapsed,
  classes,
  available,
  rosterLoading,
  hasGuild,
  dragRef,
}: RosterDrawerProps) {
  const [placeholdersOpen, setPlaceholdersOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<Set<string>>(new Set());
  const [roleFilter, setRoleFilter] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(SCROLL_BATCH);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Observe the sentinel row whenever it mounts; reveal the next batch as it
  // scrolls into view. A callback ref handles mount/unmount without effects.
  // The sentinel's parent is the scrolling list, so it serves as the root.
  const sentinelRef = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) => count + SCROLL_BATCH);
        }
      },
      { root: el.parentElement, rootMargin: "150px" },
    );
    observer.observe(el);
    observerRef.current = observer;
  }, []);

  // Rewind the window when the filtered list changes shape (filters, search,
  // roster updates) — state adjustment during render, not in an effect.
  const filterKey = `${search}|${[...classFilter].sort().join()}|${[...roleFilter].sort().join()}|${available.length}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setVisibleCount(SCROLL_BATCH);
  }

  if (collapsed) {
    return (
      <button
        onClick={onToggleCollapsed}
        title="Open roster"
        className="h-full w-full flex flex-col items-center gap-2.5 py-3 border-r border-border bg-muted/20 hover:bg-muted/40 transition-colors"
      >
        <ChevronsRight className="h-3.5 w-3.5 text-primary" />
        <span
          className="text-[10px] font-semibold tracking-widest text-muted-foreground"
          style={{ writingMode: "vertical-rl" }}
        >
          ROSTER · {available.length}
        </span>
      </button>
    );
  }

  const query = search.trim().toLowerCase();
  const hasFilters = classFilter.size > 0 || roleFilter.size > 0 || query !== "";
  const filtered = available.filter((p) => {
    if (classFilter.size > 0 && !classFilter.has(p.cls)) return false;
    if (roleFilter.size > 0 && !p.specRoles.some((sr) => roleFilter.has(sr.role))) return false;
    if (!query) return true;
    const clsName = CLASS_DISPLAY[p.cls] ?? p.cls;
    return (
      p.name.toLowerCase().includes(query) ||
      p.specRoles.some((sr) => sr.spec.toLowerCase().includes(query)) ||
      clsName.toLowerCase().includes(query)
    );
  });

  return (
    <div className="h-full flex flex-col border-r border-border bg-muted/20 min-h-0">
      {/* Placeholders */}
      <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5">
        <button
          onClick={() => setPlaceholdersOpen((o) => !o)}
          className="flex-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          PLACEHOLDERS
          {placeholdersOpen ? <ChevronDown className="h-3 w-3 text-primary" /> : <ChevronRight className="h-3 w-3 text-primary" />}
        </button>
        <button
          onClick={onToggleCollapsed}
          title="Close roster"
          className="shrink-0 p-1 border border-border rounded-md text-primary hover:bg-muted/40 transition-colors"
        >
          <ChevronsLeft className="h-3 w-3" />
        </button>
      </div>
      {placeholdersOpen && (
        <div className="grid grid-cols-2 gap-1 px-3 pb-2.5">
          {classes.map((cls) => (
            <div
              key={cls.enumName}
              draggable
              onDragStart={() => {
                dragRef.current = { kind: "class", cls: cls.enumName };
              }}
              onDragEnd={() => {
                dragRef.current = null;
              }}
              title={`Drag to reserve a slot for a ${cls.name}`}
              className="flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-card border border-dashed border-border cursor-grab hover:border-ring transition-colors"
            >
              <span
                className="h-2.5 w-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: CLASS_CSS_VAR[cls.enumName] ?? CLASS_CSS_VAR.UNKNOWN }}
              />
              <span className="text-[11px] text-foreground/80 truncate">{cls.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Guild roster */}
      <div className="px-3 pt-2.5 pb-1.5 border-t border-border text-[10px] font-semibold tracking-widest text-muted-foreground">
        GUILD ROSTER
      </div>
      {hasGuild ? (
        <>
          <div className="px-3 pb-1.5 space-y-1.5">
            {/* Class squares */}
            <div className="flex gap-1">
              {classes.map((cls) => {
                const active = classFilter.has(cls.enumName);
                return (
                  <button
                    key={cls.enumName}
                    onClick={() => setClassFilter((f) => toggled(f, cls.enumName))}
                    title={active ? `${cls.name} — click to unfilter` : `Show only ${cls.name}s`}
                    className={`h-6 flex-1 rounded-sm transition-all ${
                      active
                        ? "ring-2 ring-ring ring-offset-1 ring-offset-background"
                        : classFilter.size > 0
                          ? "opacity-25 hover:opacity-70"
                          : "opacity-70 hover:opacity-100"
                    }`}
                    style={{ backgroundColor: CLASS_CSS_VAR[cls.enumName] ?? CLASS_CSS_VAR.UNKNOWN }}
                  />
                );
              })}
            </div>
            {/* Role glyphs + clear */}
            <div className="flex items-center gap-1">
              {ROLE_GLYPHS.map(({ value, label, Icon }) => {
                const active = roleFilter.has(value);
                return (
                  <div key={value} className="flex-1 flex justify-center">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          aria-label={label}
                          onClick={() => setRoleFilter((f) => toggled(f, value))}
                          className={`h-9 w-9 flex items-center justify-center border rounded-md transition-colors ${
                            active
                              ? "border-ring bg-primary/15 text-primary"
                              : "border-border text-muted-foreground hover:text-foreground hover:border-ring"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{label}</TooltipContent>
                    </Tooltip>
                  </div>
                );
              })}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    aria-label="Clear filters"
                    onClick={() => {
                      setClassFilter(new Set());
                      setRoleFilter(new Set());
                      setSearch("");
                    }}
                    disabled={!hasFilters}
                    className="shrink-0 px-1 text-muted-foreground hover:text-foreground disabled:opacity-25 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Clear filters</TooltipContent>
              </Tooltip>
            </div>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search roster…"
                className="w-full pl-6 pr-2 py-1.5 bg-card border border-border rounded-md text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div className="styled-scrollbar flex-1 min-h-0 overflow-y-auto px-3 pb-1.5 space-y-1">
            {rosterLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length > 0 ? (
              filtered.slice(0, visibleCount).map((p) => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={() => {
                    dragRef.current = { kind: "roster", entry: p };
                  }}
                  onDragEnd={() => {
                    dragRef.current = null;
                  }}
                  title={p.specRoles.map((sr) => `${sr.spec || "?"} (${sr.role || "?"})`).join(", ")}
                  className="flex items-center gap-2 px-1.5 py-1 rounded-md bg-card border border-border/60 cursor-grab hover:border-ring transition-colors"
                >
                  <span
                    className="w-[3px] self-stretch rounded-full shrink-0"
                    style={{ backgroundColor: CLASS_CSS_VAR[p.cls] ?? CLASS_CSS_VAR.UNKNOWN }}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[11.5px] font-medium leading-tight truncate"
                      style={{ color: CLASS_CSS_VAR[p.cls] ?? CLASS_CSS_VAR.UNKNOWN }}
                    >
                      {p.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-tight truncate">
                      {rosterSpecLabel(p)}
                    </p>
                  </div>
                  {p.avgParse >= 0 && (
                    <span
                      className={`text-[11px] font-semibold tabular-nums shrink-0 ${parseColor(Math.round(p.avgParse))}`}
                      title="Average parse over the recent scoring window"
                    >
                      {Math.round(p.avgParse)}%
                    </span>
                  )}
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {hasFilters ? "No unassigned members match." : "Everyone is placed."}
              </p>
            )}
            {!rosterLoading && filtered.length > visibleCount && (
              <div ref={sentinelRef} className="flex justify-center py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/60" />
              </div>
            )}
          </div>
          <div className="px-3 pb-2.5 pt-1 text-[10px] text-muted-foreground">
            {filtered.length} of {available.length} unassigned · showing{" "}
            {Math.min(visibleCount, filtered.length)}
          </div>
        </>
      ) : (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
          <Users className="h-6 w-6 mx-auto mb-2 opacity-40" />
          Pick a guild in the header to load its roster.
        </div>
      )}
    </div>
  );
}
