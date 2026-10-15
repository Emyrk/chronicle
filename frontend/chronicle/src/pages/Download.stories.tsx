import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse, delay } from "msw";
import { DownloadPage } from "./Download";

const GH = "https://api.github.com/repos/Emyrk/chronicle-sidekick/releases?per_page=30";

const release = [
  {
    tag_name: "v0.3.1",
    draft: false,
    prerelease: false,
    assets: [
      { name: "Chronicle-Sidekick-macos.zip", size: 11_200_000, browser_download_url: "https://example.com/mac.zip" },
      { name: "Chronicle-Sidekick-windows-amd64.exe", size: 9_800_000, browser_download_url: "https://example.com/win.exe" },
      { name: "Chronicle-Sidekick-linux-amd64.tar.gz", size: 10_400_000, browser_download_url: "https://example.com/linux.tar.gz" },
    ],
  },
];

const meta: Meta<typeof DownloadPage> = {
  title: "pages/Download",
  component: DownloadPage,
  parameters: {
    layout: "fullscreen",
    msw: { handlers: [http.get(GH, () => HttpResponse.json(release))] },
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DownloadPage>;

export const MacOS: Story = { args: { os: "mac" } };
export const Windows: Story = { args: { os: "windows" } };
export const Linux: Story = { args: { os: "linux" } };
export const NoRelease: Story = {
  args: { os: "mac" },
  parameters: { msw: { handlers: [http.get(GH, () => HttpResponse.json([]))] } },
};
export const Loading: Story = {
  args: { os: "mac" },
  parameters: { msw: { handlers: [http.get(GH, async () => { await delay("infinite"); return HttpResponse.json([]); })] } },
};
