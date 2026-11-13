import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { buildRepairRequest, eventRepairKey, isRepairActive, repairRequest } from "@/api/eventRepairs";
import type { AdminEventRepairOperation, RepairSelection } from "@/api/eventRepairs";
import { AdminEventRepairs, RepairReport } from "./AdminEventRepairs";

const operation: AdminEventRepairOperation = {
  id: "repair-1", operation: "razorgore-phase-two", version: 1, state: "ready",
  created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", created_by: "admin",
  tenant_id: "00000000-0000-0000-0000-000000000000", selection: { instance: "raid-slug" }, total: 2, processed: 2, applied: 0, skipped: 1,
  items: [{ instance_id: "instance-1", state: "ready", reason: "Phase two found", evidence_hash: "hash", changes: ["Trim phase one"] },
    { instance_id: "instance-2", state: "skipped", reason: "No phase two evidence", evidence_hash: "", changes: [] }],
};
const form: RepairSelection = { mode: "sweep", instance: "", tenant: operation.tenant_id, limit: "10", realm: "", after: "", before: "" };
afterEach(() => vi.unstubAllGlobals());

it("requires explicit bounded sweep scope and validates optional filters", () => {
  expect(() => buildRepairRequest({ ...form, tenant: "" })).toThrow("tenant UUID");
  for (const limit of ["", "0", "1001", "Infinity", "NaN", "1.5"]) expect(() => buildRepairRequest({ ...form, limit })).toThrow("1 to 1000");
  expect(() => buildRepairRequest({ ...form, realm: "slug" })).toThrow("Realm");
  expect(() => buildRepairRequest({ ...form, after: "2026-11-02", before: "2026-11-01" })).toThrow("earlier");
  expect(buildRepairRequest({ ...form, after: "2026-11-01" })).toEqual({ operation: "razorgore-phase-two", tenant_id: operation.tenant_id, limit: 10, after: "2026-11-01T00:00:00.000Z" });
});
it("single selection sends no stale sweep filters", () => {
  expect(buildRepairRequest({ ...form, mode: "single", instance: " https://example.com/raids/slug " })).toEqual({ operation: "razorgore-phase-two", instance: "https://example.com/raids/slug" });
  expect(() => buildRepairRequest({ ...form, mode: "single" })).toThrow("instance");
});
it("only polls running dry-runs and applications", () => {
  expect(isRepairActive("dry_running")).toBe(true);
  expect(isRepairActive("applying")).toBe(true);
  for (const state of ["ready", "completed", "cancelled", "failed", undefined]) expect(isRepairActive(state)).toBe(false);
});
it("ready reports require confirmation and expose skips and evidence", () => {
  const markup = renderToStaticMarkup(<RepairReport operation={operation} busy={false} onApply={() => {}} onCancel={() => {}} />);
  expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Apply repair<\/button>/);
  expect(markup).toContain("No phase two evidence");
  expect(markup).toContain("Trim phase one");
  expect(markup).toContain("Original events remain untouched");
  expect(markup).not.toContain("Cancel operation");
});
it("running reports allow cancellation but terminal reports never offer apply", () => {
  for (const state of ["dry_running", "applying", "completed", "cancelled", "failed"] as const) {
    const markup = renderToStaticMarkup(<RepairReport operation={{ ...operation, state, last_error: "A repair error", items: [{ ...operation.items[0], ratings_queued: true }] }} busy={false} onApply={() => {}} onCancel={() => {}} />);
    expect(markup.includes("Cancel operation")).toBe(isRepairActive(state));
    expect(markup).not.toContain("Apply repair");
    expect(markup).toContain("A repair error");
    expect(markup).toContain("Queued, not completed");
  }
});
it("restores a selected durable report from the URL and defaults to dry-run", () => {
  const client = new QueryClient();
  client.setQueryData(eventRepairKey, { operations: [operation] });
  client.setQueryData([...eventRepairKey, operation.id], operation);
  const markup = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/admin/event-repairs?operation=repair-1"]}><AdminEventRepairs /></MemoryRouter></QueryClientProvider>);
  expect(markup).toContain("Start dry-run");
  expect(markup).toContain("Repair report");
  expect(markup).toContain("No phase two evidence");
  client.clear();
});
it("sends the locked create/apply/cancel contracts and surfaces auth errors", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => operation });
  vi.stubGlobal("fetch", fetcher);
  await repairRequest("", { operation: "razorgore-phase-two", instance: "slug" });
  expect(fetcher).toHaveBeenLastCalledWith("/api/v1/admin/event-repairs", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"operation":"razorgore-phase-two","instance":"slug"}' });
  await repairRequest("/repair-1/apply", "apply");
  expect(fetcher).toHaveBeenLastCalledWith("/api/v1/admin/event-repairs/repair-1/apply", { method: "POST" });
  await repairRequest("/repair-1/cancel", "cancel");
  expect(fetcher).toHaveBeenLastCalledWith("/api/v1/admin/event-repairs/repair-1/cancel", { method: "POST" });
  fetcher.mockResolvedValue({ ok: false, status: 403, json: async () => ({ message: "Admin access required" }) });
  await expect(repairRequest()).rejects.toThrow("Admin access required");
  expect(fetcher).toHaveBeenCalledTimes(4);
});
