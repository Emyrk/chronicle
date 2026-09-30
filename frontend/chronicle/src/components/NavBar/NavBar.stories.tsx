import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw"
import { MemoryRouter } from "react-router-dom"
import { NavBar } from "./NavBar"

const meta: Meta<typeof NavBar> = {
  title: "Components/NavBar",
  component: NavBar,
  decorators: [
    (Story, context) => (
      <MemoryRouter initialEntries={[context.parameters.route ?? "/"]}>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
}

export default meta
type Story = StoryObj<typeof NavBar>

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/whoami", async () => {
          await delay("infinite")
          return HttpResponse.json({})
        }),
      ],
    },
  },
}

export const LoggedOut: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/whoami", () => new HttpResponse(null, { status: 401 })),
      ],
    },
  },
}

export const GuildPage: Story = {
  parameters: {
    route: "/g/example-guild",
    msw: {
      handlers: [
        http.get("/api/v1/whoami", () => new HttpResponse(null, { status: 401 })),
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
