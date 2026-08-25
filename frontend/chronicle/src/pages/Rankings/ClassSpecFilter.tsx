import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { serverCapabilities } from "@/config/serverCapabilities"
import { ALL_DPS_CLASSES, CLASS_CSS_VAR, CLASS_DISPLAY, CLASS_NAME_TO_ID, SPEC_BY_CLASS } from "./classDisplay"

interface ClassSpecFilterProps {
  selectedClass: string | null
  selectedSpec: string | null
  onClassSelect: (cls: string | null) => void
  onSpecSelect: (spec: string | null) => void
}

export function ClassSpecFilter({
  selectedClass,
  selectedSpec,
  onClassSelect,
  onSpecSelect,
}: ClassSpecFilterProps) {
  const specs = selectedClass ? SPEC_BY_CLASS[selectedClass] : undefined

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
          {specs.map((spec) => {
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
    </div>
  )
}
