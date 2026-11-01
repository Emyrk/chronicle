import { describe, expect, it } from "vitest"
import { isInstanceIdentifier } from "./instanceIdentifier"

describe("isInstanceIdentifier", () => {
  it.each([
    "11111111-1111-4111-8111-111111111111",
    "unlisted-molten-core",
    "AbCdEfGhIjKlMn_1",
  ])("accepts an instance UUID or slug (%s)", identifier => {
    expect(isInstanceIdentifier(identifier)).toBe(true)
  })

  it.each(["", "   ", "not a slug", "instance/slug", "instance?slug"])(
    "rejects an invalid instance identifier (%s)",
    identifier => {
      expect(isInstanceIdentifier(identifier)).toBe(false)
    },
  )
})
