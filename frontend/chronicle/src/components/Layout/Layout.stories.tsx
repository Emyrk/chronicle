import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import { Layout } from "./Layout"

const meta: Meta<typeof Layout> = {
  title: "Components/Layout",
  component: Layout,
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<Story />}>
            <Route path="/" element={<div className="p-8">Page Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
}

export default meta
type Story = StoryObj<typeof Layout>

export const LoggedOut: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/whoami", () => new HttpResponse(null, { status: 204 })),
      ],
    },
  },
}

export const LoggedIn: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/whoami", () => HttpResponse.json({ id: "1", name: "User" })),
      ],
    },
  },
}
