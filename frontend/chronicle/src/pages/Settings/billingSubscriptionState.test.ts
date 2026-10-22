import { describe, expect, it } from "vitest";
import type { BillingSummary } from "@/api/typesGenerated";
import { billingSubscriptionState } from "./billingSubscriptionState";

function billingSummary(
  overrides: Partial<BillingSummary> = {},
): BillingSummary {
  return {
    enabled: true,
    tier: "free",
    ads_free: false,
    has_billing_account: true,
    has_subscription: true,
    can_checkout: false,
    entitlements: [],
    ...overrides,
  };
}

describe("billingSubscriptionState", () => {
  it("shows an active renewing subscriber", () => {
    const state = billingSubscriptionState(
      billingSummary({
        tier: "revered",
        ads_free: true,
        status: "active",
        current_period_end: "2026-11-15T00:00:00Z",
        entitlements: ["chronicle-revered"],
      }),
    );

    expect(state.displayState).toBe("renewing");
    expect(state.statusLabel).toBe("Active");
    expect(state.periodLabel).toBe("Renews");
    expect(state.effectiveDate).toBe("2026-11-15T00:00:00Z");
  });

  it("shows period-end cancellation while Revered access remains active", () => {
    const state = billingSubscriptionState(
      billingSummary({
        tier: "revered",
        ads_free: true,
        status: "active",
        cancel_at_period_end: true,
        current_period_end: "2026-11-15T00:00:00Z",
        entitlements: ["chronicle-revered"],
      }),
    );

    expect(state.displayState).toBe("canceling");
    expect(state.statusLabel).toBe("Canceling");
    expect(state.cancellationScheduled).toBe(true);
    expect(state.periodLabel).toBe("Cancels on");
    expect(state.effectiveDate).toBe("2026-11-15T00:00:00Z");
    expect(state.hasTierAccess).toBe(true);
  });

  it("uses an explicit Stripe cancellation date without changing the current period", () => {
    const state = billingSubscriptionState(
      billingSummary({
        tier: "revered",
        ads_free: true,
        status: "active",
        cancel_at_period_end: false,
        cancel_at: "2026-11-18T00:00:00Z",
        current_period_end: "2027-04-18T00:00:00Z",
        entitlements: ["chronicle-revered"],
      }),
    );

    expect(state.displayState).toBe("canceling");
    expect(state.statusLabel).toBe("Canceling");
    expect(state.periodLabel).toBe("Cancels on");
    expect(state.effectiveDate).toBe("2026-11-18T00:00:00Z");
  });

  it("preserves an explicit cancellation date after the subscription ends", () => {
    const state = billingSubscriptionState(
      billingSummary({
        tier: "revered",
        ads_free: true,
        status: "canceled",
        cancel_at: "2026-11-18T00:00:00Z",
        current_period_end: "2027-04-18T00:00:00Z",
        entitlements: ["chronicle-revered"],
      }),
    );

    expect(state.displayState).toBe("ended");
    expect(state.periodLabel).toBe("Revered until");
    expect(state.effectiveDate).toBe("2026-11-18T00:00:00Z");
  });

  it("does not claim refunded canceled subscriptions retain Revered access", () => {
    const state = billingSubscriptionState(
      billingSummary({
        status: "canceled",
        current_period_end: "2026-11-15T00:00:00Z",
      }),
    );

    expect(state.displayState).toBe("ended");
    expect(state.hasTierAccess).toBe(false);
    expect(state.heading).toBe("Subscription ended");
    expect(state.periodLabel).toBe("Original period end");
  });

  it("keeps subscription lifecycle separate from a remaining entitlement", () => {
    const state = billingSubscriptionState(
      billingSummary({
        tier: "revered",
        ads_free: true,
        status: "canceled",
        current_period_end: "2026-11-15T00:00:00Z",
        entitlements: ["chronicle-revered"],
      }),
    );

    expect(state.displayState).toBe("ended");
    expect(state.statusLabel).toBe("Ended");
    expect(state.hasTierAccess).toBe(true);
    expect(state.heading).toBe("You are Revered");
    expect(state.periodLabel).toBe("Revered until");
  });

  it("uses the active tier in subscriber copy", () => {
    const state = billingSubscriptionState(
      billingSummary({
        tier: "exalted",
        ads_free: true,
        status: "active",
        current_period_end: "2026-11-15T00:00:00Z",
        entitlements: ["chronicle-exalted"],
      }),
    );

    expect(state.tierLabel).toBe("Exalted");
    expect(state.heading).toBe("You are Exalted");
  });

  it("treats incomplete-expired subscriptions as ended", () => {
    const state = billingSubscriptionState(
      billingSummary({ status: "incomplete_expired" }),
    );

    expect(state.displayState).toBe("ended");
    expect(state.statusLabel).toBe("Ended");
  });

  it("shows paused subscriptions without claiming renewal", () => {
    const state = billingSubscriptionState(
      billingSummary({
        status: "paused",
        current_period_end: "2026-11-15T00:00:00Z",
      }),
    );

    expect(state.displayState).toBe("paused");
    expect(state.statusLabel).toBe("Paused");
    expect(state.periodLabel).toBe("Current period ends");
  });

  it.each(["past_due", "unpaid", "incomplete"])(
    "shows %s as a payment issue",
    (status) => {
      const state = billingSubscriptionState(
        billingSummary({
          tier: "revered",
          ads_free: true,
          status,
          current_period_end: "2026-11-15T00:00:00Z",
          entitlements: ["chronicle-revered"],
        }),
      );

      expect(state.displayState).toBe("payment_issue");
      expect(state.statusLabel).toBe("Payment issue");
      expect(state.periodLabel).toBe("Current period ends");
    },
  );
});
