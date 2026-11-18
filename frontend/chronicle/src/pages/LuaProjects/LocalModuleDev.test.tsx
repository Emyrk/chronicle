import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocalModuleDev } from "./LocalModuleDev"

const events = { getStream: vi.fn() }
afterEach(() => vi.unstubAllGlobals())

describe("local module approval", () => {
  it("requires explicit approval and explains data access before connecting", () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    const html = renderToStaticMarkup(<LocalModuleDev token={"a".repeat(64)} instanceId="" encounterIds={[]} events={events} />)
    expect(html).toContain("Connect local dev server")
    expect(html).toContain("player names")
    expect(html).toContain("not these local files")
    expect(html).not.toContain("a".repeat(64))
    expect(fetch).not.toHaveBeenCalled()
    expect(events.getStream).not.toHaveBeenCalled()
  })

  it("does not offer connection or execute code in safe mode", () => {
    vi.stubGlobal("window", { location: { search: "?safe=1" } })
    const html = renderToStaticMarkup(<LocalModuleDev token={"a".repeat(64)} instanceId="" encounterIds={[]} events={events} />)
    expect(html).toContain("disabled by ?safe=1")
    expect(html).not.toContain("Connect local dev server")
  })
})
