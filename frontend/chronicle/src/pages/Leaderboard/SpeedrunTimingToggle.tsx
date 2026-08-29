import { HelpCircle } from "lucide-react"
import { Link } from "react-router-dom"
import type { SpeedrunTimingMode } from "./speedrunTimingPreference"

export function SpeedrunTimingToggle({
  value,
  onChange,
}: {
  value: SpeedrunTimingMode
  onChange: (value: SpeedrunTimingMode) => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <div className="flex overflow-hidden rounded-lg border border-white/10" aria-label="Leaderboard timing">
        {([
          { label: "Full raid", value: "full", title: "Rank by the full raid clear time" },
          { label: "Boss time", value: "ranked", title: "Rank by the first required boss pull through the final required boss" },
        ] as const).map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              value === option.value
                ? "bg-[#5F8FA6] text-white"
                : "bg-black/30 text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <Link
        to="/speedrunning"
        aria-label="Learn how speedrun timing works"
        title="Learn how speedrun timing works"
        className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
      >
        <HelpCircle className="h-4 w-4" />
      </Link>
    </div>
  )
}
