import { Pencil, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Node } from "./queryModel";
import { summarize } from "./summary";

/**
 * The submitted search, collapsed into one compact bar of chips so the
 * results get the space. "Edit" re-expands the builder.
 */
export function SearchSummary({
  tree,
  resultLabel,
  onEdit,
  onNew,
}: {
  tree: Node | undefined;
  resultLabel: string;
  onEdit: () => void;
  onNew: () => void;
}) {
  const chips = summarize(tree);
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 flex items-start gap-3">
      <Search className="h-4 w-4 text-primary shrink-0 mt-1" />
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
        {chips.length === 0 ? (
          <span className="text-xs text-muted-foreground">All runs</span>
        ) : (
          chips.map((c, i) => (
            <span
              key={i}
              title={c}
              className="max-w-full sm:max-w-[28rem] truncate rounded-md bg-zinc-800/70 ring-1 ring-white/5 px-2 py-0.5 text-2xs text-zinc-200"
            >
              {c}
            </span>
          ))
        )}
        <span className="text-2xs text-muted-foreground ml-1">{resultLabel}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={onNew} title="Start a new search">
          <RotateCcw className="h-3.5 w-3.5" /> New
        </Button>
      </div>
    </div>
  );
}
