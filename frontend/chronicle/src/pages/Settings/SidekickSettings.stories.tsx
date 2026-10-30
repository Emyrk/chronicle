import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SidekickSettings } from "./SidekickSettings";
import type { ListSidekicksResponse, SidekickInstallation } from "@/api/typesGenerated";

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const wowdir = (n: number) => `wowdir_${String(n).repeat(64).slice(0, 64)}`;

const baseSidekick: SidekickInstallation = {
  id: "8f6f2a54-7a8c-4b38-9d37-0f8a7a1c0001",
  name: "Gaming PC",
  platform: "windows/amd64",
  sidekick_version: "0.4.2",
  start_at_login: true,
  auto_upload_capabilities: { "wotlk_3.3.5a": ["on_game_exit"] },
  online: true,
  last_seen_at: ago(18 * SECOND),
  last_upload_at: ago(2 * HOUR),
  created_at: ago(12 * DAY),
  wow_directories: [
    {
      id: wowdir(1),
      path: "C:\\Games\\Ascension\\World of Warcraft",
      realmlist: "logon.project-ascension.com",
      tenant_name: "Ascension",
      tenant_base_url: "https://ascension.chronicleclassic.com",
      game_format: "wotlk_3.3.5a",
    },
    {
      id: wowdir(2),
      path: "D:\\WoW\\Warmane 3.3.5a",
      realmlist: "logon.warmane.com",
    },
  ],
  issues: [],
  configuration: {
    config: {
      version: 1,
      archive: { enabled: true, retention_days: 7 },
      wow_directories: {
        [wowdir(1)]: { game_format: "wotlk_3.3.5a", auto_upload: "on_game_exit" },
      },
    },
    hash: "abc123",
  },
};

const laptop: SidekickInstallation = {
  ...baseSidekick,
  id: "8f6f2a54-7a8c-4b38-9d37-0f8a7a1c0002",
  name: "Travel Laptop",
  platform: "darwin/arm64",
  sidekick_version: "0.4.1",
  start_at_login: false,
  online: false,
  last_seen_at: ago(5 * HOUR),
  last_upload_at: ago(4 * DAY),
  created_at: ago(40 * DAY),
  wow_directories: [{ id: wowdir(3), path: "/Users/me/Games/WoW 3.3.5a", game_format: "wotlk_3.3.5a" }],
  configuration: {
    ...baseSidekick.configuration!,
    config: {
      version: 1,
      archive: { enabled: false, retention_days: 30 },
      wow_directories: { [wowdir(3)]: { game_format: "wotlk_3.3.5a", auto_upload: "disabled" } },
    },
  },
};

const overdue: SidekickInstallation = {
  ...baseSidekick,
  id: "8f6f2a54-7a8c-4b38-9d37-0f8a7a1c0003",
  name: "Raid Desktop",
  last_seen_at: ago(95 * SECOND),
  issues: [
    {
      id: "issue-1",
      code: "combatlog_unreadable",
      message: "Could not read WoWCombatLog.txt",
      details: "open C:\\Games\\Ascension\\World of Warcraft\\Logs\\WoWCombatLog.txt: The process cannot access the file because it is being used by another process.",
      first_reported_at: ago(40 * MINUTE),
      last_reported_at: ago(95 * SECOND),
    },
    {
      id: "issue-2",
      code: "upload_failed",
      message: "Upload failed: server returned 502",
      first_reported_at: ago(3 * DAY),
      last_reported_at: ago(3 * DAY),
      resolved_at: ago(2 * DAY),
    },
  ],
};

const disconnected: SidekickInstallation = {
  ...laptop,
  id: "8f6f2a54-7a8c-4b38-9d37-0f8a7a1c0004",
  name: "Old PC",
  last_seen_at: ago(20 * DAY),
  disconnected_at: ago(19 * DAY),
};

const neverSeen: SidekickInstallation = {
  ...baseSidekick,
  id: "8f6f2a54-7a8c-4b38-9d37-0f8a7a1c0005",
  name: "New Install",
  online: false,
  last_seen_at: undefined,
  last_upload_at: undefined,
  sidekick_version: undefined,
  platform: undefined,
  wow_directories: [],
  configuration: undefined,
};

function handlers(sidekicks: SidekickInstallation[], opts: { delayMs?: number | "infinite"; status?: number } = {}) {
  return [
    http.get("/api/v1/me/sidekicks", async () => {
      if (opts.delayMs) await delay(opts.delayMs);
      if (opts.status) return new HttpResponse(null, { status: opts.status });
      const body: ListSidekicksResponse = { sidekicks };
      return HttpResponse.json(body);
    }),
    // Mutations succeed without changing the fixture so controls can be clicked.
    http.put("/api/v1/me/sidekicks/:id/config", () => HttpResponse.json({})),
    http.patch("/api/v1/me/sidekicks/:id", () => HttpResponse.json(sidekicks[0])),
    http.delete("/api/v1/me/sidekicks/:id", () => new HttpResponse(null, { status: 204 })),
    http.delete("/api/v1/me/sidekicks/:id/installation", () => new HttpResponse(null, { status: 204 })),
  ];
}

const meta: Meta<typeof SidekickSettings> = {
  title: "Pages/Settings/Sidekick",
  component: SidekickSettings,
  decorators: [
    (Story, context) => (
      <MemoryRouter initialEntries={[context.parameters.route ?? "/settings/sidekick"]}>
        <div className="p-6">
          <Routes>
            <Route path="/settings/sidekick" element={<Story />} />
            <Route path="/settings/sidekick/installations/:sidekickID" element={<Story />} />
          </Routes>
        </div>
      </MemoryRouter>
    ),
  ],
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof SidekickSettings>;

export const Single: Story = {
  parameters: { msw: { handlers: handlers([baseSidekick]) } },
};

export const Multiple: Story = {
  parameters: { msw: { handlers: handlers([baseSidekick, overdue, laptop, disconnected]) } },
};

export const HeartbeatOverdueWithIssues: Story = {
  parameters: { msw: { handlers: handlers([overdue]) } },
};

export const Offline: Story = {
  parameters: { msw: { handlers: handlers([laptop]) } },
};

export const Disconnected: Story = {
  parameters: { msw: { handlers: handlers([disconnected]) } },
};

export const NeverSeen: Story = {
  parameters: { msw: { handlers: handlers([neverSeen]) } },
};

export const DeepLinked: Story = {
  parameters: {
    route: `/settings/sidekick/installations/${overdue.id}`,
    msw: { handlers: handlers([baseSidekick, overdue, laptop]) },
  },
};

export const Empty: Story = {
  parameters: { msw: { handlers: handlers([]) } },
};

export const Loading: Story = {
  parameters: { msw: { handlers: handlers([], { delayMs: "infinite" }) } },
};

export const LoadError: Story = {
  parameters: { msw: { handlers: handlers([], { status: 500 }) } },
};
