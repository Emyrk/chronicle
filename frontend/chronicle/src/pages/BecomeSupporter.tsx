import { Link } from "react-router-dom"
import { ArrowRight, Crown } from "lucide-react"
import type { BillingSummary } from "@/api/typesGenerated"
import { useBillingSummary } from "@/api/queries"
import { useAuth } from "@/hooks/useAuth"
import { cn } from "@/lib/utils"
import { SUPPORTER_GOLD } from "@/components/Supporter/supporterUpsell"
import { ComparisonTable } from "@/pages/Settings/BillingSettings"
import { TIER_COLOR, billingTierLabel, isPaidBillingTier } from "@/pages/Settings/billingPricing"
import { PerkShowcase } from "./Supporter/PerkShowcase"
import { SharedServers } from "./Supporter/SharedServers"

const BILLING_PATH = "/account/billing"

/** The one big call to action: buy a tier, or manage the one you have. */
function TierButton({ hasSubscription, className }: { hasSubscription: boolean; className?: string }) {
  return (
    <Link
      to={BILLING_PATH}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-[#f0c060] px-6 py-3 font-wow text-base font-bold text-zinc-950 shadow-lg shadow-[#f0c060]/20 transition-colors hover:bg-[#ffd580] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        className,
      )}
    >
      <Crown className="h-5 w-5" aria-hidden="true" />
      {hasSubscription ? "Manage your tier" : "Become a supporter"}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  )
}

/** The viewer's current standing: tier name in its reputation color, plus a hint. */
function Standing({ billing, signedIn }: { billing?: BillingSummary; signedIn: boolean }) {
  const tier = signedIn && billing?.ads_free && isPaidBillingTier(billing.tier) ? billing.tier : null
  const name = tier ? billingTierLabel(tier) : "Friendly"
  const color = tier ? TIER_COLOR[tier] : "#e4e4e7"

  let hint: React.ReactNode = "No supporter tier yet"
  if (!signedIn) {
    hint = (
      <Link to="/login?from=/supporter" className="underline underline-offset-4 hover:text-foreground">
        Sign in to see yours
      </Link>
    )
  } else if (tier) {
    hint = "Thank you for supporting Chronicle"
  } else if (billing?.has_subscription) {
    hint = <span className="text-amber-300">Subscription not granting a tier</span>
  }

  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Your standing</p>
      <p className="font-wow text-xl font-bold leading-tight" style={{ color }}>
        {name}
      </p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

/** Public supporter landing page. Purchasing happens on /account/billing. */
export function BecomeSupporter() {
  const { isAuthenticated } = useAuth()
  // Signed-out visitors get no summary and see the Friendly standing.
  const { data: billing } = useBillingSummary()
  const subscribed = billing?.ads_free ?? false
  const hasSubscription = billing?.has_subscription ?? false
  const currentTier = subscribed ? (billing?.tier ?? "honored") : "free"

  return (
    <div className="container mx-auto max-w-5xl space-y-12 px-4 py-6">
      <div className="space-y-4">
        <section className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-wow text-3xl leading-tight">
              <span style={{ color: SUPPORTER_GOLD }}>Earn reputation</span> <span className="text-white">with Chronicle</span>
            </h1>
            <p className="text-sm text-muted-foreground">Chronicle is free and always will be. Supporters keep it running and unlock perks of their own.</p>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-5 rounded-lg border border-[#c9a227]/50 bg-[#f0c060]/[0.07] py-3 pl-4 pr-3">
            <Standing billing={billing} signedIn={isAuthenticated} />
            <TierButton hasSubscription={hasSubscription} />
          </div>
        </section>

        <PerkShowcase />
      </div>

      <SharedServers />

      <ComparisonTable currentTier={currentTier} />

      {subscribed ? null : (
        <section className="flex flex-col items-center gap-4 text-center">
          <h2 className="font-wow text-2xl text-white">Pick the standing that fits you.</h2>
          <TierButton hasSubscription={hasSubscription} className="px-8 py-4 text-lg" />
          <p className="text-xs text-muted-foreground">Monthly or annual plans. Secure checkout with Stripe. Cancel anytime.</p>
        </section>
      )}
    </div>
  )
}
