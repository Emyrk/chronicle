import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import { PERSONAS } from "./achievements.fixtures";
import { achievementsHandler, failingAchievementsHandler, loadingAchievementsHandler } from "./achievements.mocks";
import { AchievementsPage } from "./AchievementsPage";

/**
 * The real /achievements route component, fed by a mocked GET /api/v1/achievements.
 * Nothing here is a mock-only component: production renders this exact tree.
 */
const meta = {
  title: "Pages/Achievements",
  component: AchievementsPage,
  parameters: { layout: "fullscreen", msw: { handlers: [achievementsHandler()] }, path: "/achievements" },
  decorators: [
    (Story, context) => (
      <TooltipProvider>
        <MemoryRouter initialEntries={[context.parameters.path as string]}>
          <Routes>
            <Route path="/achievements" element={<Story />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof AchievementsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A month in: a spread of earned tiers, two retroactive awards, Honored reputation. */
export const Explorer: Story = {};

export const ExplorerReportExplorer: Story = {
  name: "Explorer: Report Explorer",
  parameters: { path: "/achievements?category=report-explorer" },
};

/** Command Center is a set achievement: 2 of 3 members earned. */
export const ExplorerLayouts: Story = {
  name: "Explorer: Layouts (set achievement)",
  parameters: { path: "/achievements?category=layouts" },
};

/** Keybinds render platform-aware keys (Option/Cmd on macOS). */
export const ExplorerKeybinds: Story = {
  name: "Explorer: Keybinds",
  parameters: { path: "/achievements?category=keybinds" },
};

/** Requirement indicators: guild-page permission is not met. */
export const ExplorerGuildBuilder: Story = {
  name: "Explorer: Guild Builder (locked requirement)",
  parameters: { path: "/achievements?category=guild-builder" },
};

/** Unreleased feature: every achievement shows "Available after Live Collaboration launches". */
export const ExplorerLiveCollaboration: Story = {
  name: "Explorer: Live Collaboration (unreleased)",
  parameters: { path: "/achievements?category=live-collaboration" },
};

/** Hidden achievement: name and criteria withheld, completion rate still shown. */
export const ExplorerReplayHidden: Story = {
  name: "Explorer: Replay (hidden achievement)",
  parameters: { path: "/achievements?category=replay" },
};

export const SearchAcrossCategories: Story = {
  parameters: { path: "/achievements?q=layout" },
};

export const RewardsFilter: Story = {
  name: "Filter: has reward",
  parameters: { path: "/achievements?filter=rewards" },
};

/** Just signed in for the first time. */
export const NewAccount: Story = {
  parameters: { msw: { handlers: [achievementsHandler({ persona: PERSONAS.newAccount })] } },
};

/** Every non-Future achievement earned, plus a Feat of Strength. */
export const Completionist: Story = {
  parameters: { msw: { handlers: [achievementsHandler({ persona: PERSONAS.completionist })] } },
};

export const CompletionistFeats: Story = {
  name: "Completionist: Feats of Strength",
  parameters: {
    path: "/achievements?category=feats-of-strength",
    msw: { handlers: [achievementsHandler({ persona: PERSONAS.completionist })] },
  },
};

/** Anonymous visitors see the catalog and completion rates but no progress. */
export const SignedOut: Story = {
  parameters: { msw: { handlers: [achievementsHandler({ signedOut: true })] } },
};

/** The spec's Phase 1 launch set only. */
export const Phase1Catalog: Story = {
  name: "Phase 1 catalog only",
  parameters: { msw: { handlers: [achievementsHandler({ phases: ["Phase 1"] })] } },
};

export const Mobile: Story = {
  parameters: { path: "/achievements?category=report-explorer", viewport: { defaultViewport: "mobile1" } },
  globals: { viewport: { value: "mobile1" } },
};

export const Loading: Story = {
  parameters: { msw: { handlers: [loadingAchievementsHandler] } },
};

export const LoadError: Story = {
  parameters: { msw: { handlers: [failingAchievementsHandler] } },
};
