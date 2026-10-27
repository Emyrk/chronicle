import { describe, expect, it } from "vitest"
import { leavesPage } from "./useConfirmLinkNavigation"

const here = { origin: "https://chronicle.example", pathname: "/addons/p1/edit" }
const click = (href: string, overrides = {}) => ({ button: 0, modified: false, defaultPrevented: false, target: null, download: false, href, ...overrides })

describe("leavesPage", () => {
  it("guards in-app links to another page", () => {
    expect(leavesPage(click("https://chronicle.example/recent"), here)).toBe(true)
    expect(leavesPage(click("/addons/p1"), here)).toBe(true)
  })
  it("ignores links that keep this tab on the page", () => {
    expect(leavesPage(click("/addons/p1/edit?tab=code#x"), here)).toBe(false)
    expect(leavesPage(click("/recent", { target: "_blank" }), here)).toBe(false)
    expect(leavesPage(click("/recent", { modified: true }), here)).toBe(false)
    expect(leavesPage(click("/recent", { button: 1 }), here)).toBe(false)
    expect(leavesPage(click("/recent", { defaultPrevented: true }), here)).toBe(false)
    expect(leavesPage(click("/export.zip", { download: true }), here)).toBe(false)
  })
  it("leaves external links to beforeunload", () => {
    expect(leavesPage(click("https://discord.com/invite/x"), here)).toBe(false)
  })
})
