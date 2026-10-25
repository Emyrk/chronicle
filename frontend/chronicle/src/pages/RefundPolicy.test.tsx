import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { RefundPolicy } from "./RefundPolicy"

describe("RefundPolicy", () => {
  it("states the refund and prorated credit terms", () => {
    const markup = renderToStaticMarkup(<RefundPolicy />)

    expect(markup).toContain("Payments are non-refundable")
    expect(markup).toContain("all payments to Chronicle are final and non-refundable")
    expect(markup).toContain("credit is calculated on a prorated basis")
    expect(markup).toContain("applied to your next subscription charge")
    expect(markup).toContain("Canceling does not create a refund")
    expect(markup).toContain("support@chronicleclassic.com")
  })
})
