import { useState } from "react"
import { ChevronDown, ChevronRight, Skull, Trophy } from "lucide-react"
import { cn } from "@/lib/utils"
import type { InstanceInfo } from "./mockData"
import { INSTANCES } from "./mockData"

interface BossBrowserProps {
  onSelectBoss: (bossId: string) => void
}

export function BossBrowser({ onSelectBoss }: BossBrowserProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <Trophy className="h-6 w-6 text-[#5F8FA6]" />
          <h1 className="text-2xl font-bold">Performance Rankings</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Compare player performance across all recorded boss encounters
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {INSTANCES.map((inst) => (
          <InstanceCard
            key={inst.name}
            instance={inst}
            isExpanded={expanded === inst.name}
            onToggle={() => setExpanded(expanded === inst.name ? null : inst.name)}
            onSelectBoss={onSelectBoss}
          />
        ))}
      </div>
    </div>
  )
}

// ── Instance Card ──────────────────────────────────────────────────────────

interface InstanceCardProps {
  instance: InstanceInfo
  isExpanded: boolean
  onToggle: () => void
  onSelectBoss: (bossId: string) => void
}

function InstanceCard({ instance, isExpanded, onToggle, onSelectBoss }: InstanceCardProps) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden transition-colors">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/30 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-medium">{instance.name}</div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
            <span>{instance.bosses.length} bosses</span>
            <span>{instance.totalRecords.toLocaleString()} records</span>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t">
          {instance.bosses.map((boss, i) => (
            <button
              key={boss.id}
              onClick={() => onSelectBoss(boss.id)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/40",
                i % 2 === 1 && "bg-muted/10",
              )}
            >
              <Skull className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1">{boss.name}</span>
              <span className="text-xs text-muted-foreground">
                {boss.totalKills} kills
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
