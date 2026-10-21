/// <reference types="node" />
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { loadGuidePackageSync } from "../../package"
import { applySceneBatch, createInitialScene } from "../../protocol"
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

    const sources = Object.fromEntries(
      guide.paths.filter((path) => path.endsWith(".lua")).map((path) => [path, guide.readText(path)]),
    )
    const runtime = createGuideRuntime({ entrypoint: guide.manifest.entrypoint, sources })
    let scene = createInitialScene()
    scene = applySceneBatch(scene, runtime.start())

    expect(scene.nodes.get("guide-title")?.props.text).toBe("Give every group a side")
    expect(scene.nodes.get("onyxia")?.kind).toBe("unit")
    expect(scene.nodes.get("onyxia")?.props.entry).toBe(10184)
    expect(scene.nodes.get("guide-next")?.listeners).toContain("click")

    runtime.event({ id: "guide-next", event: "click" })
    scene = applySceneBatch(scene, runtime.flush())
    expect(scene.nodes.get("guide-title")?.props.text).toBe("Flanks are safe; front and tail are not")

    runtime.event({ id: "guide-mode", event: "click" })
    scene = applySceneBatch(scene, runtime.flush())
    expect(scene.nodes.get("guide-mode")?.props.text).toBe("Showing: Danger")
    expect(scene.nodes.has("danger-stack")).toBe(true)

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

    expect(start()).toBe("Give every group a side")
    expect(start()).toBe("Give every group a side")
  })
})
