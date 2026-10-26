import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import type { PanelPackage } from "../Guides/package/panelLoader"
import { LuaInstancePreview, type LuaPreviewEventProvider } from "./LuaInstancePreview"

const panel: PanelPackage = { name: "Unsaved", entrypoint: "main.lua", sources: { "main.lua": "return {}", "extra.lua": "return 1" }, streams: ["damage"], capabilities: ["ui"], assets: new Map() }
const frame = new Uint8Array([1, 97, 1, 0, 0]) // encounter a, timestamp 1, zero events
let resolveFirst: ((value: Uint8Array) => void) | undefined
const calls: Array<{ instance: string; signal: AbortSignal; maxBytes: number }> = []
const provider: LuaPreviewEventProvider = {
  getDamage(instance, { signal, maxBytes }) {
    calls.push({ instance, signal, maxBytes })
    if (instance === "one") return new Promise(resolve => { resolveFirst = resolve })
    return Promise.resolve(frame)
  },
}

function Harness() {
  const [instance, setInstance] = useState("one")
  const [source, setSource] = useState(panel)
  const [mounted, setMounted] = useState(true)
  return <div>
    <button type="button" onClick={() => setInstance("two")}>Select instance two</button>
    <button type="button" onClick={() => setSource({ ...panel, sources: { ...panel.sources, "main.lua": "return { changed = true }" } })}>Edit unsaved source</button>
    <button type="button" onClick={() => setMounted(false)}>Close preview</button>
    {mounted && <LuaInstancePreview panel={source} instanceId={instance} encounterIds={["a"]} events={provider} />}
  </div>
}

const meta = { title: "Pages/LuaProjects/UnsavedInstancePreview", component: Harness } satisfies Meta<typeof Harness>
export default meta
type Story = StoryObj<typeof meta>

export const InstanceChangeAndWorkerCleanup: Story = {
  play: async ({ canvasElement }) => {
    calls.length = 0
    resolveFirst = undefined
    const canvas = within(canvasElement)
    const originalWorker = window.Worker
    const workers: Array<{ messages: unknown[]; terminated: boolean }> = []
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: (() => void) | null = null
      messages: unknown[] = []
      terminated = false
      constructor() { workers.push(this) }
      postMessage(value: unknown) { this.messages.push(value) }
      terminate() { this.terminated = true }
    }
    window.Worker = FakeWorker as unknown as typeof Worker
    try {
      await userEvent.click(canvas.getByRole("button", { name: "Run preview" }))
      await expect(calls.at(-1)?.instance).toBe("one")
      await userEvent.click(canvas.getByRole("button", { name: "Select instance two" }))
      await expect(calls.at(-1)?.signal.aborted).toBe(true)
      resolveFirst?.(frame)
      await expect(canvas.queryByText("Loading events…")).not.toBeInTheDocument()
      await userEvent.click(canvas.getByRole("button", { name: "Run preview" }))
      await waitFor(() => expect(workers).toHaveLength(1))
      await expect(calls.at(-1)).toMatchObject({ instance: "two", maxBytes: 32_000_000 })
      await expect(workers[0].messages[0]).toMatchObject({ type: "start", sources: panel.sources })
      await userEvent.click(canvas.getByRole("button", { name: "Edit unsaved source" }))
      await waitFor(() => expect(workers[0].terminated).toBe(true))
      await userEvent.click(canvas.getByRole("button", { name: "Run preview" }))
      await waitFor(() => expect(workers).toHaveLength(2))
      await expect(workers[1].messages[0]).toMatchObject({ type: "start", sources: { "main.lua": "return { changed = true }", "extra.lua": "return 1" } })
      await userEvent.click(canvas.getByRole("button", { name: "Cancel preview" }))
      await waitFor(() => expect(workers[1].terminated).toBe(true))
      await userEvent.click(canvas.getByRole("button", { name: "Run preview" }))
      await waitFor(() => expect(workers).toHaveLength(3))
      await userEvent.click(canvas.getByRole("button", { name: "Close preview" }))
      await waitFor(() => expect(workers[2].terminated).toBe(true))
    } finally {
      window.Worker = originalWorker
    }
  },
}
