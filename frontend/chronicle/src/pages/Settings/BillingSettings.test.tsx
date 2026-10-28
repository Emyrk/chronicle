import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import type { BillingPrice, BillingSummary } from "@/api/typesGenerated"
import { describe, expect, it } from "vitest"
import { BillingSignInPrompt, CancellationTimeline, PlanPicker, SupporterOverview } from "./BillingSettings"

describe("BillingSignInPrompt", () => {
  it("returns signed-out users to billing after sign in", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <BillingSignInPrompt />
      </MemoryRouter>,
    )

    expect(markup).toContain("Sign in")
    expect(markup).toContain('href="/login?from=/account/billing"')
    expect(markup).not.toContain("Paid subscriptions are not available yet")
  })
})

function renderSupporterOverview(tier: "honored" | "revered") {
  const billing = {
    enabled: true,
    tier,
    ads_free: true,
    has_subscription: true,
    has_billing_account: true,
    can_checkout: false,
    entitlements: [`chronicle-${tier}`],
  } as BillingSummary

  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <SupporterOverview billing={billing} panel={<div>Subscription panel</div>} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const RETURNING_PRICES: BillingPrice[] = [
  { id: "price_honored", tier: "honored", currency: "usd", unit_amount: 300, interval_months: 1 },
  { id: "price_revered", tier: "revered", currency: "usd", unit_amount: 500, interval_months: 1 },
  { id: "price_exalted", tier: "exalted", currency: "usd", unit_amount: 1000, interval_months: 1 },
]

function renderPlanPicker(returningState: "canceling" | "ended") {
  const queryClient = new QueryClient()
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PlanPicker prices={RETURNING_PRICES} change={{ currentTier: "revered", returningState }} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("PlanPicker", () => {
  it("keeps tiers and prices visible while a cancellation is scheduled", () => {
    const markup = renderPlanPicker("canceling")

    expect(markup).toContain("Choose Your Next Standing")
    expect(markup).toContain("Honored")
    expect(markup).toContain("Revered")
    expect(markup).toContain("Exalted")
    expect(markup).toContain("$3.00")
    expect(markup).toContain("$5.00")
    expect(markup).toContain("$10.00")
    expect(markup).toContain("Change Tier in Stripe")
    expect(markup).toContain("Reactivate Subscription")
    expect(markup).toContain("Your current tier")
  })

  it("keeps tiers visible after the Stripe subscription has ended", () => {
    const markup = renderPlanPicker("ended")

    expect(markup).toContain("Choose Your Next Standing")
    expect(markup).toContain("Honored")
    expect(markup).toContain("Revered")
    expect(markup).toContain("Exalted")
    expect(markup).toContain("View Stripe Billing History")
    expect(markup).not.toContain("Reactivate Subscription")
  })
})

describe("CancellationTimeline", () => {
  it("describes retained access without listing individual benefits", () => {
    const markup = renderToStaticMarkup(
      <CancellationTimeline tierLabel="Revered" hasTierAccess subscriptionEnded={false} displayDate="1/25/2027" />,
    )

    expect(markup).toContain("Your current supporter benefits stay active until 1/25/2027.")
    expect(markup).not.toContain("Ad-Free Browsing")
    expect(markup).not.toContain("Expanded Log Storage")
    expect(markup).not.toContain("Raw Log Downloads")
    expect(markup).not.toContain("Unlisted Logs")
  })
})

describe("SupporterOverview", () => {
  it("keeps raw downloads and unlisted logs locked at Honored", () => {
    const markup = renderSupporterOverview("honored")

    expect(markup).toContain("Reward: Ad-free browsing and +300 MB storage")
    expect(markup).toContain('style="color:#ff2020">Requires Chronicle – Revered')
  })

  it("unlocks raw downloads and unlisted logs at Revered", () => {
    const markup = renderSupporterOverview("revered")

    expect(markup).toContain("Reward: Ad-free browsing, +1 GB storage, raw log downloads, and unlisted logs")
    expect(markup).toContain('style="color:#ffffff">Requires Chronicle – Revered')
  })
})
