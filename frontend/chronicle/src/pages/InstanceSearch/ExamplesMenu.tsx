import { Lightbulb } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import { Button } from "@/components/ui/button";
import type { SearchExample } from "./examples";
import { EXAMPLES } from "./examples";

/**
 * Menu of example searches, grouped by category. Picking one loads it into
 * the block editor so people can see how a query is built and tweak it.
 */
export function ExamplesMenu({ onPick, disabled }: { onPick: (ex: SearchExample) => void; disabled?: boolean }) {
  const categories = [...new Set(EXAMPLES.map((e) => e.category))];
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          title={disabled ? "Log in to try example searches" : "Load an example search into the block editor"}
        >
          <Lightbulb className="h-3.5 w-3.5" />
          Examples
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 max-h-[70vh] overflow-y-auto styled-scrollbar">
        {categories.map((cat, i) => (
          <DropdownMenuGroup key={cat}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-2xs uppercase tracking-wider text-muted-foreground">{cat}</DropdownMenuLabel>
            {EXAMPLES.filter((e) => e.category === cat).map((ex) => (
              <DropdownMenuItem key={ex.id} onSelect={() => onPick(ex)} className="flex-col items-start gap-0.5">
                <span className="text-xs font-medium">{ex.title}</span>
                <span className="text-2xs text-muted-foreground whitespace-normal leading-snug">{ex.description}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
