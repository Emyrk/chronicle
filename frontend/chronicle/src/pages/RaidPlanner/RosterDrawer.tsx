import { useState } from "react";
import { ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Search, Users } from "lucide-react";
import { CLASS_CSS_VAR, CLASS_DISPLAY } from "@/pages/Rankings/classDisplay";
import type { GearClassInfo } from "@/pages/Gear/classInfo";
import type { DragPayload, PlayerEntry } from "./types";
import { ClassIcon } from "./ClassIcon";

const ROLE_FILTERS = [
  { value: "", label: "All" },
  { value: "tank", label: "Tank" },
  { value: "heal", label: "Heal" },
  { value: "dps", label: "DPS" },
] as const;

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
 * guild's roster with search and role filtering.
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
  const [roleFilter, setRoleFilter] = useState<string>("");

  if (collapsed) {
    return (
      <button
        onClick={onToggleCollapsed}
        title="Open roster"
        className="flex flex-col items-center gap-2.5 py-3 border-r border-border bg-muted/20 hover:bg-muted/40 transition-colors"
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
  const filtered = available.filter((p) => {
    if (roleFilter && p.role !== roleFilter) return false;
    if (!query) return true;
    const clsName = CLASS_DISPLAY[p.cls] ?? p.cls;
    return (
      p.name.toLowerCase().includes(query) ||
      p.spec.toLowerCase().includes(query) ||
      clsName.toLowerCase().includes(query)
    );
  });

  return (
    <div className="flex flex-col border-r border-border bg-muted/20 min-h-0">
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
        GUILD ROSTER{hasGuild ? ` · ${filtered.length} UNASSIGNED` : ""}
      </div>
      {hasGuild ? (
        <>
          <div className="px-3 pb-1.5 space-y-1.5">
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
            <div className="flex gap-1">
              {ROLE_FILTERS.map((rf) => (
                <button
                  key={rf.value}
                  onClick={() => setRoleFilter(rf.value)}
                  className={`px-2 py-0.5 rounded-full text-[10px] transition-colors ${
                    roleFilter === rf.value
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {rf.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-1">
            {rosterLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length > 0 ? (
              filtered.map((p) => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={() => {
                    dragRef.current = { kind: "roster", entry: p };
                  }}
                  onDragEnd={() => {
                    dragRef.current = null;
                  }}
                  className="flex items-center gap-2 px-1.5 py-1 rounded-md bg-card border border-border/60 cursor-grab hover:border-ring transition-colors"
                >
                  <ClassIcon cls={p.cls} className="h-5 w-5 rounded border border-border/60 shrink-0" />
                  <div className="min-w-0">
                    <p
                      className="text-[11.5px] font-medium leading-tight truncate"
                      style={{ color: CLASS_CSS_VAR[p.cls] ?? CLASS_CSS_VAR.UNKNOWN }}
                    >
                      {p.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-tight truncate">
                      {p.spec || (CLASS_DISPLAY[p.cls] ?? p.cls)} · {p.level}
                    </p>
                  </div>
                  {p.role && (
                    <span className="ml-auto text-[9px] uppercase tracking-wide text-muted-foreground/70 shrink-0">
                      {p.role}
                    </span>
                  )}
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {query || roleFilter ? "No unassigned members match." : "Everyone is placed."}
              </p>
            )}
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
