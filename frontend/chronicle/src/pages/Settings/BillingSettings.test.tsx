import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import type { BillingSummary } from "@/api/typesGenerated"
import { describe, expect, it } from "vitest"
import { BillingSignInPrompt, CancellationTimeline, SupporterOverview } from "./BillingSettings"

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
    <MemoryRouter>
      <SupporterOverview billing={billing} panel={<div>Subscription panel</div>} />
    </MemoryRouter>,
  )
}

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
