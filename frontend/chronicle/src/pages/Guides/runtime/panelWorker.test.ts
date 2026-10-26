import { describe, expect, it } from "vitest"
import { createPanelWorkerHandler } from "./panelWorker"

describe("Lua panel worker capability boundary", () => {
  const start = (source: string, capabilities: Array<"ui" | "input">) => {
    const messages: unknown[] = []
    const handle = createPanelWorkerHandler((message) => messages.push(message))
    handle({ type: "start", entrypoint: "main.lua", sources: { "main.lua": source }, streams: [], capabilities })
    return messages
  }

  it("does not grant UI when the manifest declares no capabilities", () => {
    expect(start(`CreateFrame("Frame", "f", UIParent)`, []))
      .toContainEqual(expect.objectContaining({ type: "error", message: expect.stringMatching(/nil value/) }))
  })

  it("does not grant input to a UI-only manifest", () => {
    expect(start(`local b=CreateFrame("Button","b",UIParent); b:SetScript("OnClick", function() end)`, ["ui"]))
      .toContainEqual(expect.objectContaining({ type: "error", message: expect.stringMatching(/input capability/) }))
  })

  it("allows UI without input callbacks", () => {
    expect(start(`CreateFrame("Frame", "f", UIParent)`, ["ui"]))
      .toContainEqual(expect.objectContaining({ type: "ready" }))
  })
})
