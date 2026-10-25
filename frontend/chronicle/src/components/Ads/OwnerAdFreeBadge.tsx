import { Link } from "react-router-dom"
import { Sparkles } from "lucide-react"
import { useSession } from "@/api/queries"
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip"
import { shouldShowAdPreview } from "./adPreview"
import { useAdsSuppressed } from "./adSuppression"
import { useAdSiteConfig } from "./useAdSiteConfig"

/**
 * Credits the page owner when their supporter status hides ads for everyone.
 * Only shown to viewers who would otherwise see ads.
 */
export function OwnerAdFreeBadge({ subject }: { subject: "log" | "character" }) {
  const ownerAdsFree = useAdsSuppressed()
  const adSiteConfig = useAdSiteConfig()
  const { data: session, isLoading } = useSession()

  // Local ad previews render placeholder slots without ads_enabled, so mirror them here.
  const adsShown =
    adSiteConfig?.ads_enabled === true ||
    shouldShowAdPreview(window.location.hostname, import.meta.env.DEV && import.meta.env.CHRONICLE_PREVIEW_ADS)

  if (!ownerAdsFree || !adsShown || isLoading || session?.ads_free) {
    return null
  }

  return (
    <HintTooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help items-center gap-1 rounded-full border border-lime-500/30 bg-lime-500/10 px-2 py-0.5 text-xs font-medium text-lime-300">
          <Sparkles className="h-3 w-3" /> Ad-free
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" sideOffset={6} className="max-w-xs p-3 normal-case tracking-normal">
        <p className="text-sm text-zinc-200">
          The owner of this {subject} supports Chronicle, so this page is ad-free for everyone who views it.
        </p>
        <Link to="/supporter" className="mt-2 inline-block text-xs font-medium text-lime-300 hover:underline">
          Become a supporter
        </Link>
      </TooltipContent>
    </HintTooltip>
  )
}
