import { describe, expect, it, vi, afterEach } from "vitest";
import type { PanelMetrics } from "../PanelTimingContext";
import { downloadMetricsJson, serializeMetrics, type MetricsSnapshot } from "./metricsExport";

const row: PanelMetrics = {
  panelKey: "panel-2", panelId: "damage_done", panelLabel: "Damage Done", panelIndex: 2,
  streams: ["damage"], streamBytes: { damage: 41088635 }, totalStreamBytes: 41088635,
  totalEvents: 12345, processingTimeMs: 123.456, streamProcessingTimeMs: 120,
  serializationTimeMs: 3.456, deserializationTimeMs: 2, wallTimeMs: 200,
  queueWaitMs: 10, fetchTimeMs: 20, updatedAtMs: 500,
};
const snapshot: MetricsSnapshot = {
  instanceId: "instance-id", selectedEncounterIds: ["boss-id"], selectedPlayerIds: [],
  selectedEnemyIds: [], panelCount: 3, doneCount: 1, allDone: false, totalTimeMs: null,
  panels: [row, { ...row, panelKey: "panel-1", panelIndex: 1 }],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("metrics JSON export", () => {
  it("preserves raw metrics, selections and partial completion without mutating the rows", () => {
    const result = JSON.parse(serializeMetrics(snapshot, new Date("2026-01-01T00:00:00Z")));
    expect(result.schemaVersion).toBe(1);
    expect(result.exportedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(result.selectedEncounterIds).toEqual(["boss-id"]);
    expect(result.allDone).toBe(false);
    expect(result.totalTimeMs).toBeNull();
    expect(result.panels).toEqual([snapshot.panels[1], row]);
    expect(snapshot.panels[0]).toBe(row);
  });

  it("supports an empty snapshot", () => {
    expect(JSON.parse(serializeMetrics({ ...snapshot, panels: [] })).panels).toEqual([]);
  });

  it("downloads JSON and releases the link and object URL", async () => {
    vi.useFakeTimers();
    const click = vi.fn();
    const remove = vi.fn();
    const link = { href: "", download: "", click, remove };
    const appendChild = vi.fn();
    vi.stubGlobal("document", { createElement: vi.fn(() => link), body: { appendChild } });
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:metrics");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    downloadMetricsJson(snapshot);
    expect(link.download).toBe("panel-metrics-instance-id.json");
    expect(link.href).toBe("blob:metrics");
    expect(appendChild).toHaveBeenCalledWith(link);
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    const blob = create.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/json;charset=utf-8");
    expect(JSON.parse(await blob.text()).panels).toHaveLength(2);
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:metrics");
  });
});
