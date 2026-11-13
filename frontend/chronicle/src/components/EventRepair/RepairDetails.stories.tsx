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

export const Repaired: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Adjusted by repair"));
    await expect(canvas.getByText("Recorded phase window")).toBeVisible();
    await expect(canvas.getByText(receipt.operation_id)).toBeVisible();
    await expect(canvas.getByText("No omitted values reported.")).toBeVisible();
  },
};
export const WithOmissions: Story = {
  args: { isMobile: true, repairs: [{ ...receipt, warnings: ["Healing totals omit events without unit evidence."], details: {
    phases: [{ ...receipt.details.phases[0], reconstructed: true }],
    omissions: [{ encounter_id: receipt.details.phases[0].encounter_id, stream: "heal", unit_guid: "0x0000000000000123", amount: 12500, count: 3, reason: "Unit was absent from encounter evidence" }],
  } }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Warnings", { exact: true })).toBeVisible();
    await userEvent.click(canvas.getByText("Adjusted by repair"));
    await expect(canvas.getByText("Reconstructed phase window")).toBeVisible();
    await expect(canvas.getByText("heal: 12,500 omitted across 3 events")).toBeVisible();
  },
};
export const MissingDetails: Story = { args: { repairs: [{ ...receipt, warnings: ["Detail evidence unavailable"], details: undefined }] } };
export const UnknownPayload: Story = {
  args: { repairs: [{ ...receipt, operation: "future-repair", details: { future: "<script>This is displayed as text, never HTML</script>" } }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Adjusted by repair"));
    await userEvent.click(canvas.getByText("Saved repair JSON"));
    await expect(canvas.getByText(/This is displayed as text/)).toBeVisible();
  },
};
export const NoReceipt: Story = {
  args: { repairs: undefined },
  play: async ({ canvasElement }) => { await expect(within(canvasElement).queryByText("Adjusted by repair")).not.toBeInTheDocument(); },
};
