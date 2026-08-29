import type { SpeedrunTimingMode } from "./speedrunTimingPreference"

export function SpeedrunTimingToggle({
  value,
  onChange,
}: {
  value: SpeedrunTimingMode
  onChange: (value: SpeedrunTimingMode) => void
}) {
  return (
    <div className="flex rounded-lg border border-white/10 overflow-hidden shrink-0" aria-label="Leaderboard timing">
      {([
        { label: "Ranked time", value: "ranked", title: "Rank by the first required boss pull through the final required boss" },
        { label: "Full clear", value: "full", title: "Rank by the full raid clear time" },
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
  )
}
