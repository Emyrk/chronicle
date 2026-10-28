import { describe, expect, it } from "vitest"
import { createGuideRuntime } from "../Guides/runtime/runtime"
import doc from "./lua-panel-api.md?raw"

const blocks = (tag: string) => [...doc.matchAll(new RegExp("```" + tag + "\\n([\\s\\S]*?)```", "g"))].map(match => match[1])

function run(source: string) {
  const runtime = createGuideRuntime({ entrypoint: "main.lua", sources: { "main.lua": source }, capabilities: ["ui"], panelStreams: ["damage"],
    units: {
      "0xP1": { guid: "0xP1", name: "Thrall", player: true, class: "SHAMAN" },
      "0xP2": { guid: "0xP2", name: "Jaina", player: true, class: "MAGE" },
      "0xPET": { guid: "0xPET", name: "Wolf", player: false, owner: "0xP1", entry: 1863 },
      "0xNPC": { guid: "0xNPC", name: "Ragnaros", player: false, entry: 11502 },
    } })
  const operations = [...runtime.start()]
  for (const [source, amount] of [["0xP1", 100], ["0xPET", 50], ["0xP2", 400], ["0xNPC", 999]] as const) {
    runtime.panelEvent({ stream: "damage", source, target: "0xNPC", amount, offsetMs: 0, encounterId: "e1", selected: true })
    operations.push(...runtime.flush())
  }
  runtime.panelComplete()
  operations.push(...runtime.flush())
  runtime.stop()
  return operations
}

describe("Lua panel API reference", () => {
  it("quick start runs and draws the total once", () => {
    const texts = run(blocks("lua")[0]).filter(op => op.op === "set").map(op => (op as { props: { text?: string } }).props.text)
    expect(texts).toContain("Total damage: 1549")
  })

  it("full example credits pets to owners and draws class-coloured bars", () => {
    const [example] = blocks("lua example")
    expect(example).toBeDefined()
    const texts = run(example).filter(op => op.op === "set").map(op => (op as { props: { text?: string } }).props.text).filter(Boolean)
    expect(texts).toEqual(["Jaina  400", "Thrall  150"])
  })
})
