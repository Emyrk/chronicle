import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

interface GuideCatalog {
  catalog_version: number
  guides: Array<{
    id: string
    aliases: string[]
    package_url: string
    name: string
    description: string
    author: string
    game: string
    encounters: string[]
  }>
}

describe("built-in guide catalog", () => {
  it("publishes server-readable metadata from the guide manifest", async () => {
    const [catalogJSON, manifestJSON] = await Promise.all([
      readFile(resolve(process.cwd(), "public/guides/catalog.json"), "utf8"),
      readFile(resolve(process.cwd(), "src/pages/Guides/examples/onyxia/guide.json"), "utf8"),
    ])
    const catalog = JSON.parse(catalogJSON) as GuideCatalog
    const manifest = JSON.parse(manifestJSON) as GuideCatalog["guides"][number]
    const guide = catalog.guides.find(({ id }) => id === manifest.id)

    expect(catalog.catalog_version).toBe(1)
    expect(guide).toEqual(expect.objectContaining({
      id: manifest.id,
      aliases: ["onyxia"],
      package_url: `/guides/${manifest.id}.zip`,
      name: manifest.name,
      description: manifest.description,
      author: manifest.author,
      game: manifest.game,
      encounters: manifest.encounters,
    }))
  })
})
