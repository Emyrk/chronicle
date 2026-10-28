import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { AddonReleases, ReleasesTable } from "./AddonReleases"
import { latestRelease, type LuaProject } from "./api"

const release = (tag: string, available: boolean) =>
  ({ tag, available, sha256: available ? tag.repeat(32).slice(0, 64) : undefined, published_at: "2026-10-01T00:00:00Z" })
const project: LuaProject = {
  id: "p", owner_id: "o", kind: "panel", name: "Kicks", slug: "kicks", revision: 1, description: "", stars: 1, starred: false,
  created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
  releases: [release("v5", true), release("v4", true), release("v3", true), release("v2", false), release("v1", false)],
}
const noop = () => {}

describe("addon releases", () => {
  it("lists only releases with files in the sidebar, and links to the rest", () => {
    const html = renderToStaticMarkup(<AddonReleases project={project} latest={latestRelease(project)} viewing="v5" canTag={false} canRelease={false}
      busy={false} onView={noop} onTag={noop} onDelete={noop} onShowAll={noop} />)
    for (const tag of ["v5", "v4", "v3"]) expect(html).toContain(`>${tag}</span>`)
    expect(html).not.toContain(">v2</span>")
    expect(html).not.toContain("Files removed")
    expect(html).toContain("See all 5 releases, including 2 without files")
  })

  it("lists every release in the table, marking removed files", () => {
    const html = renderToStaticMarkup(<ReleasesTable project={project} latest={latestRelease(project)} viewing="v5" canRelease
      busy={false} onView={noop} onDelete={noop} onClose={noop} />)
    for (const tag of ["v5", "v4", "v3", "v2", "v1"]) expect(html).toContain(`>${tag}</span>`)
    expect(html.match(/Files removed/g)).toHaveLength(2)
    expect(html.match(/aria-label="Delete v\d"/g)).toHaveLength(5)
  })
})
