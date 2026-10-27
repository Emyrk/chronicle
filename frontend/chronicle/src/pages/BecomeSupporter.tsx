import { Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import type { BillingSummary } from "@/api/typesGenerated"
import { useBillingSummary } from "@/api/queries"
import { useAuth } from "@/hooks/useAuth"
import { cn } from "@/lib/utils"
import { TierPill } from "@/components/Supporter/Supporter"
import { SUPPORTER_GOLD } from "@/components/Supporter/supporterUpsell"
import { ComparisonTable, GOLD_BUTTON } from "@/pages/Settings/BillingSettings"
import { isPaidBillingTier } from "@/pages/Settings/billingPricing"
import { PerkShowcase } from "./Supporter/PerkShowcase"

const BILLING_PATH = "/account/billing"

/** One call to action: buy a tier, or manage the one you have. */
function TierButton({ hasSubscription }: { hasSubscription: boolean }) {
  return (
    <Link to={BILLING_PATH} className={cn(GOLD_BUTTON, "w-auto px-6")}>
      {hasSubscription ? "Manage your tier" : "Choose your tier"} <ArrowRight className="h-4 w-4" />
    </Link>
  )
}

/** The viewer's current standing, shown under the hero button. */
function Standing({ billing, signedIn }: { billing?: BillingSummary; signedIn: boolean }) {
  if (!signedIn) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link to="/login?from=/supporter" className="underline underline-offset-4 hover:text-foreground">
          Sign in
        </Link>{" "}
        to see your standing.
      </p>
    )
  }
  const tier = billing?.ads_free && isPaidBillingTier(billing.tier) ? billing.tier : null
  if (tier) {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-300">
        Your standing <TierPill tier={tier} className="text-xs" /> Thank you for supporting Chronicle.
      </p>
    )
  }
  if (billing?.has_subscription) {
    return <p className="text-sm text-amber-300">Your subscription isn't granting a tier right now. Check its status in billing.</p>
  }
  return (
    <p className="text-sm text-muted-foreground">
      Your standing: <span className="font-wow text-zinc-300">Friendly</span> (no supporter tier)
    </p>
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
    <div className="container mx-auto max-w-5xl space-y-16 px-4 py-12">
      <section className="flex flex-col items-center gap-5 text-center">
        <h1 className="font-wow text-4xl leading-tight sm:text-5xl">
          <span style={{ color: SUPPORTER_GOLD }}>Earn reputation</span> <span className="text-white">with Chronicle</span>
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
          Chronicle is free and always will be. Honored, Revered, and Exalted supporters keep the servers running, and unlock perks that make the site their own.
        </p>
        <TierButton hasSubscription={hasSubscription} />
        <Standing billing={billing} signedIn={isAuthenticated} />
      </section>

      <PerkShowcase />

      <ComparisonTable currentTier={currentTier} />

      {subscribed ? null : (
        <section className="flex flex-col items-center gap-4 text-center">
          <h2 className="font-wow text-2xl text-white">Pick the standing that fits you.</h2>
          <TierButton hasSubscription={hasSubscription} />
          <p className="text-xs text-muted-foreground">Monthly or annual plans. Secure checkout with Stripe. Cancel anytime.</p>
        </section>
      )}
    </div>
  )
}
