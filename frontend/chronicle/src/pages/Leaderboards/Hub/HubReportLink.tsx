import { Flag } from "lucide-react"
import { cn } from "@/lib/utils"
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip"

const DISCORD_URL = "https://discord.gg/gz97ABFVAj"

/** A flag beside the ratings help link inviting players to report results that look wrong. */
export function HubReportLink({ className }: { className?: string }) {
  return (
    <HintTooltip>
      <TooltipTrigger asChild>
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Report an incorrect result on Discord"
          className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground", className)}
        >
          <Flag className="size-5" />
        </a>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64 text-center">
        See a result that looks wrong? Most are logging or parsing mistakes, not cheating, and they can be fixed. Click to report it on Discord with a link to the log.
      </TooltipContent>
    </HintTooltip>
  )
}
