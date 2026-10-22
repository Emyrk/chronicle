/// <reference types="node" />
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { loadGuidePackageSync } from "../../package"
import { applySceneBatch, createInitialScene } from "../../protocol"
import { loadGuideEventData } from "../../host/eventStreams"
import { createGuideRuntime } from "../../runtime"

function loadOnyxia() {
  const archivePath = fileURLToPath(new URL("../../../../../public/guides/chronicle.onyxia.zip", import.meta.url))
  return loadGuidePackageSync(new Uint8Array(readFileSync(archivePath)))
}

describe("Onyxia guide package", () => {
  it("loads the real ZIP and executes through the sandboxed Lua runtime", () => {
    const guide = loadOnyxia()
    expect(guide.manifest.id).toBe("chronicle.onyxia")
    expect(guide.manifest.map_id).toBe(249)
    expect(guide.manifest.event_streams).toEqual([{ type: "unit_position", path: "events/unit_position.pb" }])
    const eventData = loadGuideEventData(guide)
    const entrance = eventData.result.encounters.get("entrance")
    expect(entrance?.positionsByUnit.size).toBe(30)
    expect(entrance?.endMs).toBe(18_000)
    expect(entrance?.positionsByUnit.get("tank-01")).toHaveLength(19)

    const sources = Object.fromEntries(
      guide.paths.filter((path) => path.endsWith(".lua")).map((path) => [path, guide.readText(path)]),
    )
    const runtime = createGuideRuntime({ entrypoint: guide.manifest.entrypoint, sources })
    let scene = createInitialScene()
    scene = applySceneBatch(scene, runtime.start())

    expect(scene.chapter).toBe("entrance")
    expect(scene.nodes.get("guide-title")?.props.text).toBe("Watch the raid enter the room")
    expect(scene.nodes.get("onyxia")?.kind).toBe("unit")
    expect(scene.nodes.get("onyxia")?.props.entry).toBe(10184)
    expect(scene.nodes.has("tank-01")).toBe(true)
    expect(scene.nodes.has("melee-10")).toBe(true)
    expect(scene.nodes.has("ranged-09")).toBe(true)
    expect(scene.nodes.has("healer-08")).toBe(true)
    expect(scene.nodes.get("guide-next")?.listeners).toContain("click")
    expect(scene.nodes.get("guide-correct")?.props.text).toBe("Correct")
    expect(scene.nodes.get("guide-incorrect")?.props.text).toBe("Incorrect")

    runtime.event({ id: "guide-previous", event: "click" })
    scene = applySceneBatch(scene, runtime.flush())
    expect(scene.nodes.get("guide-title")?.props.text).toBe("Watch the raid enter the room")

    runtime.event({ id: "guide-next", event: "click" })
    scene = applySceneBatch(scene, runtime.flush())
    expect(scene.nodes.get("guide-title")?.props.text).toBe("Give every group a side")
    expect(scene.nodes.has("briefing-north")).toBe(true)

    runtime.event({ id: "guide-next", event: "click" })
    scene = applySceneBatch(scene, runtime.flush())
    expect(scene.nodes.get("guide-title")?.props.text).toBe("Flanks are safe, front and tail are not")
    expect(scene.nodes.has("p1-front")).toBe(true)
    expect(scene.nodes.has("p1-tail")).toBe(true)

    runtime.event({ id: "guide-incorrect", event: "click" })
    scene = applySceneBatch(scene, runtime.flush())
    expect(scene.nodes.has("p1-wrong-stack")).toBe(true)
    expect(scene.nodes.has("p1-wrong-text")).toBe(true)

    for (let index = 0; index < 3; index++) {
      runtime.event({ id: "guide-next", event: "click" })
      scene = applySceneBatch(scene, runtime.flush())
    }
    expect(scene.nodes.get("guide-title")?.props.text).toBe("Separate the hatchers, then burn")

    runtime.event({ id: "guide-next", event: "click" })
    scene = applySceneBatch(scene, runtime.flush())
    expect(scene.nodes.get("guide-title")?.props.text).toBe("Separate the hatchers, then burn")

    runtime.stop()
    expect(runtime.stats().stopped).toBe(true)
  })

  it("restarts into the same deterministic initial chapter", () => {
    const guide = loadOnyxia()
    const sources = Object.fromEntries(
      guide.paths.filter((path) => path.endsWith(".lua")).map((path) => [path, guide.readText(path)]),
    )
    const start = () => {
      const runtime = createGuideRuntime({ entrypoint: guide.manifest.entrypoint, sources })
      const scene = applySceneBatch(createInitialScene(), runtime.start())
      runtime.stop()
      return scene.nodes.get("guide-title")?.props.text
    }

    expect(start()).toBe("Watch the raid enter the room")
    expect(start()).toBe("Watch the raid enter the room")
  })
})
