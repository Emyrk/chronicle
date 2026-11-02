import { Link } from "react-router-dom"
import { Sparkles } from "lucide-react"
import { useSession } from "@/api/queries"
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip"
import { TIER_COLOR } from "@/pages/Settings/billingPricing"
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
        <span
          className="inline-flex cursor-help items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
          style={{ color: TIER_COLOR.revered, borderColor: `${TIER_COLOR.revered}4d`, backgroundColor: `${TIER_COLOR.revered}1a` }}
        >
          <Sparkles className="h-3 w-3" /> Ad-free
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" sideOffset={6} className="max-w-xs p-3 normal-case tracking-normal">
        <p className="text-sm text-zinc-200">
          The owner of this {subject} supports Chronicle, so this page is ad-free for everyone who views it.
        </p>
        <Link
          to="/supporter"
          className="mt-2 inline-block text-xs font-medium hover:underline"
          style={{ color: TIER_COLOR.revered }}
        >
          Become a supporter
        </Link>
      </TooltipContent>
    </HintTooltip>
  )
}
