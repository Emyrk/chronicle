import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { EmeraldSanctumModeSwitch } from "./EmeraldSanctumModeSwitch"

describe("EmeraldSanctumModeSwitch", () => {
  it("renders Normal and Hard Mode with the selected mode exposed accessibly", () => {
    const markup = renderToStaticMarkup(
      <EmeraldSanctumModeSwitch value="hard" onChange={() => undefined} />,
    )

    expect(markup.indexOf("Normal")).toBeLessThan(markup.indexOf("Hard Mode"))
    expect(markup).toContain('aria-label="Emerald Sanctum mode"')
    expect(markup).toContain('aria-pressed="false"')
    expect(markup).toContain('aria-pressed="true"')
  })
})
