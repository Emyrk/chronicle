import { useSession } from "@/api/queries";
import { isPaidBillingTier, PAID_BILLING_TIERS, type PaidBillingTier } from "@/pages/Settings/billingPricing";

/** The viewer's supporter tier; tiers stack, so exalted has everything revered and honored have. */
export function useSupporterTier() {
  const session = useSession();
  const raw = session.data?.supporter_tier ?? "";
  const tier: PaidBillingTier | null = isPaidBillingTier(raw) ? raw : null;
  return {
    tier,
    isLoading: session.isLoading,
    atLeast: (minimum: PaidBillingTier) => tier !== null && PAID_BILLING_TIERS.indexOf(tier) >= PAID_BILLING_TIERS.indexOf(minimum),
  };
}
