import { describe, expect, it } from "vitest"
import type { BillingSummary } from "@/api/typesGenerated"
import { billingSubscriptionState } from "./billingSubscriptionState"

function billingSummary(overrides: Partial<BillingSummary> = {}): BillingSummary {
  return {
    enabled: true,
    tier: "free",
    ads_free: false,
    has_billing_account: true,
    has_subscription: true,
    entitlements: [],
    ...overrides,
  }
}

describe("billingSubscriptionState", () => {
  it("does not claim refunded canceled subscriptions retain Revered access", () => {
    const state = billingSubscriptionState(billingSummary({
      status: "canceled",
      current_period_end: "2026-11-15T00:00:00Z",
    }))

    expect(state.hasReveredAccess).toBe(false)
    expect(state.heading).toBe("Subscription ended")
    expect(state.periodLabel).toBe("Original period end")
  })

  it("shows remaining Revered access only while the entitlement is active", () => {
    const state = billingSubscriptionState(billingSummary({
      tier: "revered",
      ads_free: true,
      status: "canceled",
      entitlements: ["chronicle-revered"],
    }))

    expect(state.hasReveredAccess).toBe(true)
    expect(state.heading).toBe("You are Revered")
    expect(state.periodLabel).toBe("Revered until")
  })
})
