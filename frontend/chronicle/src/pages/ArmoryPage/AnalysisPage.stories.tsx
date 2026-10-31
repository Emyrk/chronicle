import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import { performanceHandlers as handlers, PLAYERS, REALM } from "./AnalysisPage.mocks";
import { PerformanceComparisonPage } from "./AnalysisPage";

function pathFor(names: string[], extra = "") {
  const search = new URLSearchParams({ realm: REALM });
  for (const name of names) {
    const player = PLAYERS.find((item) => item.name === name)!;
    search.append("player", player.id);
    search.append("player_realm", player.realm ?? REALM);
    search.append("spec", "");
    search.append("subspec", "");
  }
  return `/performance-history?${search.toString()}${extra}`;
}

const meta = {
  title: "Pages/ArmoryPage/PerformanceHistory",
  component: PerformanceComparisonPage,
  parameters: { layout: "fullscreen", msw: { handlers }, path: pathFor(["Velyndra"]) },
  decorators: [
    (Story, context) => (
      <TooltipProvider>
        <MemoryRouter initialEntries={[context.parameters.path as string]}>
          <Routes>
            <Route path="/performance-history" element={<Story />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof PerformanceComparisonPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * One player. Use "Add player" to compare: the mock realm has Velyndra, Morthul, Brakkus,
 * Quellin, Sinnet, Tavrin (BWL only), Holtmar (2 runs), Lumessa and Fennick (healers), Rhovan, and
 * Brindle (swingy, with one outlier night), and Baraddek (real captured runs).
 */
export const OnePlayer: Story = {};

/** Three players in Parse mode: the summary becomes a comparison table. */
export const ComparePlayers: Story = {
  parameters: { path: pathFor(["Velyndra", "Morthul", "Brakkus"], "&display=parse") },
};

/** A full roster of five, including two mages and a player with only 2 runs. */
export const FullRoster: Story = {
  parameters: { path: pathFor(["Velyndra", "Morthul", "Brakkus", "Quellin", "Holtmar"], "&display=parse") },
};

/** Healers in HPS mode. */
export const Healers: Story = {
  parameters: { path: pathFor(["Lumessa", "Fennick"], "&metric=hps&display=parse") },
};

/** A swingy player in Parse mode: Low consistency, and a best run marked as an outlier. */
export const ErraticPlayer: Story = {
  parameters: { path: pathFor(["Brindle"], "&display=parse") },
};

/**
 * Real data: Baraddek's Molten Core runs from capy, served as Naxxramas. His parse climbs from
 * the 20s to the 90s over three months, so the trend line and Consistency have a real slope to handle.
 */
export const RealClimbingPlayer: Story = {
  parameters: { path: pathFor(["Baraddek"], "&display=parse") },
};

/** A shared link that opens straight on the Gear tab (`tab=gear`). */
export const LinkedGearTab: Story = {
  parameters: { path: pathFor(["Baraddek"], "&display=parse&tab=gear") },
};

/** No player selected yet: the search landing page. Try "vel" or "mor". */
export const Landing: Story = {
  parameters: { path: "/performance-history" },
};
