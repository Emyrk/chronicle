import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { MapControlsSettings } from "./MapControlsSettings";

const meta: Meta<typeof MapControlsSettings> = {
  title: "Instance/Map/MapControlsSettings",
  component: MapControlsSettings,
  args: { onClose: () => {} },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ width: 420, height: 380 }} className="rounded-md border border-border bg-card p-4">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MapControlsSettings>;

// The server keeps the saved bindings between requests, like the real one.
let saved: Record<string, string> = { rotate_left: "ArrowLeft", rotate_right: "ArrowRight" };

export const SignedIn: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/v1/whoami", () => HttpResponse.json({ user_id: "00000000-0000-0000-0000-000000000001", roles: [] })),
        http.get("/api/v1/me/map-controls", () => HttpResponse.json({ bindings: saved })),
        http.put("/api/v1/me/map-controls", async ({ request }) => {
          saved = ((await request.json()) as { bindings: Record<string, string> }).bindings;
          return HttpResponse.json({ bindings: saved });
        }),
        http.delete("/api/v1/me/map-controls", () => {
          saved = {};
          return HttpResponse.json({ bindings: saved });
        }),
      ],
    },
  },
};

export const SignedOut: Story = {
  parameters: {
    msw: {
      handlers: [http.get("/api/v1/whoami", () => new HttpResponse(null, { status: 401 }))],
    },
  },
};
