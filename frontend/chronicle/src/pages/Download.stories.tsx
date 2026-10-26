import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse, delay } from "msw";
import type { SidekickRelease } from "@/api/typesGenerated";
import { DownloadPage } from "./Download";

const API = "/api/v1/sidekick-release";
const RELEASES_URL = "https://github.com/Emyrk/chronicle-sidekick/releases";

const release: SidekickRelease = {
  available: true,
  version: "v0.3.1",
  published_at: "2026-10-20T12:00:00Z",
  releases_url: `${RELEASES_URL}/tag/v0.3.1`,
  assets: [
    { os: "macos", name: "Chronicle-Sidekick-macos.zip", size: 11_200_000, sha256: "9f2c4e1b7a0d3e5f6a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f", url: "https://example.com/mac.zip" },
    { os: "windows", name: "Chronicle-Sidekick-windows-amd64.exe", size: 9_800_000, sha256: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b", url: "https://example.com/win.exe" },
    { os: "linux", name: "Chronicle-Sidekick-linux-amd64.tar.gz", size: 10_400_000, sha256: "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3", url: "https://example.com/linux.tar.gz" },
  ],
};

const noRelease: SidekickRelease = { available: false, version: "", releases_url: RELEASES_URL, assets: [] };

const meta: Meta<typeof DownloadPage> = {
  title: "pages/Download",
  component: DownloadPage,
  parameters: {
    layout: "fullscreen",
    msw: { handlers: [http.get(API, () => HttpResponse.json(release))] },
  },
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={["/download?utm_source=reddit&utm_content=A"]}>
        <Story />
      </MemoryRouter>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DownloadPage>;

export const MacOS: Story = { args: { os: "macos" } };
export const Windows: Story = { args: { os: "windows" } };
export const Linux: Story = { args: { os: "linux" } };
export const NoRelease: Story = {
  args: { os: "macos" },
  parameters: { msw: { handlers: [http.get(API, () => HttpResponse.json(noRelease))] } },
};
export const Loading: Story = {
  args: { os: "macos" },
  parameters: { msw: { handlers: [http.get(API, async () => { await delay("infinite"); return HttpResponse.json(noRelease); })] } },
};
