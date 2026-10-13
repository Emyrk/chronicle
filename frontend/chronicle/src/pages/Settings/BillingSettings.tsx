import { useState } from "react"
import { Check, HeartHandshake } from "lucide-react"
import { useCreateBillingCheckout, useCreateBillingPortal, useBillingSummary } from "@/api/queries"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  bestValuePriceID,
  billingDiscountPercent,
  billingPeriodDescription,
  billingPeriodLabel,
  formatBillingAmount,
  formatMonthlyAmount,
} from "./billingPricing"

export function BillingSettings() {
  const { data: billing, isLoading } = useBillingSummary()
  const checkout = useCreateBillingCheckout()
  const portal = useCreateBillingPortal()
  const [selectedPriceID, setSelectedPriceID] = useState<string | null>(null)

  const openBilling = async (action: () => Promise<string>) => {
    try {
      window.location.assign(await action())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open billing")
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading billing status…</p>
  }

  if (!billing?.enabled) {
    return (
      <section className="max-w-2xl space-y-2">
        <h2 className="text-2xl font-semibold">Billing</h2>
        <p className="text-muted-foreground">Paid subscriptions are not available yet.</p>
      </section>
    )
  }

  const prices = billing.prices ?? []
  const monthlyPrice = prices.find((price) => price.interval_months === 1)
  const selectedPrice = prices.find((price) => price.id === selectedPriceID) ?? prices[0]
  const bestPriceID = bestValuePriceID(prices, monthlyPrice)

  return (
    <section className="max-w-5xl space-y-7">
      <div className="max-w-2xl">
        <h2 className="text-2xl font-semibold">Billing</h2>
        <p className="mt-1 text-muted-foreground">
          Support Chronicle, browse without advertisements, and save more when you choose a longer period.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border bg-card/40 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Current tier</p>
          <p className="mt-1 text-xl font-semibold capitalize">{billing.tier}</p>
          {billing.current_period_end ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {billing.cancel_at_period_end ? "Access ends" : "Renews"}{" "}
              {new Date(billing.current_period_end).toLocaleDateString()}.
            </p>
          ) : null}
        </div>
        {billing.ads_free ? (
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="size-4" /> Ad-free
          </div>
        ) : null}
      </div>

      {billing.ads_free ? (
        <Button
          disabled={portal.isPending}
          onClick={() => void openBilling(() => portal.mutateAsync())}
        >
          Manage subscription
        </Button>
      ) : (
        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <HeartHandshake className="size-5 text-primary" />
              <h3 className="text-lg font-semibold">Choose your support period</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Every option unlocks the same ad-free Supporter tier. Longer commitments reduce the monthly cost.
            </p>
          </div>

          {prices.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {prices.map((price) => {
                const selected = selectedPrice?.id === price.id
                const discount = billingDiscountPercent(price, monthlyPrice)
                const bestValue = price.id === bestPriceID
                return (
                  <button
                    key={price.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedPriceID(price.id)}
                    className={cn(
                      "relative min-h-44 rounded-xl border p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-card/40 hover:border-primary/50 hover:bg-card",
                    )}
                  >
                    {bestValue ? (
                      <span className="absolute right-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                        Best value
                      </span>
                    ) : null}
                    <div className="flex items-center gap-2 pr-20">
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center rounded-full border",
                          selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                        )}
                      >
                        {selected ? <Check className="size-3.5" /> : null}
                      </span>
                      <p className="font-semibold">{billingPeriodLabel(price.interval_months)}</p>
                    </div>
                    <div className="mt-5">
                      <span className="text-3xl font-semibold tracking-tight">
                        {formatBillingAmount(price.unit_amount, price.currency)}
                      </span>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {billingPeriodDescription(price.interval_months)}
                      </p>
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-3 border-t pt-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Monthly cost</p>
                        <p className="font-medium">{formatMonthlyAmount(price)}</p>
                      </div>
                      {discount > 0 ? (
                        <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          Save {discount}%
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Standard rate</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
              Supporter pricing is temporarily unavailable.
            </p>
          )}

          <Button
            size="lg"
            disabled={!selectedPrice || checkout.isPending}
            onClick={() => selectedPrice && void openBilling(() => checkout.mutateAsync(selectedPrice.id))}
          >
            Continue with {selectedPrice ? billingPeriodLabel(selectedPrice.interval_months) : "Supporter"}
          </Button>
        </div>
      )}
    </section>
  )
}
