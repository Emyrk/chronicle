import { Link } from "react-router-dom"
import { useBillingSummary } from "@/api/queries"
import { ReveredOverview, FramePanel, GOLD_BUTTON } from "@/pages/Settings/BillingSettings"

/** Public overview of the Revered tier. Purchasing happens on /account/billing. */
export function BecomeRevered() {
  // Signed-out visitors get no summary and see the Friendly standing.
  const { data: billing } = useBillingSummary()
  const revered = billing?.ads_free ?? false
  const hasSubscription = billing?.has_subscription ?? false

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <ReveredOverview
        billing={billing}
        panel={
          <FramePanel title={revered ? "Your Standing" : "Choose Your Path"}>
            <p className="text-center text-sm text-muted-foreground">
              {revered
                ? "You're already Revered. Thank you for supporting Chronicle!"
                : hasSubscription
                  ? "Your subscription is not currently granting Revered rewards. Review its status in your billing settings."
                  : "Plans range from monthly to annual, and longer paths cost less per month. Every plan grants the same rewards."}
            </p>
            <Link to="/account/billing" className={GOLD_BUTTON}>
              <span className="flex flex-col items-center leading-tight">
                <span>{hasSubscription ? "Manage Subscription" : "Become Revered"}</span>
                <span className="mt-0.5 font-sans text-xs font-medium text-[#f0c060]/80">
                  {hasSubscription ? "Open your billing settings" : "Choose a plan in your account"}
                </span>
              </span>
            </Link>
            {hasSubscription ? null : (
              <p className="text-center text-xs text-muted-foreground">Secure checkout with Stripe. Cancel anytime.</p>
            )}
          </FramePanel>
        }
      />
    </div>
  )
}
