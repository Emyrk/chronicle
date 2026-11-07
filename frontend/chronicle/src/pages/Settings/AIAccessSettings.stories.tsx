import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { MemoryRouter } from "react-router-dom";
import type { AIKeyUsage } from "@/api/typesGenerated";
import { activeAIKey, aiKeyUsage, expiredAIKey } from "@/features/aiKey/aiKey.fixtures";
import { AIAccessSettings } from "./AIAccessSettings";

function handlers(usage: AIKeyUsage, opts: { delayMs?: number | "infinite"; status?: number } = {}) {
  return [
    http.get("/api/v1/me/ai-key", async () => {
      if (opts.delayMs) await delay(opts.delayMs);
      if (opts.status) return HttpResponse.json({ message: "Something went wrong." }, { status: opts.status });
      return HttpResponse.json(usage);
    }),
    // Mutations succeed without changing the fixture so controls can be clicked.
    http.post("/api/v1/me/ai-key", () => HttpResponse.json({ key: activeAIKey, created: true, secret: "ck_storybook" }, { status: 201 })),
    http.post("/api/v1/me/ai-key/rotate", () => HttpResponse.json({ key: activeAIKey, created: true, secret: "ck_storybook" }, { status: 201 })),
    http.delete("/api/v1/me/ai-key", () => HttpResponse.json({ message: "Your AI key was revoked. Links with it no longer work." })),
  ];
}

const meta: Meta<typeof AIAccessSettings> = {
  title: "Pages/Settings/AI access",
  component: AIAccessSettings,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="max-w-3xl p-6">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof AIAccessSettings>;

export const ActiveKey: Story = { parameters: { msw: { handlers: handlers(aiKeyUsage("free", activeAIKey)) } } };

export const NoKey: Story = { parameters: { msw: { handlers: handlers(aiKeyUsage("free")) } } };

export const ExpiredKey: Story = { parameters: { msw: { handlers: handlers(aiKeyUsage("honored", expiredAIKey)) } } };

export const ExaltedPrivateData: Story = {
  parameters: { msw: { handlers: handlers(aiKeyUsage("exalted", { ...activeAIKey, private_data: true, last_user_agent: "Claude-User/1.0" })) } },
};

export const Loading: Story = { parameters: { msw: { handlers: handlers(aiKeyUsage("free"), { delayMs: "infinite" }) } } };

export const LoadError: Story = { parameters: { msw: { handlers: handlers(aiKeyUsage("free"), { status: 500 }) } } };
