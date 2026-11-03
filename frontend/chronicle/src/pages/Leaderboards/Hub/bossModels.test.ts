import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  fetchGameModelUrls: vi.fn(async () => new Map([[11502, "https://icons.example/miniatures/ragnaros.glb"]])),
  fetchMiniatureUrls: vi.fn(),
  miniatureThumbnail: vi.fn(async (url: string) => `rendered:${url}`),
}))
vi.mock("@/pages/Instance/EventsPanels/Map/bossMinis", () => ({ fetchGameModelUrls: mocks.fetchGameModelUrls, fetchMiniatureUrls: mocks.fetchMiniatureUrls }))
vi.mock("@/pages/Technical/miniatureThumbnail", () => ({ miniatureThumbnail: mocks.miniatureThumbnail }))

import { BOSS_ENTRIES, bossModelImage } from "./bossModels"

describe("boss card models", () => {
  it("render the original game model from the manifest, never the miniature", async () => {
    await expect(bossModelImage("Ragnaros")).resolves.toBe("rendered:https://icons.example/miniatures/ragnaros.glb")
    await expect(bossModelImage("Lucifron")).resolves.toBeUndefined()
    expect(mocks.fetchGameModelUrls).toHaveBeenCalled()
    expect(mocks.fetchMiniatureUrls).not.toHaveBeenCalled()
  })

  it("map Blackwing Lair bosses to their published entries", () => {
    expect(BOSS_ENTRIES["Nefarian"]).toBe(11583)
    expect(BOSS_ENTRIES["Broodlord Lashlayer"]).toBe(12017)
  })
})
