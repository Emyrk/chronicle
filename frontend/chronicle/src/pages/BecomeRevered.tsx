import { Link } from "react-router-dom"
import { useBillingSummary } from "@/api/queries"
import { SupporterOverview, FramePanel, GOLD_BUTTON } from "@/pages/Settings/BillingSettings"

/** Public overview of supporter tiers. Purchasing happens on /account/billing. */
export function BecomeRevered() {
  // Signed-out visitors get no summary and see the Friendly standing.
  const { data: billing } = useBillingSummary()
  const subscribed = billing?.ads_free ?? false
  const hasSubscription = billing?.has_subscription ?? false

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <SupporterOverview
        billing={billing}
        panel={
          <FramePanel title={subscribed ? "Your Standing" : "Choose Your Path"}>
            <p className="text-center text-sm text-muted-foreground">
              {subscribed
                ? "Thank you for supporting Chronicle!"
                : hasSubscription
                  ? "Your subscription is not currently granting supporter rewards. Review its status in your billing settings."
                  : "Choose an Honored, Revered, or Exalted monthly or annual plan. Every tier currently grants the same rewards."}
            </p>
            <Link to="/account/billing" className={GOLD_BUTTON}>
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
