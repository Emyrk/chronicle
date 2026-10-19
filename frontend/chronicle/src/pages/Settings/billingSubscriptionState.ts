import type { BillingSummary } from "@/api/typesGenerated";

export type SubscriptionDisplayState =
  | "renewing"
  | "canceling"
  | "ended"
  | "trialing"
  | "payment_issue"
  | "paused"
  | "pending";

export type BillingSubscriptionState = {
  hasReveredAccess: boolean;
  displayState: SubscriptionDisplayState;
  subscriptionEnded: boolean;
  cancellationScheduled: boolean;
  statusLabel: string;
  heading: string;
  periodLabel: string;
  effectiveDate?: string;
};

const PAYMENT_ISSUE_STATUSES = new Set(["past_due", "unpaid", "incomplete"]);

export function billingSubscriptionState(
  billing: BillingSummary,
): BillingSubscriptionState {
  const hasReveredAccess = billing.ads_free;
  const subscriptionEnded =
    billing.status === "canceled" || billing.status === "incomplete_expired";
  const cancellationScheduled =
    !subscriptionEnded &&
    (Boolean(billing.cancel_at_period_end) || Boolean(billing.cancel_at));

  let displayState: SubscriptionDisplayState;
  let statusLabel: string;
  if (subscriptionEnded) {
    displayState = "ended";
    statusLabel = "Ended";
  } else if (cancellationScheduled) {
    displayState = "canceling";
    statusLabel = "Canceling";
  } else if (billing.status === "active") {
    displayState = "renewing";
    statusLabel = "Active";
  } else if (billing.status === "trialing") {
    displayState = "trialing";
    statusLabel = "Trialing";
  } else if (billing.status && PAYMENT_ISSUE_STATUSES.has(billing.status)) {
    displayState = "payment_issue";
    statusLabel = "Payment issue";
  } else if (billing.status === "paused") {
    displayState = "paused";
    statusLabel = "Paused";
  } else {
    displayState = "pending";
    statusLabel = "Pending";
  }

  const effectiveDate = cancellationScheduled || subscriptionEnded
    ? (billing.cancel_at ?? billing.current_period_end)
    : billing.current_period_end;

  return {
    hasReveredAccess,
    displayState,
    subscriptionEnded,
    cancellationScheduled,
    statusLabel,
    heading:
      subscriptionEnded && !hasReveredAccess
        ? "Subscription ended"
        : hasReveredAccess
          ? "You are Revered"
          : "Revered access pending",
    periodLabel:
      subscriptionEnded && !hasReveredAccess
        ? "Original period end"
        : subscriptionEnded
          ? "Revered until"
          : cancellationScheduled
            ? "Cancels on"
            : displayState === "renewing" || displayState === "trialing"
              ? "Renews"
              : "Current period ends",
    effectiveDate,
  };
}
