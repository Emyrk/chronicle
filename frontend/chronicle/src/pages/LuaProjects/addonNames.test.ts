import { describe, expect, it } from "vitest"
import { addonPath, urlName, urlNameInput } from "./api"

describe("addon names", () => {
  it("suggests URL-safe names from display text", () => {
    expect(urlName("Interrupt Tracker!")).toBe("interrupt-tracker")
    expect(urlName("  Émile's  Kicks  ")).toBe("emile-s-kicks")
    expect(urlName("x".repeat(40) + " tail")).toBe("x".repeat(32))
  })

  it("keeps a trailing hyphen while typing", () => {
    expect(urlNameInput("My-")).toBe("my-")
    expect(urlNameInput("-My  Name")).toBe("my-name")
  })

  it("uses the named address once the owner has an author name", () => {
    expect(addonPath({ id: "00000000-0000-4000-8000-000000000001", author: "steven", slug: "interrupt-tracker" }, "/edit")).toBe("/addons/steven/interrupt-tracker/edit")
    expect(addonPath({ id: "00000000-0000-4000-8000-000000000001", slug: "interrupt-tracker" })).toBe("/addons/00000000-0000-4000-8000-000000000001")
  })
})
