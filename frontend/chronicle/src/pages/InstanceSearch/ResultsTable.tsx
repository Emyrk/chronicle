import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, SearchX } from "lucide-react";
import type { InstanceSearchResult } from "@/api/typesGenerated";
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages";
import { cn } from "@/lib/utils";
import { formatMinutes } from "./summary";

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

function instanceHref(r: InstanceSearchResult): string {
  return `/instances/${r.slug || r.id}`;
}

/**
 * Search results: zone art, guild, boss progress, players, clear time and
 * date. Whole rows are clickable.
 */
export function ResultsTable({
  rows,
  loading,
  bossCounts,
}: {
  rows: InstanceSearchResult[];
  loading: boolean;
  /** Total bosses per zone name, for "8/10". */
  bossCounts: Map<string, number>;
}) {
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
            <th className="text-left px-3 py-2 font-medium">Run</th>
            <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Guild</th>
            <th className="text-left px-3 py-2 font-medium">Bosses</th>
            <th className="text-right px-3 py-2 font-medium hidden md:table-cell">Players</th>
            <th className="text-right px-3 py-2 font-medium hidden md:table-cell min-w-[6rem] whitespace-nowrap">Clear</th>
            <th className="text-right px-3 py-2 font-medium hidden sm:table-cell">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {rows.map((r) => {
            const total = bossCounts.get(r.name);
            const full = total != null && total > 0 && r.bosses_killed >= total;
            const pct = total ? Math.min(1, r.bosses_killed / total) : 0;
            return (
              <tr
                key={r.id}
                onClick={(e) => {
                  // Rows open the run in a new tab so the results stay put.
                  // Real links already open in a new tab themselves.
                  if ((e.target as HTMLElement).closest("a")) return;
                  window.open(instanceHref(r), "_blank", "noopener,noreferrer");
                }}
                className="group cursor-pointer hover:bg-primary-darker/40 transition-colors"
              >
                <td className="px-3 py-2 max-w-0 w-full">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="hidden sm:block h-9 w-14 shrink-0 rounded-md bg-cover bg-center ring-1 ring-white/10"
                      style={{ backgroundImage: `url(${getInstanceBackground(r.name)})` }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <Link to={instanceHref(r)} target="_blank" rel="noopener noreferrer" className="block font-medium text-foreground truncate group-hover:underline">
                        {r.name}
                      </Link>
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
                <td className="px-3 py-2 text-right whitespace-nowrap hidden sm:table-cell" title={new Date(r.started_at).toLocaleString()}>
                  <div className="text-xs text-foreground/90">{relativeDate(r.started_at)}</div>
                  <div className="text-2xs text-muted-foreground tabular-nums">
                    {new Date(r.started_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
