import { describe, expect, it } from "vitest"
import { modulePath, authorPath, urlName, urlNameInput, validAuthorName } from "./api"
import { isModuleId } from "./moduleRoute"

describe("module names", () => {
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
    expect(modulePath({ id: "00000000-0000-4000-8000-000000000001", author: "steven", slug: "interrupt-tracker" }, "/edit")).toBe("/modules/steven/interrupt-tracker/edit")
    expect(modulePath({ id: "00000000-0000-4000-8000-000000000001", slug: "interrupt-tracker" })).toBe("/modules/id/00000000-0000-4000-8000-000000000001")
    expect(authorPath("steven")).toBe("/modules/steven")
    expect(isModuleId("00000000-0000-4000-8000-000000000001")).toBe(true)
    expect(isModuleId("steven")).toBe(false)
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
