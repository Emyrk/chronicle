import type { BillingSummary } from "@/api/typesGenerated";
import { billingTierLabel } from "./billingPricing";

export type SubscriptionDisplayState =
  | "renewing"
  | "canceling"
  | "ended"
  | "trialing"
  | "payment_issue"
  | "paused"
  | "pending";

export type BillingSubscriptionState = {
  hasTierAccess: boolean;
  tierLabel: string;
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
  const hasTierAccess = billing.ads_free;
  const tierLabel = billingTierLabel(billing.tier);
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
    statusLabel = "Won't renew";
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
    hasTierAccess,
    tierLabel,
    displayState,
    subscriptionEnded,
    cancellationScheduled,
    statusLabel,
    heading:
      subscriptionEnded && !hasTierAccess
        ? "Subscription ended"
        : hasTierAccess
          ? `You are ${tierLabel}`
          : `${tierLabel} access pending`,
    periodLabel:
      subscriptionEnded && !hasTierAccess
        ? "Original period end"
        : subscriptionEnded
          ? `${tierLabel} until`
          : cancellationScheduled
            ? `${tierLabel} until`
            : displayState === "renewing" || displayState === "trialing"
              ? "Renews"
              : "Current period ends",
    effectiveDate,
  };
}
