import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { BillingSignInPrompt } from "./BillingSettings"

describe("BillingSignInPrompt", () => {
  it("returns signed-out users to billing after sign in", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <BillingSignInPrompt />
      </MemoryRouter>,
    )

    expect(markup).toContain("Sign in")
    expect(markup).toContain('href="/login?from=/account/billing"')
    expect(markup).not.toContain("Paid subscriptions are not available yet")
  })
})
