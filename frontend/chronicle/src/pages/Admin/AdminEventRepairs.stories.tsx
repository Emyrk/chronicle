import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { expect, userEvent, within } from "storybook/test";
import type { AdminEventRepairOperation } from "@/api/eventRepairs";
import { AdminEventRepairs } from "./AdminEventRepairs";

const operation: AdminEventRepairOperation = {
  id: "a421c312-9227-4f02-af45-e139a0acb3ce", operation: "razorgore-phase-two", version: 1, state: "ready",
  created_at: "2026-11-01T12:00:00Z", updated_at: "2026-11-01T12:01:00Z", created_by: "example-admin",
  tenant_id: "00000000-0000-0000-0000-000000000000", selection: { operation: "razorgore-phase-two", limit: 100 }, total: 2, processed: 2, applied: 0, skipped: 1, last_error: "",
  items: [{ instance_id: "2fa1db39-405c-4dcc-b59b-9d6c28ac99a5", state: "ready", reason: "Phase two evidence verified", evidence_hash: "7ee3c61bb4ea93b9", changes: ["Exclude phase-one events from the encounter"], ratings_queued: false },
    { instance_id: "a4a8b5f0-725e-4240-bd55-47bd96d1df7b", state: "skipped", reason: "No phase-two evidence found", evidence_hash: "", changes: [], ratings_queued: false }],
};
function handlers(value: AdminEventRepairOperation) {
  return [
    http.get("/api/v1/admin/tenants", () => HttpResponse.json([{ id: operation.tenant_id, name: "Octo", slug: "octo" }])),
    http.get("/api/v1/realms", () => HttpResponse.json([{ id: "33e57ec2-92da-4a47-95a9-ceab69a8cd87", name: "Example realm" }])),
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
    const tenant = canvas.getByRole("combobox", { name: "Tenant (required)" });
    const realm = canvas.getByRole("combobox", { name: "Realm (optional)" });
    await canvas.findByRole("option", { name: "Octo (octo)" });
    await userEvent.selectOptions(tenant, operation.tenant_id);
    await userEvent.selectOptions(realm, "33e57ec2-92da-4a47-95a9-ceab69a8cd87");
    await expect(tenant).toHaveValue(operation.tenant_id);
    await expect(realm).toHaveValue("33e57ec2-92da-4a47-95a9-ceab69a8cd87");
    await userEvent.selectOptions(tenant, "");
    await expect(realm).toHaveValue("");
  },
};
export const Applying: Story = { parameters: { msw: { handlers: handlers({ ...operation, state: "applying", processed: 1, applied: 1, items: [{ ...operation.items[0], state: "applied", ratings_queued: true }] }) } } };
export const Failed: Story = { parameters: { msw: { handlers: handlers({ ...operation, state: "failed", last_error: "Event storage unavailable. Inspect the report before starting another operation." }) } } };
export const AccessDenied: Story = { parameters: { msw: { handlers: [http.get("/api/v1/admin/event-repairs", () => HttpResponse.json({ message: "Admin access required" }, { status: 403 })), http.get("/api/v1/admin/event-repairs/:id", () => HttpResponse.json({ message: "Admin access required" }, { status: 403 }))] } } };

export const SubmitSelectedScope: Story = {
  parameters: { msw: { handlers: [
    http.get("/api/v1/admin/event-repairs/selected-scope", () => HttpResponse.json({ ...operation, id: "selected-scope", state: "completed" })),
    ...handlers(operation),
    http.post("/api/v1/admin/event-repairs", async ({ request }) => {
      const body = await request.json();
      expect(body).toEqual({ operation: "razorgore-phase-two", tenant_id: operation.tenant_id, realm_id: "33e57ec2-92da-4a47-95a9-ceab69a8cd87", limit: 100 });
      return HttpResponse.json({ ...operation, id: "selected-scope", state: "completed" }, { status: 202 });
    }),
  ] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: "Bounded tenant sweep" }));
    await canvas.findByRole("option", { name: "Octo (octo)" });
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Tenant (required)" }), operation.tenant_id);
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Realm (optional)" }), "33e57ec2-92da-4a47-95a9-ceab69a8cd87");
    await userEvent.click(canvas.getByRole("button", { name: "Start dry-run" }));
    await expect(await canvas.findByText("selected-scope", { selector: "p" })).toBeVisible();
  },
};

export const RejectPreview: Story = {
  parameters: { msw: { handlers: [
    http.get("/api/v1/admin/event-repairs/rejected-preview", () => HttpResponse.json({ ...operation, id: "rejected-preview", state: "cancelled" })),
    ...handlers(operation),
    http.post("/api/v1/admin/event-repairs/:id/cancel", () => HttpResponse.json({ ...operation, id: "rejected-preview", state: "cancelled" })),
  ] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const reject = await canvas.findByRole("button", { name: "Reject repair" });
    const link = canvas.getByRole("link", { name: operation.items[0].instance_id });
    await expect(link).toHaveAttribute("href", `/instances/${operation.items[0].instance_id}`);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await userEvent.click(reject);
    await expect(await canvas.findByText("rejected-preview", { selector: "p" })).toBeVisible();
  },
};
export const AllSkipped: Story = {
  parameters: { msw: { handlers: handlers({ ...operation, items: [operation.items[1]], total: 1, processed: 1, skipped: 1 }) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: "Reject repair" })).toBeEnabled();
    await expect(canvas.queryByRole("button", { name: "Apply repair" })).not.toBeInTheDocument();
    await expect(canvas.getByText(/No instances are eligible to apply/)).toBeVisible();
  },
};
