import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { ParsePill } from "./CohortChrome";

const PAGE_SIZE = 50;

export interface CohortTableRow {
  key: string;
  rank: number;
  name: ReactNode;
  value: string;
  score: number;
  /** Gap to the cohort's best value, already formatted. */
  delta: string;
  killedAt: string;
  logSlug?: string;
  highlighted?: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Ranked cohort table, shown 50 rows at a time. Highlighted rows always show. */
export function CohortTable({
  rows,
  nameHeader,
  valueHeader,
  deltaHeader,
}: {
  rows: readonly CohortTableRow[];
  nameHeader: string;
  valueHeader: string;
  deltaHeader: string;
}) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const visible = rows.filter((row, index) => index < limit || row.highlighted);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="styled-scrollbar overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="w-14 px-4 py-2.5 font-medium">#</th>
              <th className="px-3 py-2.5 font-medium">{nameHeader}</th>
              <th className="px-3 py-2.5 text-right font-medium">{valueHeader}</th>
              <th className="w-20 px-3 py-2.5 text-center font-medium">Parse</th>
              <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">{deltaHeader}</th>
              <th className="hidden px-3 py-2.5 font-medium md:table-cell">Date</th>
              <th className="w-12 px-3 py-2.5" aria-label="Log" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.key}
                className={cn(
                  "border-b border-border/50 last:border-b-0 hover:bg-muted/20",
                  row.highlighted && "bg-primary/10 hover:bg-primary/15",
                )}
              >
                <td className="px-4 py-2 font-mono text-xs tabular-nums text-muted-foreground">{row.rank}</td>
                <td className="max-w-[16rem] truncate px-3 py-2">{row.name}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{row.value}</td>
                <td className="px-3 py-2 text-center">
                  <ParsePill score={row.score} />
                </td>
                <td className="hidden px-3 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground sm:table-cell">
                  {row.delta}
                </td>
                <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">{formatDate(row.killedAt)}</td>
                <td className="px-3 py-2">
                  {row.logSlug && (
                    <Link
                      to={`/instances/${row.logSlug}`}
                      className="inline-flex text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Open log"
                    >
                      <ExternalLink className="size-3.5" />
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <div className="border-t border-border px-4 py-2.5 text-center">
          <button
            type="button"
            onClick={() => setLimit((current) => current + PAGE_SIZE * 4)}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Show more ({(rows.length - limit).toLocaleString()} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
