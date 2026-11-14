import { Flag } from "lucide-react"

const DISCORD_URL = "https://discord.gg/gz97ABFVAj"

// A quiet note under the boards inviting players to report results that look wrong.
export function LeaderboardReportNotice() {
  return (
    <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
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
