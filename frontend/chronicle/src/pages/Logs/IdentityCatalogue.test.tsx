import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { IdentityCatalogueRecord, IdentityCatalogueResponse } from "@/api/typesGenerated";
import { CatalogueEvidence, IdentityCatalogue, IdentityCatalogueView } from "./IdentityCatalogue";

const timestamp = "2026-01-01T00:00:00Z";
const record: IdentityCatalogueRecord = {
  guid: "0x0000000000000000", entry: 0, kind: "zero", category: "MirrorImage", affiliation: "hostile", recognition: "global", unknown: false, conflict: false,
  first_seen: timestamp, last_seen: timestamp, observations: 12, evidence_overflow: 2, evidence_truncations: 1,
  contexts: [{ zone: "Example zone", map_id: 1, instance_id: 2, category: "MirrorImage", affiliation: "friendly", recognition: "global", first_seen: timestamp, last_seen: timestamp, observations: 2 }],
  evidence: [{ role: "source", spell_id: 42, name: "Example unit", related_guid: "0x0000000000000001", first_seen: timestamp, last_seen: timestamp, observations: 2 }],
};
const page: IdentityCatalogueResponse = { catalogue: {
  log_group_id: "log", generation: 7, dataset_id: "dataset", dataset_revision: 1, format: "format", flavor: "flavor", parser_engine: "legacy", parser_build: "build", catalogue_version: 1, rule_version: 1,
  first_seen: timestamp, last_seen: timestamp, guid_count: 1, event_count: 12, zero_guid_count: 12, created_at: timestamp,
}, records: [record], next_after: record.guid };
const noop = () => {};
function render(overrides: Partial<Parameters<typeof IdentityCatalogueView>[0]> = {}) {
  return renderToStaticMarkup(<IdentityCatalogueView logId="log" review="unknown" page={page} loading={false} pageNumber={1} canPrevious={false} onReview={noop} onRefresh={noop} onPrevious={noop} onNext={noop} {...overrides} />);
}

describe("IdentityCatalogue", () => {
  it.each([false, undefined])("does not mount the query for admin permission%s", (hasAdminLogs) => {
    // No QueryClient provider: this would throw if an unauthorized query mounted.
    expect(renderToStaticMarkup(<IdentityCatalogue logId="log" hasAdminLogs={hasAdminLogs} />)).toBe("");
  });

  it("renders loading and errors without stale records or download links", () => {
    expect(render({ loading: true })).toContain("Loading identity catalogue");
    expect(render({ loading: true })).not.toContain(record.guid);
    const error = render({ error: "Access denied" });
    expect(error).toContain('role="alert"');
    expect(error).not.toContain(record.guid);
    expect(error).not.toContain("Download full JSON");
  });

  it("distinguishes older logs without catalogues from an empty review filter", () => {
    const absent = render({ page: { catalogue: null, records: [] } });
    expect(absent).toContain("Reparse with either engine to populate");
    expect(absent).not.toContain("No GUIDs match");
    expect(render({ page: { ...page, records: [] } })).toContain("No GUIDs match this filter");
  });

  it("shows independent classification axes and preserves zero GUID evidence", () => {
    const markup = render();
    expect(markup).toContain(record.guid);
    expect(markup).toContain("MirrorImage");
    expect(markup).toContain("hostile");
    expect(markup).toContain("global");
    expect(markup).toContain("Example unit");
    expect(markup).toContain("generation=7");
    expect(markup).toContain("styled-scrollbar");
  });

  it("offers paged navigation and clearly labels generation replacement", () => {
    expect(render()).toContain("Next page");
    expect(render({ reset: true })).toContain("Returned to the first page");
    expect(render({ reset: true })).not.toContain("Generated Go Code");
  });

  it("renders role/spell/related GUID evidence and separately classified contexts", () => {
    const markup = renderToStaticMarkup(<CatalogueEvidence record={record} />);
    expect(markup).toContain("source");
    expect(markup).toContain("Spell: 42");
    expect(markup).toContain("Related GUID: 0x0000000000000001");
    expect(markup).toContain("friendly");
    expect(markup).toContain("retained evidence limit");
    expect(markup).toContain("evidence fields were truncated");
  });

  it("bounds expanded evidence to20 entries rather than rendering giant metadata", () => {
    const markup = renderToStaticMarkup(<CatalogueEvidence record={{ ...record, contexts: [], evidence: Array.from({ length: 200 }, (_, i) => ({ ...record.evidence[0], name: `Evidence-${i}` })) }} />);
    expect(markup.match(/<li /g)).toHaveLength(20);
    expect(markup).not.toContain("Evidence-199");
    expect(markup).toContain("Next 20");
  });
});
