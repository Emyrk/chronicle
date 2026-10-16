import { useState } from "react"
import { Check, Crown, Download, EyeOff, HardDrive, Lock } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { BillingPrice, BillingSummary } from "@/api/typesGenerated"
import { useCreateBillingCheckout, useCreateBillingPortal, useBillingSummary } from "@/api/queries"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  EXALTED_TIER_NAME,
  type BillingQuality,
  bestValuePriceID,
  billingDiscountPercent,
  billingPeriodDescription,
  billingPeriodLabel,
  billingPriceQualities,
  billingTierLabel,
  formatBillingAmount,
  formatMonthlyAmount,
} from "./billingPricing"

// WoW reputation standings, in order. Free users sit at Neutral; Exalted fills the bar.
const STANDINGS = ["Hated", "Hostile", "Unfriendly", "Neutral", "Friendly", "Honored", "Revered", "Exalted"] as const

const qualityText: Record<BillingQuality, string> = {
  uncommon: "text-quality-uncommon",
  rare: "text-[#3d9bff]",
  epic: "text-[#c06bff]",
  legendary: "text-quality-legendary",
}

const perks: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: EyeOff, title: "No advertisements", body: "Browse every page of Chronicle ad-free." },
  { icon: HardDrive, title: "More log storage", body: "An extra 1 GB of storage for your uploads." },
  { icon: Download, title: "Raw log downloads", body: "Download the original combat log files." },
  { icon: Lock, title: "Private logs", body: "Keep your uploads out of public view." },
]

export function BillingSettings() {
  const { data: billing, isLoading } = useBillingSummary()

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

  const exalted = billing.ads_free

  return (
    <section className="max-w-5xl space-y-6">
      <StandingHeader billing={billing} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-lg font-semibold">{EXALTED_TIER_NAME} rewards</h3>
            <span className="text-xs text-muted-foreground">
              {exalted ? "All rewards unlocked" : `Unlocked at ${EXALTED_TIER_NAME}`}
            </span>
          </div>
          <ul className="divide-y rounded-lg border bg-card">
            {perks.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-center gap-4 p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent/20 text-accent">
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </div>
                {exalted ? (
                  <Check className="size-5 shrink-0 text-emerald-400" aria-label="Unlocked" />
                ) : (
                  <Lock className="size-4 shrink-0 text-muted-foreground/60" aria-label="Locked" />
                )}
              </li>
            ))}
          </ul>
        </div>

        {exalted ? <SubscriptionPanel billing={billing} /> : <PlanPicker prices={billing.prices ?? []} />}
      </div>
    </section>
  )
}

function useOpenBilling() {
  return async (action: () => Promise<string>) => {
    try {
      window.location.assign(await action())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open billing")
    }
  }
}

function StandingHeader({ billing }: { billing: BillingSummary }) {
  const exalted = billing.ads_free
  const standing = exalted ? EXALTED_TIER_NAME : billingTierLabel(billing.tier)
  const standingIndex = Math.max(0, STANDINGS.indexOf(standing as (typeof STANDINGS)[number]))
  // Neutral shows a sliver of progress into the standing; Exalted is a full bar.
  const fill = exalted ? 100 : ((standingIndex + 0.15) / STANDINGS.length) * 100

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-accent/20 text-accent">
          <Crown className="size-6" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Billing</p>
          <h2 className="mt-1 text-2xl font-semibold">
            {exalted ? "You are " : "Become "}
            <span className="font-wow text-accent">{EXALTED_TIER_NAME}</span>
            {exalted ? "" : " with Chronicle"}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {exalted
              ? "Thank you for supporting Chronicle. Your standing keeps the parsers running."
              : "Support Chronicle and unlock every reward below. One tier, no upsells."}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="font-medium">Chronicle</span>
          <span className={cn("font-semibold", exalted ? "text-teal-400" : "text-yellow-400")}>{standing}</span>
        </div>
        <div
          role="meter"
          aria-label="Reputation with Chronicle"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fill)}
          aria-valuetext={standing}
          className="relative h-3 overflow-hidden rounded-sm border bg-background"
        >
          <div className={cn("h-full", exalted ? "bg-teal-500" : "bg-yellow-500")} style={{ width: `${fill}%` }} />
          {STANDINGS.slice(1).map((name, i) => (
            <span
              key={name}
              className="absolute inset-y-0 w-px bg-background/70"
              style={{ left: `${((i + 1) / STANDINGS.length) * 100}%` }}
            />
          ))}
        </div>
        <div className="mt-1.5 hidden justify-between text-[10px] uppercase tracking-wider text-muted-foreground sm:flex">
          {STANDINGS.map((name, i) => (
            <span
              key={name}
              className={cn(
                "w-full text-center",
                i === standingIndex && (exalted ? "font-semibold text-teal-400" : "font-semibold text-yellow-400"),
              )}
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function PlanPicker({ prices }: { prices: readonly BillingPrice[] }) {
  const checkout = useCreateBillingCheckout()
  const openBilling = useOpenBilling()
  const [selectedPriceID, setSelectedPriceID] = useState<string | null>(null)

  const monthlyPrice = prices.find((price) => price.interval_months === 1)
  const bestPriceID = bestValuePriceID(prices, monthlyPrice)
  const selectedPrice = prices.find((price) => price.id === (selectedPriceID ?? bestPriceID)) ?? prices[0]
  const qualities = billingPriceQualities(prices)
  const sorted = [...prices].sort((a, b) => a.interval_months - b.interval_months)

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4 lg:sticky lg:top-4">
      <div>
        <h3 className="font-semibold">Choose a period</h3>
        <p className="text-xs text-muted-foreground">Same rewards on every plan. Longer periods cost less per month.</p>
      </div>

      {sorted.length > 0 ? (
        <div role="radiogroup" aria-label="Billing period" className="space-y-2">
          {sorted.map((price) => {
            const selected = selectedPrice?.id === price.id
            const discount = billingDiscountPercent(price, monthlyPrice)
            return (
              <button
                key={price.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setSelectedPriceID(price.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "border-accent bg-accent/10" : "hover:border-accent/50",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border",
                    selected ? "border-accent" : "border-muted-foreground/40",
                  )}
                >
                  {selected ? <span className="size-2 rounded-full bg-accent" /> : null}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("font-medium", qualityText[qualities.get(price.id) ?? "rare"])}>
                      {billingPeriodLabel(price.interval_months)}
                    </span>
                    {price.id === bestPriceID ? (
                      <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-foreground">
                        Best value
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatBillingAmount(price.unit_amount, price.currency)} ·{" "}
                    {billingPeriodDescription(price.interval_months).toLowerCase()}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold">{formatMonthlyAmount(price)}</p>
                  <p className={cn("text-xs", discount > 0 ? "font-medium text-emerald-400" : "text-muted-foreground")}>
                    {discount > 0 ? `Save ${discount}%` : "per month"}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          {EXALTED_TIER_NAME} pricing is temporarily unavailable.
        </p>
      )}

      <Button
        size="lg"
        className="w-full gap-2"
        disabled={!selectedPrice || checkout.isPending}
        onClick={() => selectedPrice && void openBilling(() => checkout.mutateAsync(selectedPrice.id))}
      >
        <Crown className="size-4" />
        Become {EXALTED_TIER_NAME}
      </Button>
      {selectedPrice ? (
        <p className="text-center text-xs text-muted-foreground">
          {formatBillingAmount(selectedPrice.unit_amount, selectedPrice.currency)}{" "}
          {billingPeriodDescription(selectedPrice.interval_months).toLowerCase()}. Cancel anytime.
        </p>
      ) : null}
    </div>
  )
}

function SubscriptionPanel({ billing }: { billing: BillingSummary }) {
  const portal = useCreateBillingPortal()
  const openBilling = useOpenBilling()

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <h3 className="font-semibold">Your subscription</h3>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Standing</dt>
          <dd className="font-wow text-accent">{EXALTED_TIER_NAME}</dd>
        </div>
        {billing.status ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="capitalize">{billing.cancel_at_period_end ? "Canceling" : billing.status}</dd>
          </div>
        ) : null}
        {billing.current_period_end ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{billing.cancel_at_period_end ? "Ends" : "Renews"}</dt>
            <dd>{new Date(billing.current_period_end).toLocaleDateString()}</dd>
          </div>
        ) : null}
      </dl>
      <Button
        variant="outline"
        className="w-full"
        disabled={portal.isPending}
        onClick={() => void openBilling(() => portal.mutateAsync())}
      >
        Manage subscription
      </Button>
    </div>
  )
}
