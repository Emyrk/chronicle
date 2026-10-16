import { useState } from "react"
import { Check, Crown, EyeOff, HeartHandshake, Server, Sparkles } from "lucide-react"
import type { LucideIcon } from "lucide-react"
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

const qualityStyles: Record<BillingQuality, { text: string; border: string; glow: string; ring: string }> = {
  uncommon: {
    text: "text-quality-uncommon",
    border: "border-quality-uncommon/40",
    glow: "shadow-[0_0_24px_-6px_rgba(30,255,0,0.45)]",
    ring: "border-quality-uncommon bg-quality-uncommon",
  },
  rare: {
    text: "text-[#3d9bff]",
    border: "border-quality-rare/50",
    glow: "shadow-[0_0_24px_-6px_rgba(0,112,221,0.6)]",
    ring: "border-quality-rare bg-quality-rare",
  },
  epic: {
    text: "text-[#c06bff]",
    border: "border-quality-epic/50",
    glow: "shadow-[0_0_24px_-6px_rgba(163,53,238,0.6)]",
    ring: "border-quality-epic bg-quality-epic",
  },
  legendary: {
    text: "text-quality-legendary",
    border: "border-quality-legendary/50",
    glow: "shadow-[0_0_28px_-4px_rgba(255,128,0,0.6)]",
    ring: "border-quality-legendary bg-quality-legendary",
  },
}

const perks: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: EyeOff, title: "No advertisements", body: "Every page of Chronicle, ad-free." },
  { icon: Server, title: "Keep the lights on", body: "Funds log parsing, storage, and hosting." },
  { icon: HeartHandshake, title: "Back development", body: "Helps ship new panels and features." },
]

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

  const exalted = billing.ads_free
  const prices = billing.prices ?? []
  const monthlyPrice = prices.find((price) => price.interval_months === 1)
  const bestPriceID = bestValuePriceID(prices, monthlyPrice)
  const selectedPrice =
    prices.find((price) => price.id === (selectedPriceID ?? bestPriceID)) ?? prices[0]
  const qualities = billingPriceQualities(prices)

  return (
    <section className="max-w-5xl space-y-8">
      <ExaltedHero
        exalted={exalted}
        tier={billing.tier}
        periodEnd={billing.current_period_end}
        cancelAtPeriodEnd={billing.cancel_at_period_end}
        onManage={() => void openBilling(() => portal.mutateAsync())}
        managePending={portal.isPending}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {perks.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex gap-3 rounded-xl border bg-card/40 p-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-500 dark:text-amber-300">
              <Icon className="size-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
            </div>
          </div>
        ))}
      </div>

      {exalted ? null : (
        <div className="space-y-5">
          <div>
            <h3 className="text-lg font-semibold">Choose your path to {EXALTED_TIER_NAME}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Every option grants the same {EXALTED_TIER_NAME} standing. Longer commitments lower the monthly cost.
            </p>
          </div>

          {prices.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {prices.map((price) => {
                const selected = selectedPrice?.id === price.id
                const discount = billingDiscountPercent(price, monthlyPrice)
                const bestValue = price.id === bestPriceID
                const quality = qualityStyles[qualities.get(price.id) ?? "rare"]
                return (
                  <button
                    key={price.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedPriceID(price.id)}
                    className={cn(
                      // Styled like an in-game item tooltip regardless of site theme.
                      "group relative min-h-48 overflow-hidden rounded-xl border-2 bg-[#0b0e14] p-5 text-left text-zinc-100 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      quality.border,
                      selected ? cn(quality.glow, "-translate-y-0.5") : "opacity-85 hover:-translate-y-0.5 hover:opacity-100",
                    )}
                  >
                    {bestValue ? (
                      <>
                        <span className="legendary-shine pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                        <span className="absolute right-3 top-3 rounded-full bg-quality-legendary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-black">
                          Best value
                        </span>
                      </>
                    ) : null}
                    <div className="flex items-center gap-2 pr-20">
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center rounded-full border",
                          selected ? cn(quality.ring, "text-black") : "border-zinc-500",
                        )}
                      >
                        {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
                      </span>
                      <p className={cn("font-semibold", quality.text)}>{billingPeriodLabel(price.interval_months)}</p>
                    </div>
                    <p className="mt-1 pl-7 text-xs text-[#ffd100]">Grants {EXALTED_TIER_NAME} standing</p>
                    <div className="mt-4">
                      <span className="text-3xl font-semibold tracking-tight">
                        {formatBillingAmount(price.unit_amount, price.currency)}
                      </span>
                      <p className="mt-1 text-xs text-zinc-400">{billingPeriodDescription(price.interval_months)}</p>
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-3 border-t border-white/10 pt-3">
                      <div>
                        <p className="text-xs text-zinc-400">Monthly cost</p>
                        <p className="font-medium">{formatMonthlyAmount(price)}</p>
                      </div>
                      {discount > 0 ? (
                        <span className="rounded-md bg-quality-uncommon/10 px-2 py-1 text-xs font-semibold text-quality-uncommon">
                          Save {discount}%
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-500">Standard rate</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
              {EXALTED_TIER_NAME} pricing is temporarily unavailable.
            </p>
          )}

          <Button
            size="lg"
            disabled={!selectedPrice || checkout.isPending}
            onClick={() => selectedPrice && void openBilling(() => checkout.mutateAsync(selectedPrice.id))}
            className="gap-2 border border-amber-300/60 bg-gradient-to-b from-amber-400 to-amber-600 font-semibold text-amber-950 shadow-[0_0_20px_-4px_rgba(251,191,36,0.6)] hover:from-amber-300 hover:to-amber-500"
          >
            <Crown className="size-4" />
            Become {EXALTED_TIER_NAME}
            {selectedPrice ? ` · ${billingPeriodLabel(selectedPrice.interval_months)}` : ""}
          </Button>
        </div>
      )}
    </section>
  )
}

function ExaltedHero({
  exalted,
  tier,
  periodEnd,
  cancelAtPeriodEnd,
  onManage,
  managePending,
}: {
  exalted: boolean
  tier: string
  periodEnd?: string
  cancelAtPeriodEnd?: boolean
  onManage: () => void
  managePending: boolean
}) {
  const standing = exalted ? EXALTED_TIER_NAME : billingTierLabel(tier)
  const standingIndex = Math.max(0, STANDINGS.indexOf(standing as (typeof STANDINGS)[number]))
  // Neutral shows a sliver of progress into the standing; Exalted is a full bar.
  const fill = exalted ? 100 : ((standingIndex + 0.15) / STANDINGS.length) * 100

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-400/30 bg-[#0b0e14] p-6 text-zinc-100 sm:p-8">
      <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-amber-400/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 size-64 rounded-full bg-quality-epic/15 blur-3xl" />

      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-amber-300/50 bg-gradient-to-br from-amber-300/25 to-amber-700/10 text-amber-300 shadow-[0_0_24px_-4px_rgba(251,191,36,0.5)]">
            <Crown className="size-7" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/80">Billing</p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight">
              {exalted ? (
                <>
                  You are <span className="text-amber-300">{EXALTED_TIER_NAME}</span>
                </>
              ) : (
                <>
                  Become <span className="text-amber-300">{EXALTED_TIER_NAME}</span> with Chronicle
                </>
              )}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              {exalted
                ? "Thank you for supporting Chronicle. Your standing keeps the parsers running and the ads away."
                : "Support Chronicle, browse without advertisements, and earn the highest standing there is."}
            </p>
            {exalted && periodEnd ? (
              <p className="mt-2 text-sm text-zinc-300">
                {cancelAtPeriodEnd ? "Standing ends" : "Renews"} {new Date(periodEnd).toLocaleDateString()}.
              </p>
            ) : null}
          </div>
        </div>

        {exalted ? (
          <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
            <span className="flex items-center gap-1.5 rounded-full border border-quality-uncommon/30 bg-quality-uncommon/10 px-3 py-1.5 text-sm font-medium text-quality-uncommon">
              <Check className="size-4" /> Ad-free
            </span>
            <Button
              variant="outline"
              disabled={managePending}
              onClick={onManage}
              className="border-amber-300/40 bg-transparent text-amber-200 hover:bg-amber-300/10 hover:text-amber-100"
            >
              Manage subscription
            </Button>
          </div>
        ) : null}
      </div>

      <div className="relative mt-8">
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="font-semibold text-zinc-200">Chronicle</span>
          <span className={cn("flex items-center gap-1 font-semibold", exalted ? "text-amber-300" : "text-yellow-400")}>
            {exalted ? <Sparkles className="size-3.5" /> : null}
            {standing}
          </span>
        </div>
        <div
          role="meter"
          aria-label="Reputation with Chronicle"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fill)}
          aria-valuetext={standing}
          className="relative h-4 overflow-hidden rounded-sm border border-black bg-zinc-900 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]"
        >
          <div
            className={cn(
              "h-full",
              exalted
                ? "bg-gradient-to-b from-teal-300 via-teal-500 to-teal-700"
                : "bg-gradient-to-b from-yellow-300 via-yellow-500 to-yellow-700",
            )}
            style={{ width: `${fill}%` }}
          />
          {exalted ? (
            <span className="legendary-shine pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          ) : null}
          {STANDINGS.slice(1).map((name, i) => (
            <span
              key={name}
              className="absolute inset-y-0 w-px bg-black/60"
              style={{ left: `${((i + 1) / STANDINGS.length) * 100}%` }}
            />
          ))}
        </div>
        <div className="mt-1.5 hidden justify-between text-[10px] uppercase tracking-wider text-zinc-500 sm:flex">
          {STANDINGS.map((name, i) => (
            <span
              key={name}
              className={cn(
                "w-full text-center",
                i === standingIndex && (exalted ? "font-semibold text-amber-300" : "font-semibold text-yellow-400"),
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
