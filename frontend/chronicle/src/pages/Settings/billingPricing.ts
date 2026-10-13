import type { BillingPrice } from "@/api/typesGenerated"

export function formatBillingAmount(unitAmount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(unitAmount / 100)
}

export function formatMonthlyAmount(price: BillingPrice): string {
  return formatBillingAmount(price.unit_amount / price.interval_months, price.currency)
}

export function billingPeriodLabel(months: number): string {
  if (months === 1) return "Monthly"
  if (months === 12) return "Annual"
  return `${months} months`
}

export function billingPeriodDescription(months: number): string {
  if (months === 1) return "Billed every month"
  if (months === 12) return "Billed once a year"
  return `Billed every ${months} months`
}

export function billingDiscountPercent(price: BillingPrice, monthlyPrice?: BillingPrice): number {
  if (!monthlyPrice || monthlyPrice.interval_months !== 1) return 0
  const fullMonthlyCost = monthlyPrice.unit_amount * price.interval_months
  if (fullMonthlyCost <= 0 || price.unit_amount >= fullMonthlyCost) return 0
  return Math.round((1 - price.unit_amount / fullMonthlyCost) * 100)
}

export function bestValuePriceID(prices: readonly BillingPrice[], monthlyPrice?: BillingPrice): string | undefined {
  let bestID: string | undefined
  let bestDiscount = 0
  for (const price of prices) {
    const discount = billingDiscountPercent(price, monthlyPrice)
    if (discount > bestDiscount) {
      bestDiscount = discount
      bestID = price.id
    }
  }
  return bestID
}
