import type { Meta, StoryObj } from "@storybook/react-vite"
import { http, HttpResponse } from "msw"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { strToU8, zipSync } from "fflate"
import type { LuaProject, LuaProjectPermissions } from "./api"
import { LuaProjectPage } from "./LuaProjectPage"

const README = `# Summarize Consumes

A plain-text consumables report inspired by [melbaa/summarize_consumes](https://github.com/melbaa/summarize_consumes).

Select encounters, then run the module. Players and consumables are sorted by name.

## What is counted

- Uses come from Chronicle's native \`consume\` stream.
- Deaths come from \`slain\`. Pets and NPCs are excluded.
`

const PROJECT_JSON = JSON.stringify({
  manifest_version: 1, kind: "panel", name: "summarize_consumes", slug: "summarize-consumes", entrypoint: "main.lua",
  capabilities: ["ui", "input"], streams: ["consume", "slain"], stream_scope: "selection", assets: [], icon: "flask-conical",
}, null, 2)

/** A real package ZIP, so the file list and README render as they do on the site. */
const PACKAGE = zipSync({
  "README.md": strToU8(README),
  "main.lua": strToU8(`local consume = require("chronicle.v1.events.consume")\n-- ...\n`),
  "project.json": strToU8(PROJECT_JSON),
})

const PROJECT: LuaProject = {
  id: "11111111-1111-4111-8111-111111111111", owner_id: "owner-1", kind: "panel", name: "summarize_consumes", slug: "summarize-consumes",
  revision: 7, description: "Sourced from https://github.com/melbaa/summarize_consumes", author: "chronicle",
  flavor: ["vanilla", "nightmare-of-ursol"], stars: 3, starred: true,
  main: { sha256: "57d392b0", icon: "flask-conical", updated_at: "2026-11-18T00:00:00Z" },
  releases: [
    { tag: "v2", available: true, sha256: "57d392b0", icon: "flask-conical", published_at: "2026-11-18T00:00:00Z", published_by_author: "chronicle" },
    { tag: "v1", available: true, sha256: "179f1470", icon: "flask-conical", published_at: "2026-11-18T00:00:00Z", published_by_author: "chronicle" },
  ],
  created_at: "2026-11-18T00:00:00Z", updated_at: "2026-11-18T00:00:00Z",
}

const AUTHOR: LuaProjectPermissions = { view: true, use: true, edit: true, release: true, manage: true }
const VISITOR: LuaProjectPermissions = { view: true, use: true, edit: false, release: false, manage: false }

function handlers({ project = PROJECT, permissions = AUTHOR, signedIn = true }: { project?: LuaProject; permissions?: LuaProjectPermissions; signedIn?: boolean } = {}) {
  return [
    http.get("/api/v1/site-config", () => HttpResponse.json({ signups_enabled: true, client_uploads_disabled: false, billing_enabled: false, ads_enabled: false, tenant: null, dataset_flavor: ["vanilla", "nightmare-of-ursol"] })),
    http.get("/api/v1/whoami", () => signedIn ? HttpResponse.json({ user_id: "user-1", session_id: "session-1", roles: [], ads_free: true }) : new HttpResponse(null, { status: 204 })),
    http.get("/api/v1/modules/:author/:slug", () => HttpResponse.json({ project, permissions })),
    http.get("/api/v1/lua-projects/:id/artifacts/:sha/package", () => HttpResponse.arrayBuffer(PACKAGE.slice().buffer)),
    http.get("/api/v1/inference/usage/lua-project/:id/contributors", () => HttpResponse.json([])),
  ]
}

const meta = {
  title: "Pages/LuaProjects/LuaProjectPage",
  component: LuaProjectPage,
  parameters: { layout: "fullscreen", msw: { handlers: handlers() } },
  decorators: [(Story) => <MemoryRouter initialEntries={["/modules/chronicle/summarize-consumes"]}>
    <Routes><Route path="/modules/:author/:slug" element={<Story />} /></Routes>
  </MemoryRouter>],
} satisfies Meta<typeof LuaProjectPage>

export default meta
type Story = StoryObj<typeof meta>

/** The owner's view: Track, Open in Workshop and the ⋯ menu; listing tags and the address in About. */
export const Author: Story = {}

/** Someone who can only view and use it: no Workshop, menu or editing. */
export const Visitor: Story = {
  parameters: { msw: { handlers: handlers({ permissions: VISITOR, project: { ...PROJECT, starred: false } }) } },
}

/** An owner who has not written a description yet. */
export const NoDescription: Story = {
  parameters: { msw: { handlers: handlers({ project: { ...PROJECT, description: "" } }) } },
}

/** A long name and description at phone width: the actions wrap below the title. */
export const Narrow: Story = {
  parameters: {
    viewport: { defaultViewport: "mobile2" },
    msw: { handlers: handlers({ project: { ...PROJECT, name: "summarize_consumes_with_a_much_longer_name",
      description: "A plain-text consumables report for every player in the selected encounters, with deaths and estimated gold spent. Sourced from https://github.com/melbaa/summarize_consumes" } }) },
  },
}
