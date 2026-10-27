import { Crown, Lock } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Link } from "react-router-dom"
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip"
import { cn } from "@/lib/utils"
import { SUPPORTER_PATH, supporterPerkPath, useShowSupporterUpsell, type SupporterPerk } from "./supporterUpsell"
import { TIER_COLOR, billingTierLabel, type PaidBillingTier } from "@/pages/Settings/billingPricing"

/** Reputation-colored tier label, e.g. "Revered". */
export function TierPill({ tier, className }: { tier: PaidBillingTier; className?: string }) {
  const color = TIER_COLOR[tier]
  return (
    <span
      className={cn("inline-flex items-center rounded-full border px-1.5 py-px font-wow text-[10px] font-bold uppercase tracking-wider", className)}
      style={{ color, borderColor: `${color}66`, backgroundColor: `${color}1a` }}
    >
      {billingTierLabel(tier)}
    </span>
  )
}

/**
 * Stand-in for an action the viewer could take with a higher supporter tier.
 * Links to the perk on /supporter instead of hiding the feature entirely.
 */
export function SupporterLockedAction({
  tier,
  perk,
  label,
  icon: Icon,
  iconOnly = false,
  className,
}: {
  tier: PaidBillingTier
  perk: SupporterPerk
  label: string
  icon: LucideIcon
  iconOnly?: boolean
  className?: string
}) {
  return (
    <HintTooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <Link
          to={supporterPerkPath(perk)}
          aria-label={`${label} (requires ${billingTierLabel(tier)})`}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-dashed px-2 text-xs text-muted-foreground transition-colors hover:text-foreground",
            className,
          )}
          style={{ borderColor: `${TIER_COLOR[tier]}66` }}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {iconOnly ? null : label}
          <Lock className="h-3 w-3" style={{ color: TIER_COLOR[tier] }} aria-hidden="true" />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="font-medium text-white">{label}</p>
        <p className="mt-0.5" style={{ color: TIER_COLOR[tier] }}>
          Requires Chronicle – {billingTierLabel(tier)}
        </p>
        <p className="mt-1 text-muted-foreground">Click to see supporter perks.</p>
      </TooltipContent>
    </HintTooltip>
  )
}

/** Gold crown link for nav bars; renders nothing for supporters or when billing is off. */
export function SupporterNavLink({ className, onClick }: { className?: string; onClick?: () => void }) {
  const show = useShowSupporterUpsell()
  if (!show) return null
  return (
    <Link
      to={SUPPORTER_PATH}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-[#c9a227]/60 bg-[#f0c060]/10 px-3 py-1.5 font-wow text-sm font-bold text-[#f0c060] transition-colors hover:bg-[#f0c060]/20",
        className,
      )}
    >
      <Crown className="h-4 w-4" aria-hidden="true" />
      Supporter
    </Link>
  )
}
