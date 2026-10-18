import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { UnlistedConfirmationDialog } from "./UnlistedConfirmationDialog";

const meta = {
  title: "Pages/Logs/UnlistedConfirmationDialog",
  component: UnlistedConfirmationDialog,
  args: {
    isPending: false,
    onConfirm: fn(),
  },
} satisfies Meta<typeof UnlistedConfirmationDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RequiresTwoConfirmations: Story = {
  play: async ({ args, canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body);

    await step("Open the first confirmation", async () => {
      await userEvent.click(body.getByRole("button", { name: "Make unlisted" }));
      await expect(body.getByText("Confirmation 1 of 2")).toBeInTheDocument();
      await expect(args.onConfirm).not.toHaveBeenCalled();
    });

    await step("Continue to the irreversible warning", async () => {
      await userEvent.click(body.getByRole("button", { name: "Continue" }));
      await expect(body.getByText("This cannot be undone")).toBeInTheDocument();
      await expect(body.getByText(/never be made public again/i)).toBeInTheDocument();
      await expect(args.onConfirm).not.toHaveBeenCalled();
    });

    await step("Confirm the permanent transition", async () => {
      await userEvent.click(body.getByRole("button", { name: "Permanently make unlisted" }));
      await expect(args.onConfirm).toHaveBeenCalledOnce();
    });
  },
};
