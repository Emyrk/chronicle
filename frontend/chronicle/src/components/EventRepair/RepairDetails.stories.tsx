import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { InstanceHeader } from "@/pages/Instance/InstanceHeader";

const receipt = {
  operation_id: "d23ea3cb-0769-4891-bfcf-2f56a4e1a30a", operation: "razorgore-phase-two", version: 1,
  applied_at: "2026-11-13T12:00:00Z", warnings: [],
  details: { phases: [{ encounter_id: "ae701b74-e545-4687-87e0-5335d2fbdf9a", start_offset_ms: 61000, end_offset_ms: 122500, reconstructed: false }], omissions: [] },
};
const meta = {
  title: "Components/Event repair receipts",
  component: InstanceHeader,
  parameters: { layout: "padded" },
  args: { isMobile: false, name: "Blackwing Lair", startTimeLabel: "13 November 2026", repairs: [receipt] },
} satisfies Meta<typeof InstanceHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

// The modal portals to document.body, so its contents are queried there.
const modal = () => within(document.body);
export const Repaired: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Adjusted by repair" }));
    await expect(await modal().findByText("Recorded phase window")).toBeVisible();
    await expect(modal().getByText(receipt.operation_id)).toBeVisible();
    await expect(modal().getByText("No omitted values reported.")).toBeVisible();
  },
};
export const WithOmissions: Story = {
  args: { isMobile: true, repairs: [{ ...receipt, warnings: ["Healing totals omit events without unit evidence."], details: {
    phases: [{ ...receipt.details.phases[0], reconstructed: true }],
    omissions: [{ encounter_id: receipt.details.phases[0].encounter_id, stream: "heal", unit_guid: "0x0000000000000123", amount: 12500, count: 3, reason: "Unit was absent from encounter evidence" }],
  } }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Adjusted by repair, with warnings" }));
    await expect(await modal().findByText("Reconstructed phase window")).toBeVisible();
    await expect(modal().getByText("heal: 12,500 omitted across 3 events")).toBeVisible();
  },
};
export const MissingDetails: Story = { args: { repairs: [{ ...receipt, warnings: ["Detail evidence unavailable"], details: undefined }] } };
export const UnknownPayload: Story = {
  args: { repairs: [{ ...receipt, operation: "future-repair", details: { future: "<script>This is displayed as text, never HTML</script>" } }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Adjusted by repair" }));
    await userEvent.click(await modal().findByText("Saved repair JSON"));
    await expect(modal().getByText(/This is displayed as text/)).toBeVisible();
  },
};
export const NoReceipt: Story = {
  args: { repairs: undefined },
  play: async ({ canvasElement }) => { await expect(within(canvasElement).queryByRole("button", { name: /Adjusted by repair/ })).not.toBeInTheDocument(); },
};

export const LucifronComparison: Story = {
  args: { repairs: [{ ...receipt, operation: "lucifron-ranked-damage", details: {
    parser_version: "v1.0.172", rule_version: "v1.0.173", ranked_target_entries: [12118, 12119],
    players: [{ encounter_id: "lucifron-encounter", player_guid: "player-guid", player_name: "Mage",
      before_ranked_damage: 12000, after_ranked_damage: 10000, before_unranked_damage: 1000,
      after_unranked_damage: 3000, before_dps: 200, after_dps: 166.67 }], omissions: [],
  } }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Adjusted by repair" }));
    const dialog = within(document.body).getByRole("dialog");
    await expect(within(dialog).getByText("Player damage and DPS, before and after repair")).toBeVisible();
    await expect(within(dialog).getByText("166.67")).toBeVisible();
  },
};
