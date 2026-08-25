import { useSearchParams, Navigate } from "react-router-dom"
import { RankingsLanding } from "../Rankings/RankingsLanding"
import { InstanceView } from "../Rankings/InstanceView"
import { SpeedrunLeaderboard } from "../Leaderboard/SpeedrunLeaderboard"
import { Swords, Timer } from "lucide-react"

type Tab = "dps" | "speedrun"

function isTab(v: string | null): v is Tab {
  return v === "dps" || v === "speedrun"
}

export function LeaderboardsPage() {
  const [params, setParams] = useSearchParams()
  const instance = params.get("instance")
  const rawTab = params.get("tab")
  const tab: Tab = isTab(rawTab) ? rawTab : "dps"

  const setTab = (t: Tab) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (t === "dps") {
        next.delete("tab")
      } else {
        next.set("tab", t)
      }
      return next
    })
  }

  // If an instance is selected, show the tabbed detail view
  if (instance) {
    return (
      <div className="w-full">
        {/* Tab bar */}
        <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
          <div className="container mx-auto px-2 sm:px-4">
            <div className="flex w-full items-center gap-1 sm:w-auto">
              <TabButton
                active={tab === "dps"}
                onClick={() => setTab("dps")}
                icon={<Swords className="h-4 w-4" />}
                label="Statistics"
              />
              <TabButton
                active={tab === "speedrun"}
                onClick={() => setTab("speedrun")}
                icon={<Timer className="h-4 w-4" />}
                label="Speedruns"
              />
            </div>
          </div>
        </div>

        {tab === "dps" ? (
          <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-8">
            <InstanceView instanceName={instance} />
          </div>
        ) : (
          <SpeedrunLeaderboard overrideInstance={instance} />
        )}
      </div>
    )
  }

  // No instance selected — show the landing page
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Tab bar for landing */}
      <div className="flex items-center gap-1 border-b mb-6">
        <TabButton
          active={tab === "dps"}
          onClick={() => setTab("dps")}
          icon={<Swords className="h-4 w-4" />}
          label="Statistics"
        />
        <TabButton
          active={tab === "speedrun"}
          onClick={() => setTab("speedrun")}
          icon={<Timer className="h-4 w-4" />}
          label="Speedruns"
        />
      </div>

      {tab === "dps" ? (
        <RankingsLanding />
      ) : (
        <SpeedrunLeaderboard />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors sm:flex-none sm:px-4 ${
        active
          ? "border-[#5F8FA6] text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

/** Redirect from old /leaderboard and /rankings routes */
export function LeaderboardRedirect() {
  const [params] = useSearchParams()
  const instance = params.get("instance")
  const target = instance
    ? `/leaderboards?instance=${encodeURIComponent(instance)}`
    : "/leaderboards"
  return <Navigate to={target} replace />
}

export function RankingsRedirect() {
  const [params] = useSearchParams()
  const instance = params.get("instance")
  const target = instance
    ? `/leaderboards?instance=${encodeURIComponent(instance)}`
    : "/leaderboards"
  return <Navigate to={target} replace />
}

export function SpeedrunRedirect() {
  const [params] = useSearchParams()
  const instance = params.get("instance")
  const target = instance
    ? `/leaderboards?instance=${encodeURIComponent(instance)}&tab=speedrun`
    : "/leaderboards?tab=speedrun"
  return <Navigate to={target} replace />
}
