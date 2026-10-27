import { Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import { useBillingSummary } from "@/api/queries"
import { iconUrl } from "@/config/iconUrl"
import { cn } from "@/lib/utils"
import { SUPPORTER_GOLD } from "@/components/Supporter/supporterUpsell"
import { SupporterOverview, FramePanel, GOLD_BUTTON } from "@/pages/Settings/BillingSettings"
import { PAID_BILLING_TIERS, TIER_COLOR, TIER_ICON, billingTierLabel, type PaidBillingTier } from "@/pages/Settings/billingPricing"
import { PerkShowcase } from "./Supporter/PerkShowcase"

const BILLING_PATH = "/account/billing"

const TIER_SUMMARY: Record<PaidBillingTier, string> = {
  honored: "Ad-free browsing, name styles, +300 MB storage",
  revered: "Raw log downloads, unlisted logs, backgrounds, +1 GB storage",
  exalted: "Animated borders and +2 GB storage",
}

/** Landing hero for visitors who don't have a supporter tier yet. */
function SupporterHero() {
  return (
    <section className="space-y-6 text-center">
      <div className="space-y-3">
        <h1 className="font-wow text-4xl leading-tight sm:text-5xl">
          <span style={{ color: SUPPORTER_GOLD }}>Earn reputation</span> <span className="text-white">with Chronicle</span>
        </h1>
        <p className="mx-auto max-w-2xl text-base text-muted-foreground sm:text-lg">
          Chronicle is free and always will be. Supporters keep the servers running and unlock perks that make the site their own.
        </p>
      </div>
      <div className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-3">
        {PAID_BILLING_TIERS.map((tier, i) => (
          <a
            key={tier}
            href="#compare"
            className="flex items-center gap-3 rounded-lg border bg-card/60 p-3 text-left transition-colors hover:bg-card"
            style={{ borderColor: `${TIER_COLOR[tier]}55` }}
          >
            <img src={iconUrl(TIER_ICON[tier])} alt="" aria-hidden="true" width={40} height={40} className="size-10 shrink-0 rounded border border-white/10" />
            <span className="min-w-0">
              <span className="block font-wow text-sm font-bold" style={{ color: TIER_COLOR[tier] }}>
                {billingTierLabel(tier)}
              </span>
              <span className="block text-xs leading-snug text-muted-foreground">
                {i > 0 ? "Everything above, plus " : ""}
                {i > 0 ? TIER_SUMMARY[tier].charAt(0).toLowerCase() + TIER_SUMMARY[tier].slice(1) : TIER_SUMMARY[tier]}
              </span>
            </span>
          </a>
        ))}
      </div>
      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link to={BILLING_PATH} className={cn(GOLD_BUTTON, "w-auto px-6")}>
          Choose your tier <ArrowRight className="h-4 w-4" />
        </Link>
        <a href="#compare" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Compare all tiers
        </a>
      </div>
    </section>
  )
}

/** Public supporter landing page: perk showcase plus tier overview. Purchasing happens on /account/billing. */
export function BecomeSupporter() {
  // Signed-out visitors get no summary and see the Friendly standing.
  const { data: billing } = useBillingSummary()
  const subscribed = billing?.ads_free ?? false
  const hasSubscription = billing?.has_subscription ?? false

  return (
    <div className="container mx-auto max-w-5xl space-y-12 px-4 py-8">
      {subscribed ? null : <SupporterHero />}
      <PerkShowcase ctaTo={BILLING_PATH} />
      <SupporterOverview
        billing={billing}
        hideHeading={!subscribed}
        panel={
          <FramePanel title={subscribed ? "Your Standing" : "Choose Your Path"}>
            <p className="text-center text-sm text-muted-foreground">
              {subscribed
                ? "Thank you for supporting Chronicle!"
                : hasSubscription
                  ? "Your subscription is not currently granting supporter rewards. Review its status in your billing settings."
                  : "Choose an Honored, Revered, or Exalted monthly or annual plan. Revered unlocks raw log downloads and unlisted logs."}
            </p>
            <Link to={BILLING_PATH} className={GOLD_BUTTON}>
              <span className="flex flex-col items-center leading-tight">
                <span>{hasSubscription ? "Manage Subscription" : "View Supporter Tiers"}</span>
                <span className="mt-0.5 font-sans text-xs font-medium text-[#f0c060]/80">{hasSubscription ? "Open your billing settings" : "Choose a plan in your account"}</span>
              </span>
            </Link>
            {hasSubscription ? null : <p className="text-center text-xs text-muted-foreground">Secure checkout with Stripe. Cancel anytime.</p>}
          </FramePanel>
        }
      />
    </div>
  )
}
