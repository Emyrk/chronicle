import { useMemo } from "react"
import { CircleHelp } from "lucide-react"
import { Link } from "react-router-dom"
import type { RankingsFilterClass } from "@/api/typesGenerated"
import {
  HintTooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip/tooltip"
import { serverCapabilities } from "@/config/serverCapabilities"
import { cn } from "@/lib/utils"
import { ALL_DPS_CLASSES, CLASS_CSS_VAR, CLASS_DISPLAY, CLASS_NAME_TO_ID } from "./classDisplay"

interface ClassSpecFilterProps {
  selectedClass: string | null
  selectedSpec: string | null
  selectedSubSpec: string | null
  options: readonly RankingsFilterClass[]
  onClassSelect: (cls: string | null) => void
  onSpecSelect: (spec: string | null) => void
  onSubSpecSelect: (subSpec: string | null) => void
}

export function ClassSpecFilter({
  selectedClass,
  selectedSpec,
  selectedSubSpec,
  options,
  onClassSelect,
  onSpecSelect,
  onSubSpecSelect,
}: ClassSpecFilterProps) {
  const specs = selectedClass ? options.find((option) => option.player_class === selectedClass)?.specs : undefined
  const subSpecs = specs?.find((spec) => spec.spec === selectedSpec)?.sub_specs ?? []

  const visibleClasses = useMemo(() => {
    const classIds = serverCapabilities.talentCalculator?.classIds
    if (!classIds) return ALL_DPS_CLASSES
    const idSet = new Set(classIds)
    return ALL_DPS_CLASSES.filter((cls) => {
      const id = CLASS_NAME_TO_ID[cls]
      return id !== undefined && idSet.has(id)
    })
  }, [])

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {/* Class buttons */}
      <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pb-2 styled-scrollbar sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        {visibleClasses.map((cls) => {
          const active = selectedClass === cls
          const color = CLASS_CSS_VAR[cls]
          return (
            <button
              key={cls}
              onClick={() => onClassSelect(active ? null : cls)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-all sm:px-2 sm:py-1",
                active
                  ? "border-white/25 bg-white/10 text-foreground"
                  : selectedClass
                    ? "border-transparent opacity-35 hover:opacity-60"
                    : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5",
              )}
              style={active ? { borderColor: color } : undefined}
            >
              <img
                src={`/c/icons/class_${cls.toLowerCase()}.png`}
                alt={CLASS_DISPLAY[cls]}
                className="h-4 w-4"
                onError={(e) => { e.currentTarget.src = "/c/icons/class_unknown.png" }}
              />
              <span>{CLASS_DISPLAY[cls]}</span>
            </button>
          )
        })}
      </div>

      {/* Spec sub-buttons (shown when a class is selected) */}
      {selectedClass && specs && (
        <div className="-mx-3 flex items-center gap-1 overflow-x-auto px-3 pb-2 styled-scrollbar sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-1 sm:pb-0">
          <button
            onClick={() => onSpecSelect(null)}
            className={cn(
              "shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors sm:px-2 sm:py-0.5",
              !selectedSpec
                ? "border-[#5F8FA6] bg-[#5F8FA6]/20 text-foreground"
                : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5",
            )}
          >
            All Specs
          </button>
          {specs.map((specOption) => {
            const spec = specOption.spec
            const active = selectedSpec === spec
            return (
              <button
                key={spec}
                onClick={() => onSpecSelect(active ? null : spec)}
                className={cn(
                  "shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors sm:px-2 sm:py-0.5",
                  active
                    ? "border-[#5F8FA6] bg-[#5F8FA6]/20 text-foreground"
                    : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5",
                )}
              >
                {spec}
              </button>
            )
          })}
        </div>
      )}
      {selectedSpec && subSpecs.length > 0 && (
        <div className="-mx-3 flex items-center gap-1 overflow-x-auto px-3 pb-2 styled-scrollbar sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-1 sm:pb-0">
          <HintTooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="What are subspecs?"
                className="mr-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/25 text-muted-foreground transition-colors hover:border-white/20 hover:bg-black/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5F8FA6]"
              >
                <CircleHelp className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              sideOffset={6}
              hideArrow
              className="max-w-72 border border-white/10 bg-zinc-950 px-3.5 py-3 text-zinc-100 shadow-xl shadow-black/40"
            >
              <p className="leading-relaxed text-zinc-300">
                Subspecs split some specializations into more precise ranking cohorts using detected
                talent builds.
              </p>
              <Link
                to="/subspecs"
                className="mt-2 inline-flex font-semibold text-orange-300 underline decoration-orange-300/40 underline-offset-2 transition-colors hover:text-orange-200"
              >
                Learn how subspecs work
              </Link>
            </TooltipContent>
          </HintTooltip>
          {subSpecs.map((subSpec) => {
            const active = selectedSubSpec === subSpec
            return (
              <button
                key={subSpec}
                onClick={() => onSubSpecSelect(active ? null : subSpec)}
                className={cn(
                  "shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors sm:px-2 sm:py-0.5",
                  active
                    ? "border-[#5F8FA6] bg-[#5F8FA6]/20 text-foreground"
                    : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5",
                )}
              >
                {subSpec}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
