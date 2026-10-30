import type { Meta, StoryObj } from "@storybook/react-vite"
import { http, HttpResponse, delay } from "msw"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { NewModulePage } from "./NewModulePage"

function handlers({ author = "chronicle", permission = true, permissionLoading = false }: { author?: string | null; permission?: boolean; permissionLoading?: boolean } = {}) {
  return [
    http.get("/api/v1/site-config", () => HttpResponse.json({ signups_enabled: true, client_uploads_disabled: false, billing_enabled: false, ads_enabled: false, tenant: null })),
    http.get("/api/v1/whoami", () => HttpResponse.json({ user_id: "user-1", session_id: "session-1", roles: [], ads_free: false })),
    http.get("/api/v1/me/module-author", () => author ? HttpResponse.json({ name: author }) : new HttpResponse(null, { status: 204 })),
    http.post("/api/v1/authcheck", async () => {
      if (permissionLoading) await delay("infinite")
      return HttpResponse.json({ createLuaProject: permission })
    }),
  ]
}

const meta = {
  title: "Pages/LuaProjects/NewModulePage",
  component: NewModulePage,
  parameters: { layout: "fullscreen", msw: { handlers: handlers() } },
  decorators: [(Story) => <MemoryRouter initialEntries={["/modules/new"]}><Routes><Route path="/modules/new" element={<Story />} /></Routes></MemoryRouter>],
} satisfies Meta<typeof NewModulePage>

export default meta
type Story = StoryObj<typeof meta>

/** Name, address, and an optional description, ready to submit. */
export const Form: Story = {
  parameters: { msw: { handlers: handlers() } },
}

/** Below Revered: the form is replaced with an explanation. */
export const PermissionDenied: Story = {
  parameters: { msw: { handlers: handlers({ permission: false }) } },
}

/** While the authorization check is still in flight. */
export const CheckingPermission: Story = {
  parameters: { msw: { handlers: handlers({ permissionLoading: true }) } },
}
