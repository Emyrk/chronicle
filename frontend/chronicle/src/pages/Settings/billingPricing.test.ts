import { describe, expect, it } from "vitest"
import type { BillingPrice } from "@/api/typesGenerated"
import {
  bestValuePriceID,
  billingDiscountPercent,
  billingPeriodDescription,
  billingPeriodLabel,
  billingPriceQualities,
  billingTierLabel,
  formatMonthlyAmount,
} from "./billingPricing"

const monthly: BillingPrice = {
  id: "price_monthly",
  currency: "usd",
  unit_amount: 200,
  interval_months: 1,
}

const quarterly: BillingPrice = {
  id: "price_quarterly",
  currency: "usd",
  unit_amount: 500,
  interval_months: 3,
}

const annual: BillingPrice = {
  id: "price_annual",
  currency: "usd",
  unit_amount: 1800,
  interval_months: 12,
}

describe("billing pricing", () => {
  it("formats period labels", () => {
    expect(billingPeriodLabel(1)).toBe("Monthly")
    expect(billingPeriodLabel(3)).toBe("3 months")
    expect(billingPeriodLabel(12)).toBe("Annual")
    expect(billingPeriodDescription(12)).toBe("Billed once a year")
  })

  it("calculates the effective monthly price", () => {
    expect(formatMonthlyAmount(quarterly)).toContain("1.67")
    expect(formatMonthlyAmount(annual)).toContain("1.50")
  })

  it("calculates bulk discounts against the monthly rate", () => {
    expect(billingDiscountPercent(monthly, monthly)).toBe(0)
    expect(billingDiscountPercent(quarterly, monthly)).toBe(17)
    expect(billingDiscountPercent(annual, monthly)).toBe(25)
  })

  it("marks the largest discount as the best value", () => {
    expect(bestValuePriceID([monthly, quarterly, annual], monthly)).toBe("price_annual")
  })
})

describe("billingTierLabel", () => {
  it("presents the supporter product as Exalted", () => {
    expect(billingTierLabel("supporter")).toBe("Exalted")
    expect(billingTierLabel("free")).toBe("Friendly")
  })
})

describe("billingPriceQualities", () => {
  it("assigns rarer qualities to longer periods", () => {
    const qualities = billingPriceQualities([annual, monthly, quarterly])
    expect(qualities.get(monthly.id)).toBe("rare")
    expect(qualities.get(quarterly.id)).toBe("epic")
    expect(qualities.get(annual.id)).toBe("legendary")
  })
})
