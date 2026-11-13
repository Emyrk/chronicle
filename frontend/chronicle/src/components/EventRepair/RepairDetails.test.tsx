import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { RepairDetails, RepairReceiptList, RepairReceipts } from "./RepairDetails";
import { InstanceHeader } from "@/pages/Instance/InstanceHeader";
import { RepairReport } from "@/pages/Admin/AdminEventRepairs";

const receipt = {
  operation_id: "d23ea3cb-0769-4891-bfcf-2f56a4e1a30a", operation: "razorgore-phase-two", version: 1,
  applied_at: "2026-11-13T12:00:00Z", warnings: [],
  details: { phases: [{ encounter_id: "encounter-1", start_offset_ms: 61000, end_offset_ms: 122500, reconstructed: false }], omissions: [] },
};
const omissions = [{ encounter_id: "encounter-1", stream: "damage", unit_guid: "unit-1", amount: 12500, count: 3, reason: "Missing target evidence" }];

it("shows a compact repair badge in the instance header with no privileged fetch or admin link", () => {
  const html = renderToStaticMarkup(<InstanceHeader isMobile={false} name="Blackwing Lair" startTimeLabel="Today" repairs={[receipt]} />);
  expect(html).toContain("Repaired");
  expect(html).toContain('aria-label="Adjusted by repair"');
  expect(html).not.toContain(receipt.operation_id);
  expect(html).not.toContain("/admin/");
});
it("flags warnings on the compact badge", () => {
  const html = renderToStaticMarkup(<RepairReceipts repairs={[{ ...receipt, warnings: ["Missing stream"] }]} />);
  expect(html).toContain('aria-label="Adjusted by repair, with warnings"');
});
it("shows full receipt data in the modal list", () => {
  const html = renderToStaticMarkup(<RepairReceiptList repairs={[receipt]} />);
  for (const text of [receipt.operation_id, receipt.applied_at, "razorgore-phase-two", "v1", "1:01.000 to 2:02.500", "Recorded phase window", "No omitted values reported."]) expect(html).toContain(text);
  expect(html).not.toContain("Repair warnings");
});
it("omits the badge when metadata has no receipts", () => {
  for (const repairs of [undefined, null, [], {}, [null, "bad", { operation: "broken" }]]) {
    expect(renderToStaticMarkup(<RepairReceipts repairs={repairs} />)).toBe("");
    expect(renderToStaticMarkup(<RepairReceiptList repairs={repairs} />)).toBe("");
  }
});
it("shows omissions and reconstructed phase details even without warning strings", () => {
  const html = renderToStaticMarkup(<RepairReceiptList repairs={[{ ...receipt, details: { phases: [{ ...receipt.details.phases[0], reconstructed: true }], omissions } }]} />);
  for (const text of ["Warnings", "Repair warnings", "Reconstructed phase window", "12,500 omitted across 3 events", "Missing target evidence", "unit-1"]) expect(html).toContain(text);
});
it("retains warnings when details are missing without claiming no omissions", () => {
  const html = renderToStaticMarkup(<RepairReceiptList repairs={[{ ...receipt, warnings: ["Missing stream"], details: undefined }]} />);
  expect(html).toContain("Missing stream");
  expect(html).toContain("Detailed repair data is not available.");
  expect(html).not.toContain("No omitted values reported.");
});
it("unknown job/version and malformed payloads use escaped generic JSON", () => {
  const payloads = [null, "<script>alert(1)</script>", { phases: [null], omissions: [] },
    { phases: [{ ...receipt.details.phases[0], end_offset_ms: "100" }], omissions },
    { phases: [], omissions: [{ ...omissions[0], count: -1 }] },
    { phases: [], omissions: [{ ...omissions[0], amount: Infinity }] }];
  for (const details of payloads) {
    const html = renderToStaticMarkup(<RepairDetails operation={receipt.operation} version={1} details={details} warnings={[null, {}, "Safe warning"]} />);
    expect(html).not.toContain("Phase-two windows");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Safe warning");
  }
  for (const props of [{ operation: "future-job", version: 1 }, { operation: receipt.operation, version: 2 }]) {
    const html = renderToStaticMarkup(<RepairDetails {...props} details={receipt.details} />);
    expect(html).toContain("Saved repair JSON");
    expect(html).toContain("No compatible detail view");
    expect(html).not.toContain("Phase-two windows");
  }
});
it("exposes omitted quantities in the admin preview before apply", () => {
  const html = renderToStaticMarkup(<RepairReport busy={false} onApply={() => {}} onCancel={() => {}} operation={{
    id: receipt.operation_id, operation: receipt.operation, version: 1, state: "ready", created_at: receipt.applied_at,
    updated_at: receipt.applied_at, created_by: "admin", tenant_id: "tenant", last_error: "", selection: { operation: receipt.operation, instance: "instance" },
    total: 1, processed: 1, applied: 0, skipped: 0, items: [{ instance_id: "instance", state: "ready", reason: "Ready", evidence_hash: "hash", changes: [], ratings_queued: false, warnings: ["Missing stream"], details: { ...receipt.details, omissions } }],
  }} />);
  expect(html).toContain("12,500 omitted across 3 events");
  expect(html).toContain("Missing stream");
  expect(html).toContain("Apply repair");
});
