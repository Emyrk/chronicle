import { cn } from "@/lib/utils"
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
