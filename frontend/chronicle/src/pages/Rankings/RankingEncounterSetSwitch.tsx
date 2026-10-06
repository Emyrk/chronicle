import { Leaf, Swords } from "lucide-react"
import type { RankingEncounterSet } from "@/api/typesGenerated"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function RankingEncounterSetSwitch({
  sets,
  value,
  onChange,
  className,
}: {
  sets: readonly RankingEncounterSet[]
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "inline-flex h-7 w-fit items-center gap-0.5 rounded-md border border-border/70 bg-background/55 p-0.5 backdrop-blur-sm",
        className,
      )}
      role="group"
      aria-label="Ranking encounter set"
    >
      {sets.map((set, index) => {
        const Icon = index === 0 ? Leaf : Swords
        const selected = value === set.id
        return (
          <Button
            key={set.id}
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-full flex-1 gap-1 rounded px-2 text-[11px] sm:flex-none",
              selected
                ? "bg-emerald-500/20 text-emerald-100 shadow-sm hover:bg-emerald-500/20"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={selected}
            onClick={() => onChange(set.id)}
            title={set.encounters.join(" and ")}
          >
            <Icon className="h-3 w-3" />
            {set.label}
          </Button>
        )
      })}
    </div>
  )
}
