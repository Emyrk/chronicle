import { History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import { decodeQuery } from "./queryModel";
import type { RecentSearch } from "./recentSearches";
import { summarize } from "./summary";

function ago(at: number): string {
  const mins = Math.floor((Date.now() - at) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** The last searches run in this browser, to load back in with one click. */
export function RecentSearchesMenu({ recent, onPick, onClear }: { recent: RecentSearch[]; onPick: (r: RecentSearch) => void; onClear: () => void }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled={recent.length === 0} title="Searches you ran recently in this browser">
          <History className="h-3.5 w-3.5" />
          Recent
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[70vh] overflow-y-auto styled-scrollbar">
        <DropdownMenuLabel className="text-2xs uppercase tracking-wider text-muted-foreground">Recent searches</DropdownMenuLabel>
        {recent.map((r) => {
          const parts = summarize(decodeQuery(r.q));
          return (
            <DropdownMenuItem key={r.q} onSelect={() => onPick(r)} className="flex flex-col items-start gap-0.5">
              <span className="text-xs text-foreground line-clamp-2">{parts.length ? parts.join(" · ") : "All runs"}</span>
              <span className="text-2xs text-muted-foreground">
                {ago(r.at)}
                {r.mode !== "form" ? ` · ${r.mode}` : ""}
              </span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onClear} className="text-xs text-muted-foreground">
          <Trash2 className="h-3.5 w-3.5" /> Clear history
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
