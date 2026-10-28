import type { ReactNode } from "react"
import { Skull, Swords, Timer, Users } from "lucide-react"
import type { SpeedrunRequirement, SupportedInstanceSpeedrunRules } from "@/api/typesGenerated"
import { cn } from "@/lib/utils"
import { formatLevelRange } from "./damageRuleRows"

const TONES = {
  boss: { tile: "border-red-500/25 from-red-500/15", icon: "bg-red-500/20 text-red-300", badge: "bg-red-500/15 text-red-300 ring-red-500/30" },
  trash: { tile: "border-amber-500/25 from-amber-500/15", icon: "bg-amber-500/20 text-amber-300", badge: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  level: { tile: "border-sky-500/25 from-sky-500/15", icon: "bg-sky-500/20 text-sky-300", badge: "" },
  timer: { tile: "border-emerald-500/25 from-emerald-500/15", icon: "bg-emerald-500/20 text-emerald-300", badge: "" },
} as const

type Tone = keyof typeof TONES

function Stat({ tone, icon, label, value }: { tone: Tone; icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-lg border bg-gradient-to-br to-transparent px-3 py-3", TONES[tone].tile)}>
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", TONES[tone].icon)}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="break-words text-xl font-bold leading-tight">{value}</div>
      </div>
    </div>
  )
}

function RequirementList({ tone, label, requirements }: { tone: Tone; label: string; requirements: readonly SpeedrunRequirement[] }) {
  if (requirements.length === 0) return null
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h3>
      <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {requirements.map((requirement, index) => (
          <li
            key={`${requirement.name}-${requirement.entry_ids.join(",")}`}
            className="flex items-center gap-2.5 rounded-md bg-muted/30 px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
            title={`Creature IDs: ${requirement.entry_ids.join(", ")}`}
          >
            <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1", TONES[tone].badge)}>
              {index + 1}
            </span>
            <span className="truncate font-medium">{requirement.name}</span>
            {requirement.count > 1 && (
              <span className={cn("ml-auto shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-semibold ring-1", TONES[tone].badge)}>
                ×{requirement.count}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

export function SpeedrunRequirements({ rules }: { rules: SupportedInstanceSpeedrunRules }) {
  const bosses = rules.requirements.filter((requirement) => requirement.category === "Bosses")
  const trash = rules.requirements.filter((requirement) => requirement.category === "Trash")
  const trashKills = trash.reduce((sum, requirement) => sum + requirement.count, 0)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Stat tone="boss" icon={<Skull className="h-4 w-4" />} label="Bosses" value={bosses.length} />
        <Stat tone="trash" icon={<Swords className="h-4 w-4" />} label="Trash kills" value={trashKills || "None"} />
        <Stat tone="level" icon={<Users className="h-4 w-4" />} label="Player level" value={formatLevelRange(rules.level_range)} />
        <Stat
          tone="timer"
          icon={<Timer className="h-4 w-4" />}
          label="Timer starts"
          value={rules.ranked_start_after_requirement ? `After ${rules.ranked_start_after_requirement}` : "First pull"}
        />
      </div>
      <RequirementList tone="boss" label="Required bosses" requirements={bosses} />
      <RequirementList tone="trash" label="Required trash" requirements={trash} />
    </div>
  )
}
