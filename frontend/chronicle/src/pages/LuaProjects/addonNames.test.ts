import { describe, expect, it } from "vitest"
import { addonPath, authorPath, urlName, urlNameInput, validAuthorName } from "./api"
import { isAddonId } from "./addonRoute"

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
    expect(addonPath({ id: "00000000-0000-4000-8000-000000000001", slug: "interrupt-tracker" })).toBe("/addons/id/00000000-0000-4000-8000-000000000001")
    expect(authorPath("steven")).toBe("/addons/steven")
    expect(isAddonId("00000000-0000-4000-8000-000000000001")).toBe(true)
    expect(isAddonId("steven")).toBe(false)
    expect([validAuthorName("stev"), validAuthorName("steven"), validAuthorName("steven-"), validAuthorName("a".repeat(33))]).toEqual([false, true, false, false])
  })
})

describe("release tags", () => {
  it("suggests the next tag after the newest release", async () => {
    const { nextReleaseTag } = await import("./api")
    expect(nextReleaseTag([])).toBe("v1")
    expect(nextReleaseTag([{ tag: "v1.2" }, { tag: "v1.1" }])).toBe("v1.3")
    expect(nextReleaseTag([{ tag: "7" }])).toBe("8")
    expect(nextReleaseTag([{ tag: "beta" }])).toBe("beta-2")
  })
})
