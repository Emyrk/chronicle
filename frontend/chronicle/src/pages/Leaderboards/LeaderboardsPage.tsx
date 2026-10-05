import { Link, Navigate, useSearchParams } from "react-router-dom"
import { RankingsLanding } from "../Rankings/RankingsLanding"
import { InstanceView } from "../Rankings/InstanceView"
import { SpeedrunLeaderboard } from "../Leaderboard/SpeedrunLeaderboard"
import { Swords, Timer } from "lucide-react"
import { AdSlot } from "../../components/Ads/AdSlot"
import {
  leaderboardsModeTarget,
  legacyLeaderboardsTarget,
  supportsSpeedruns,
  type LeaderboardsMode,
} from "./leaderboardsState"

export function LeaderboardsPage({ mode }: { mode: LeaderboardsMode }) {
  const [params] = useSearchParams()
  const instance = params.get("instance")
  const speedrunsVisible = supportsSpeedruns(instance)
  const statisticsActive = mode === "statistics"

  if (!statisticsActive && !speedrunsVisible) {
    return <Navigate to={leaderboardsModeTarget("statistics", params)} replace />
  }

  const statisticsTarget = leaderboardsModeTarget("statistics", params)
  const speedrunsTarget = leaderboardsModeTarget("speedruns", params)

  // If an instance is selected, show the tabbed detail view
  if (instance) {
    return (
      <div className="w-full">
        {/* Tab bar */}
        <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
          <div className="container mx-auto px-2 sm:px-4">
            <div className="flex w-full items-center gap-1 sm:w-auto">
              <TabButton
                active={statisticsActive}
                to={statisticsTarget}
                icon={<Swords className="h-4 w-4" />}
                label="Statistics"
              />
              {speedrunsVisible && (
                <TabButton
                  active={!statisticsActive}
                  to={speedrunsTarget}
                  icon={<Timer className="h-4 w-4" />}
                  label="Speedruns"
                />
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-[1800px] gap-6 px-3 py-4 sm:px-4 sm:py-8">
          <div className="min-w-0 flex-1">
            {statisticsActive ? (
              <InstanceView instanceName={instance} />
            ) : (
              <SpeedrunLeaderboard overrideInstance={instance} />
            )}
          </div>
          <AdSlot placement="leaderboards-right-rail" format="rail" />
        </div>
      </div>
    )
  }

  // No instance selected — show the landing page
  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-8">
      {/* Tab bar for landing */}
      <div className="flex items-center gap-1 border-b mb-6">
        <TabButton
          active={statisticsActive}
          to={statisticsTarget}
          icon={<Swords className="h-4 w-4" />}
          label="Statistics"
        />
        <TabButton
          active={!statisticsActive}
          to={speedrunsTarget}
          icon={<Timer className="h-4 w-4" />}
          label="Speedruns"
        />
      </div>

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          {statisticsActive ? (
            <RankingsLanding />
          ) : (
            <SpeedrunLeaderboard />
          )}
        </div>
        <AdSlot placement="leaderboards-right-rail" format="rail" />
      </div>
    </div>
  )
}

function TabButton({
  active,
  to,
  icon,
  label,
}: {
  active: boolean
  to: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <Link
      to={to}
      className={`flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors sm:flex-none sm:px-4 ${
        active
          ? "border-[#5F8FA6] text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
      }`}
    >
      {icon}
      {label}
    </Link>
  )
}

/** Redirects query-driven and singular legacy leaderboard URLs. */
export function LegacyLeaderboardsRedirect() {
  const [params] = useSearchParams()
  return <Navigate to={legacyLeaderboardsTarget(params)} replace />
}
