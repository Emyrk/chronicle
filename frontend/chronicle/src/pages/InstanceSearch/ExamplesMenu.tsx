import { Lightbulb, Lock } from "lucide-react";
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
import { HonoredLockTooltip } from "./HonoredLockTooltip";
import { TIER_COLOR } from "@/pages/Settings/billingPricing";
import type { SearchExample } from "./examples";
import { EXAMPLES } from "./examples";

/**
 * Menu of example searches, grouped by category. Picking one loads it into
 * the block or code editor so people can see how a query is built and tweak
 * it. When locked (not Honored) the button shows a lock and calls onLocked.
 */
export function ExamplesMenu({ onPick, locked, onLocked }: { onPick: (ex: SearchExample) => void; locked?: boolean; onLocked?: () => void }) {
  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 gap-1.5 text-xs"
      onClick={locked ? onLocked : undefined}
      title={locked ? undefined : "Load an example search into the editor"}
    >
      <Lightbulb className="h-3.5 w-3.5" />
      Examples
      {locked && <Lock className="h-3 w-3" style={{ color: TIER_COLOR.honored }} aria-label="Honored" />}
    </Button>
  );
  if (locked) return <HonoredLockTooltip highlight="examples">{trigger}</HonoredLockTooltip>;

  const categories = [...new Set(EXAMPLES.map((e) => e.category))];
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
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
