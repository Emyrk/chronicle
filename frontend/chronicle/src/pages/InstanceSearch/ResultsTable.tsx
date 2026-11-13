import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronRight, Loader2, SearchX } from "lucide-react";
import type { InstanceSearchResult, InstanceSearchSort, InstanceSearchSortField } from "@/api/typesGenerated";
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages";
import { cn } from "@/lib/utils";
import { EvidencePanel } from "./EvidencePanel";
import type { Node } from "./queryModel";
import type { SearchBudget } from "./searchApi";
import { formatMinutes, formatSortValue } from "./summary";

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

/** Sorts whose value already has a column (or sits in the Run subtitle). */
const SORT_COLUMN: Partial<Record<InstanceSearchSortField, string>> = {
  "instance.name": "run",
  "instance.realm": "run",
  "instance.difficulty": "run",
  "instance.max_players": "run",
  "instance.guild": "guild",
  "instance.bosses_killed": "bosses",
  "instance.player_count": "players",
  "instance.clear_time_ms": "clear",
  "instance.started_at": "date",
};

function instanceHref(r: InstanceSearchResult): string {
  return `/instances/${r.slug || r.id}`;
}

/**
 * Search results: zone art, guild, boss progress, players, clear time and
 * date. Whole rows open the run in a new tab; the chevron expands "why it
 * matched" evidence under the row.
 */
export function ResultsTable({
  rows,
  loading,
  bossCounts,
  tree,
  sort,
  sortLabel,
  onBudget,
}: {
  rows: InstanceSearchResult[];
  loading: boolean;
  /** Total bosses per zone name, for "8/10". */
  bossCounts: Map<string, number>;
  /** The submitted search, explained per row on expand. */
  tree: Node | undefined;
  /** The submitted order: its column gets an arrow, or its own column when the table doesn't show it. */
  sort: InstanceSearchSort;
  /** Header for the extra sort column, e.g. "Boss kill time · Ragnaros". */
  sortLabel: string;
  onBudget?: (budget: SearchBudget) => void;
}) {
  const sortedColumn = SORT_COLUMN[sort.field];
  const extraColumn = sortedColumn === undefined;
  const SortArrow = sort.direction === "asc" ? ArrowUp : ArrowDown;
  const arrow = (column: string) => (sortedColumn === column ? <SortArrow className="inline h-3 w-3 ml-0.5 -mt-px text-sky-400" aria-label={`Sorted ${sort.direction === "asc" ? "ascending" : "descending"}`} /> : null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <SearchX className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No runs match this search.</p>
        <p className="text-xs mt-1">Try loosening a condition, or edit the search.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border overflow-hidden bg-background/40">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-primary-darker text-muted-foreground text-2xs uppercase tracking-wider">
            <th className="w-8 pl-2 py-2"><span className="sr-only">Why it matched</span></th>
            <th className="text-left px-3 py-2 font-medium">Run{arrow("run")}</th>
            <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Guild{arrow("guild")}</th>
            <th className="text-left px-3 py-2 font-medium">Bosses{arrow("bosses")}</th>
            <th className="text-right px-3 py-2 font-medium hidden md:table-cell">Players{arrow("players")}</th>
            <th className="text-right px-3 py-2 font-medium hidden md:table-cell min-w-[6rem] whitespace-nowrap">Clear{arrow("clear")}</th>
            {extraColumn && (
              <th className="text-right px-3 py-2 font-medium whitespace-nowrap text-sky-300" title={sortLabel}>
                <span className="inline-block max-w-[9rem] truncate align-bottom">{sortLabel}</span>
                <SortArrow className="inline h-3 w-3 ml-0.5 -mt-px text-sky-400" aria-label={`Sorted ${sort.direction === "asc" ? "ascending" : "descending"}`} />
              </th>
            )}
            <th className="text-right px-3 py-2 font-medium hidden sm:table-cell">Date{arrow("date")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {rows.map((r) => {
            const total = bossCounts.get(r.name);
            const full = total != null && total > 0 && r.bosses_killed >= total;
            const pct = total ? Math.min(1, r.bosses_killed / total) : 0;
            const open = expanded.has(r.id);
            return (
              <Fragment key={r.id}>
              <tr
                onClick={(e) => {
                  // Rows open the run in a new tab so the results stay put.
                  // Real links already open in a new tab themselves, and the
                  // chevron toggles the evidence.
                  if ((e.target as HTMLElement).closest("a, button")) return;
                  window.open(instanceHref(r), "_blank", "noopener,noreferrer");
                }}
                className={cn("group cursor-pointer hover:bg-primary-darker/40 transition-colors", open && "bg-primary-darker/30")}
              >
                <td className="pl-2 py-2 align-middle">
                  <button
                    type="button"
                    onClick={() => toggle(r.id)}
                    aria-expanded={open}
                    title={open ? "Hide why this run matched" : "Why did this run match?"}
                    className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  >
                    <ChevronRight className={cn("h-4 w-4 transition-transform", open && "rotate-90")} />
                  </button>
                </td>
                <td className="px-3 py-2 max-w-0 w-full">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="hidden sm:block h-9 w-14 shrink-0 rounded-md bg-cover bg-center ring-1 ring-white/10"
                      style={{ backgroundImage: `url(${getInstanceBackground(r.name)})` }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Link to={instanceHref(r)} target="_blank" rel="noopener noreferrer" className="block min-w-0 font-medium text-foreground truncate group-hover:underline">
                          {r.name}
                        </Link>
                        {r.invalidated_at && (
                          <span
                            title={r.invalid_reason ? `Invalid: ${r.invalid_reason}` : "Invalid run"}
                            className="inline-flex shrink-0 items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-300 ring-1 ring-red-500/25"
                          >
                            <AlertTriangle className="h-3 w-3" /> Invalid
                          </span>
                        )}
                      </div>
                      <div className="text-2xs text-muted-foreground truncate">
                        {r.realm_name}
                        {r.max_players ? ` · ${r.max_players}-player` : ""}
                        {r.difficulty_name ? ` · ${r.difficulty_name}` : ""}
                        <span className="sm:hidden">
                          {r.guild_name ? ` · ${r.guild_name}` : ""} · {relativeDate(r.started_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 hidden sm:table-cell whitespace-nowrap">
                  {r.guild_id && r.guild_name ? (
                    <Link to={`/g/${r.guild_id}`} target="_blank" rel="noopener noreferrer" className="text-foreground/90 hover:underline">
                      {r.guild_name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground/60 text-xs">No guild</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    {full && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-label="Full clear" />}
                    <span className={cn("tabular-nums text-xs", full ? "text-emerald-300" : "text-foreground/90")}>
                      {r.bosses_killed}
                      {total ? <span className="text-muted-foreground">/{total}</span> : null}
                    </span>
                  </div>
                  {total ? (
                    <div className="mt-1 h-1 w-16 rounded-full bg-zinc-800 overflow-hidden">
                      <div className={cn("h-full rounded-full", full ? "bg-emerald-400/80" : "bg-primary/70")} style={{ width: `${pct * 100}%` }} />
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-xs text-foreground/90 hidden md:table-cell whitespace-nowrap">{r.player_count}</td>
                <td className="px-3 py-2 text-right tabular-nums text-xs hidden md:table-cell whitespace-nowrap">
                  {r.clear_time_ms != null ? <span className="text-foreground/90">{formatMinutes(r.clear_time_ms)}</span> : <span className="text-muted-foreground/50">—</span>}
                </td>
                {extraColumn && (
                  <td className="px-3 py-2 text-right tabular-nums text-xs whitespace-nowrap">
                    {formatSortValue(sort.field, r.sort_value) ?? <span className="text-muted-foreground/50">—</span>}
                  </td>
                )}
                <td className="px-3 py-2 text-right whitespace-nowrap hidden sm:table-cell" title={new Date(r.started_at).toLocaleString()}>
                  <div className="text-xs text-foreground/90">{relativeDate(r.started_at)}</div>
                  <div className="text-2xs text-muted-foreground tabular-nums">
                    {new Date(r.started_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </div>
                </td>
              </tr>
              {open && (
                <tr className="bg-primary-darker/20">
                  <td />
                  <td colSpan={extraColumn ? 7 : 6} className="px-3 pt-1 pb-3">
                    <p className="text-2xs uppercase tracking-wider text-muted-foreground mb-1.5">Why it matched</p>
                    <EvidencePanel tree={tree} instanceId={r.id} realmName={r.realm_name} onBudget={onBudget} />
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
