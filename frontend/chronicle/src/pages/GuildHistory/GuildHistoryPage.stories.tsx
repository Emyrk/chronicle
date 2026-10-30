import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import { GUILDS, guildHistoryHandlers as handlers, whoami } from "./GuildHistoryPage.mocks";
import { GuildHistoryPage } from "./GuildHistoryPage";

function pathFor(names: string[], extra = "") {
  const search = new URLSearchParams();
  for (const name of names) search.append("guild", GUILDS.find((guild) => guild.guildName === name)!.guildId);
  return `/guild-history?${search.toString()}${extra}`;
}

const meta = {
  title: "Pages/GuildHistory",
  component: GuildHistoryPage,
  parameters: { layout: "fullscreen", msw: { handlers }, path: pathFor(["LaNuit"]) },
  decorators: [
    (Story, context) => (
      <TooltipProvider>
        <MemoryRouter initialEntries={[context.parameters.path as string]}>
          <Routes>
            <Route path="/guild-history" element={<Story />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof GuildHistoryPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * One guild, with real Molten Core clears captured from capy. Use "Add guild" to compare:
 * Zug Zug, Once Upon, LaNuit and Eternal Saints are saved as favorites.
 */
export const OneGuild: Story = {};

/** Zug Zug runs several groups a week, so its clears swing widely. */
export const SeveralGroups: Story = {
  parameters: { path: pathFor(["Zug Zug"]) },
};

export const CompareGuilds: Story = {
  parameters: { path: pathFor(["Zug Zug", "Once Upon", "LaNuit", "Eternal Saints"]) },
};

/** Friendly viewers see one guild; the rest of a shared comparison link is locked behind an upsell. */
export const FriendlyLimit: Story = {
  parameters: {
    path: pathFor(["Zug Zug", "Once Upon", "LaNuit", "Eternal Saints"]),
    msw: { handlers: [whoami("free"), ...handlers] },
  },
};

export const ClearsTab: Story = {
  parameters: { path: pathFor(["LaNuit"], "&tab=runs") },
};

export const BossSplitsCompare: Story = {
  parameters: { path: pathFor(["Zug Zug", "Once Upon", "LaNuit", "Eternal Saints"], "&range=60d") },
};

/** Ragnaros kill times across guilds, picked from Focus or by clicking a boss in Boss splits. */
export const FocusBoss: Story = {
  parameters: { path: pathFor(["Zug Zug", "Once Upon", "LaNuit", "Eternal Saints"], "&boss=Ragnaros") },
};

/** Switch the summary to "Box plot" to compare how spread out each guild's clears are. */
export const BoxPlot: Story = {
  parameters: { path: pathFor(["Zug Zug", "Once Upon", "LaNuit", "Eternal Saints"], "&range=60d") },
  play: async ({ canvasElement }) => {
    const button = await waitForButton(canvasElement, "Box plot");
    button.click();
  },
};

/** Shift+click a guild chip to hide it from the results while keeping it selected. */
export const HiddenGuild: Story = {
  parameters: {
    path: `${pathFor(["Zug Zug", "Once Upon", "LaNuit", "Eternal Saints"])}&hide=${GUILDS.find((guild) => guild.guildName === "Once Upon")!.guildId}`,
  },
};

/** Clear-time parses: how each clear ranked against the server's. Older clears have no stored parse. */
export const ParseMode: Story = {
  parameters: { path: pathFor(["Zug Zug", "Once Upon", "LaNuit", "Eternal Saints"], "&display=parse&range=60d") },
};

/** Ragnaros kill parses for one guild. */
export const BossParse: Story = {
  parameters: { path: pathFor(["LaNuit"], "&display=parse&boss=Ragnaros") },
};

/** Idle time per clear, one of the clear parts the Focus box offers. */
export const IdleTime: Story = {
  parameters: { path: pathFor(["Zug Zug", "Once Upon", "LaNuit", "Eternal Saints"], "&part=idle&range=60d") },
};

export const Landing: Story = {
  parameters: { path: "/guild-history" },
};

async function waitForButton(root: HTMLElement, label: string): Promise<HTMLButtonElement> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const button = [...root.querySelectorAll("button")].find((item) => item.textContent?.trim() === label);
    if (button) return button;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No "${label}" button`);
}
