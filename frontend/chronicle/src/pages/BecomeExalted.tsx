import { Link } from "react-router-dom"
import { useBillingSummary } from "@/api/queries"
import { ExaltedOverview, FramePanel, GOLD_BUTTON } from "@/pages/Settings/BillingSettings"

/** Public overview of the Exalted tier. Purchasing happens on /account/billing. */
export function BecomeExalted() {
  // Signed-out visitors get no summary and see the Friendly standing.
  const { data: billing } = useBillingSummary()
  const exalted = billing?.ads_free ?? false

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <ExaltedOverview
        billing={billing}
        panel={
          <FramePanel title={exalted ? "Your Standing" : "Choose Your Path"}>
            <p className="text-center text-sm text-muted-foreground">
              {exalted
                ? "You're already Exalted. Thank you for supporting Chronicle!"
                : "Plans range from monthly to annual, and longer paths cost less per month. Every plan grants the same rewards."}
            </p>
            <Link to="/account/billing" className={GOLD_BUTTON}>
              <span className="flex flex-col items-center leading-tight">
                <span>{exalted ? "Manage Subscription" : "Become Exalted"}</span>
                <span className="mt-0.5 font-sans text-xs font-medium text-[#f0c060]/80">
                  {exalted ? "Open your billing settings" : "Choose a plan in your account"}
                </span>
              </span>
            </Link>
            {exalted ? null : (
              <p className="text-center text-xs text-muted-foreground">Secure checkout with Stripe. Cancel anytime.</p>
            )}
          </FramePanel>
        }
      />
    </div>
  )
}
