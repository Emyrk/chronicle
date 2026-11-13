import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { expect, userEvent, within } from "storybook/test";
import type { AdminEventRepairOperation } from "@/api/eventRepairs";
import { AdminEventRepairs } from "./AdminEventRepairs";

const operation: AdminEventRepairOperation = {
  id: "a421c312-9227-4f02-af45-e139a0acb3ce", operation: "razorgore-phase-two", version: 1, state: "ready",
  created_at: "2026-11-01T12:00:00Z", updated_at: "2026-11-01T12:01:00Z", created_by: "example-admin",
  tenant_id: "00000000-0000-0000-0000-000000000000", selection: { limit: 100 }, total: 2, processed: 2, applied: 0, skipped: 1,
  items: [{ instance_id: "2fa1db39-405c-4dcc-b59b-9d6c28ac99a5", state: "ready", reason: "Phase two evidence verified", evidence_hash: "7ee3c61bb4ea93b9", changes: ["Exclude phase-one events from the encounter"] },
    { instance_id: "a4a8b5f0-725e-4240-bd55-47bd96d1df7b", state: "skipped", reason: "No phase-two evidence found", evidence_hash: "", changes: [] }],
};
function handlers(value: AdminEventRepairOperation) {
  return [
    http.get("/api/v1/admin/event-repairs", () => HttpResponse.json({ operations: [value] })),
    http.get("/api/v1/admin/event-repairs/:id", () => HttpResponse.json(value)),
  ];
}
const meta = {
  title: "Pages/Admin/Event repairs",
  component: AdminEventRepairs,
  parameters: { layout: "padded" },
  decorators: [(Story) => <MemoryRouter initialEntries={[`/admin/event-repairs?operation=${operation.id}`]}><Story /></MemoryRouter>],
} satisfies Meta<typeof AdminEventRepairs>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  parameters: { msw: { handlers: handlers(operation) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const apply = await canvas.findByRole("button", { name: "Apply repair" });
    await expect(apply).toBeDisabled();
    await userEvent.click(canvas.getByRole("checkbox", { name: /I reviewed this report/ }));
    await expect(apply).toBeEnabled();
    await userEvent.click(canvas.getByRole("radio", { name: "Bounded tenant sweep" }));
    await userEvent.click(canvas.getByRole("button", { name: "Start dry-run" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent("explicit tenant UUID");
  },
};
export const Applying: Story = { parameters: { msw: { handlers: handlers({ ...operation, state: "applying", processed: 1, applied: 1, items: [{ ...operation.items[0], state: "applied", ratings_queued: true }] }) } } };
export const Failed: Story = { parameters: { msw: { handlers: handlers({ ...operation, state: "failed", last_error: "Event storage unavailable. Inspect the report before starting another operation." }) } } };
export const AccessDenied: Story = { parameters: { msw: { handlers: [http.get("/api/v1/admin/event-repairs", () => HttpResponse.json({ message: "Admin access required" }, { status: 403 })), http.get("/api/v1/admin/event-repairs/:id", () => HttpResponse.json({ message: "Admin access required" }, { status: 403 }))] } } };
