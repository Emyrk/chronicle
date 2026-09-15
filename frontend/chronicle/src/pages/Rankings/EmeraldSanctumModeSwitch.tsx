import { Leaf, Swords } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { EmeraldSanctumMode } from "./emeraldSanctumState"

const OPTIONS: Array<{
  value: EmeraldSanctumMode
  label: string
  icon: typeof Leaf
}> = [
  { value: "normal", label: "Normal", icon: Leaf },
  { value: "hard", label: "Hard Mode", icon: Swords },
]

export function EmeraldSanctumModeSwitch({
  value,
  onChange,
  className,
}: {
  value: EmeraldSanctumMode
  onChange: (value: EmeraldSanctumMode) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "inline-flex h-7 w-fit items-center gap-0.5 rounded-md border border-border/70 bg-background/55 p-0.5 backdrop-blur-sm",
        className,
      )}
      role="group"
      aria-label="Emerald Sanctum mode"
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon
        const selected = value === option.value
        return (
          <Button
            key={option.value}
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
            onClick={() => onChange(option.value)}
            title={option.value === "hard" ? "Solnius (Hard Mode)" : "Erennius and Solnius"}
          >
            <Icon className="h-3 w-3" />
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}
