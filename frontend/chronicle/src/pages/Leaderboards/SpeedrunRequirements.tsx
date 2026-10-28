import type { ReactNode } from "react"
import { Skull, Swords, Timer, Users } from "lucide-react"
import type { SpeedrunRequirement, SupportedInstanceSpeedrunRules } from "@/api/typesGenerated"
import { formatLevelRange } from "./damageRuleRows"

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 break-words text-lg font-semibold leading-tight">{value}</div>
    </div>
  )
}

function RequirementList({ label, requirements }: { label: string; requirements: readonly SpeedrunRequirement[] }) {
  if (requirements.length === 0) return null
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h3>
      <ol className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 xl:grid-cols-3">
        {requirements.map((requirement, index) => (
          <li
            key={`${requirement.name}-${requirement.entry_ids.join(",")}`}
            className="flex items-center gap-2.5 border-b border-border/50 py-1.5 text-sm"
            title={`Creature IDs: ${requirement.entry_ids.join(", ")}`}
          >
            <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground/70">{index + 1}</span>
            <span className="truncate">{requirement.name}</span>
            {requirement.count > 1 && (
              <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">×{requirement.count}</span>
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
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat icon={<Skull className="h-3 w-3" />} label="Bosses" value={bosses.length} />
        <Stat icon={<Swords className="h-3 w-3" />} label="Trash kills" value={trashKills || "None"} />
        <Stat icon={<Users className="h-3 w-3" />} label="Player level" value={formatLevelRange(rules.level_range)} />
        <Stat
          icon={<Timer className="h-3 w-3" />}
          label="Timer starts"
          value={rules.ranked_start_after_requirement ? `After ${rules.ranked_start_after_requirement}` : "First pull"}
        />
      </div>
      <RequirementList label="Required bosses" requirements={bosses} />
      <RequirementList label="Required trash" requirements={trash} />
    </div>
  )
}
