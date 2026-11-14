import { Flag } from "lucide-react"

const DISCORD_URL = "https://discord.gg/gz97ABFVAj"

// A quiet one-line note above the boards inviting players to report results that look wrong.
// Leaderboard layouts fill at least a screen, so a note below them lands out of sight.
export function LeaderboardReportNotice() {
  return (
    <p className="mx-auto flex w-full max-w-[1920px] items-start gap-2 px-3 pt-2 text-xs text-muted-foreground sm:px-4">
      <Flag aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>
        See a result that looks wrong? Most are logging or parsing mistakes, not cheating, and they can be fixed.{" "}
        <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
          Report it on Discord
        </a>{" "}
        with a link to the log.
      </span>
    </p>
  )
}
