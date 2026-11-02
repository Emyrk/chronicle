import type { Meta, StoryObj } from "@storybook/react-vite"
import { http, HttpResponse } from "msw"
import { MemoryRouter } from "react-router-dom"
import { AdSuppressionContext } from "./adSuppression"
import { OwnerAdFreeBadge } from "./OwnerAdFreeBadge"

const meta = {
  title: "Ads/OwnerAdFreeBadge",
  component: OwnerAdFreeBadge,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <AdSuppressionContext value>
          <div className="flex min-h-40 items-center justify-center bg-background p-8 text-foreground">
            <Story />
          </div>
        </AdSuppressionContext>
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    msw: {
      handlers: [
        http.get("/api/v1/site-config", () =>
          HttpResponse.json({
            signups_enabled: true,
            client_uploads_disabled: false,
            billing_enabled: true,
            ads_enabled: true,
            tenant: null,
          }),
        ),
        http.get("/api/v1/whoami", () => new HttpResponse(null, { status: 204 })),
      ],
    },
  },
  args: {
    subject: "log",
  },
} satisfies Meta<typeof OwnerAdFreeBadge>

export default meta

type Story = StoryObj<typeof meta>

export const Instance: Story = {}

export const Armory: Story = {
  args: {
    subject: "character",
  },
}
