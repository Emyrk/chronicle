import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent } from "storybook/test";
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import { MasteryRenownPrototype } from "./MasteryRenownPrototype";

const meta = {
  title: "Pages/Armory/Mastery & Renown",
  component: MasteryRenownPrototype,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof MasteryRenownPrototype>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The complete editorial explainer, beginning with an established elite player. */
export const FieldGuide: Story = {};

/** A perfect parse with one kill: Mastery remains 100, while Ranked Mastery is visibly capped near 65. */
export const OneKillCannotMaster: Story = {
  args: { initialPlayerId: "rave" },
  play: async ({ canvas }) => {
    expect(canvas.getByRole("button", { name: "Show Rave's Mastery story" })).toHaveAttribute("aria-pressed", "true");
    expect(canvas.getAllByText("The perfect flash").length).toBeGreaterThan(0);
    expect(canvas.getAllByText("100.0").length).toBeGreaterThan(0);
    expect(canvas.getAllByText("65.0").length).toBeGreaterThan(0);
    expect(canvas.getAllByText("1.0", { exact: true }).length).toBeGreaterThan(0);
  },
};

/** Select Molten Core, inspect the live equation, then reduce the evidence to see the ceiling fall. */
export const MoltenCoreWorkshop: Story = {
  args: { initialPlayerId: "port", initialScopeId: "molten-core" },
  play: async ({ canvas }) => {
    expect(canvas.getByText("Starting from Port · Molten Core")).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: "Molten Core", exact: true })).toHaveAttribute("aria-pressed", "true");

    const kills = canvas.getByRole("slider", { name: "Kills calculator input" });
    await fireEvent.change(kills, { target: { value: "1" } });
    expect(kills).toHaveValue("1");
    expect(canvas.getAllByText("65.0").length).toBeGreaterThan(0);
  },
};

/** A high peak without a high floor, demonstrating why Mastery is not another best-parse list. */
export const PeakIsNotProof: Story = {
  args: { initialPlayerId: "jinocide" },
};

/** Deep evidence and broad raid coverage: Renown and Mastery can both be high for different reasons. */
export const CompletePortfolio: Story = {
  args: { initialPlayerId: "lebron" },
};
