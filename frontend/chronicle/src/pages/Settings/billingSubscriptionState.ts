import type { BillingSummary } from "@/api/typesGenerated"

export type BillingSubscriptionState = {
  hasReveredAccess: boolean
  subscriptionEnded: boolean
  cancellationScheduled: boolean
  heading: string
  periodLabel: string
}

export function billingSubscriptionState(billing: BillingSummary): BillingSubscriptionState {
  const hasReveredAccess = billing.ads_free
  const subscriptionEnded = billing.status === "canceled"
  const cancellationScheduled = Boolean(billing.cancel_at_period_end) && !subscriptionEnded

  return {
    hasReveredAccess,
    subscriptionEnded,
    cancellationScheduled,
    heading: subscriptionEnded && !hasReveredAccess
      ? "Subscription ended"
      : hasReveredAccess
        ? "You are Revered"
        : "Revered access pending",
    periodLabel: subscriptionEnded && !hasReveredAccess
      ? "Original period end"
      : subscriptionEnded || cancellationScheduled
        ? "Revered until"
        : "Renews",
  }
}
