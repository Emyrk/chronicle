import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WoWLogArtifact, WoWLogFile, WoWLogGroupState } from "@/api/queries";
import { getLogGroupRefetchInterval } from "@/api/queries";
import { LogDetailView, UploadedArtifactRow, UploadedLogFileRows } from "./LogDetail";

const artifact: WoWLogArtifact = {
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  log_group_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  kind: "sidekick-storage",
  schema_version: 2,
  hash: "hash",
  size_bytes: 2048,
  mime_type: "text/plain;charset=UTF-8",
  original_filename: "ChronicleSidekickBridgeWoTLK.lua",
  created_at: "2026-10-25T00:00:00Z",
  updated_at: "2026-10-25T00:00:00Z",
};

const logFile: WoWLogFile = {
  id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  owner: "dddddddd-dddd-dddd-dddd-dddddddddddd",
  wow_log_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  hash: "logical-hash",
  size_bytes: 1300,
  compressed_size_bytes: 620,
  mime_type: "text/plain;charset=UTF-8",
  content_encoding: "gzip",
  created_at: "2026-10-25T00:00:00Z",
  updated_at: "2026-10-25T00:00:00Z",
  parts: [
    {
      id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      sequence: 1,
      source_sequence: 1,
      hash: "part-hash",
      size_bytes: 300,
      compressed_size_bytes: 120,
      content_encoding: "gzip",
      artifact: {
        ...artifact,
        id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        log_file_part_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
        original_filename: "ChronicleSidekickBridgeWoTLK-append.lua",
      },
      created_at: "2026-10-25T01:00:00Z",
      finalized_at: "2026-10-25T01:00:01Z",
    },
  ],
};

describe("UploadedLogFileRows", () => {
  it("renders the base file, appended parts, and their associated artifacts", () => {
    const markup = renderToStaticMarkup(
      <UploadedLogFileRows
        logId={logFile.wow_log_id}
        file={logFile}
        baseArtifact={artifact}
        canDownloadFiles
      />,
    );

    expect(markup).toContain("Combat log · Base file");
    expect(markup).toContain("Combat log · Append 1");
    expect(markup).toContain("ChronicleSidekickBridgeWoTLK.lua");
    expect(markup).toContain("ChronicleSidekickBridgeWoTLK-append.lua");
    expect(markup.match(/\/download/g)).toHaveLength(3);
    expect(markup).toContain("Download combined combat log");
  });
});

describe("parser snapshot artifacts", () => {
  const snapshot = { ...artifact, kind: "parser_snapshot", original_filename: "parser-snapshot.json.gz" };

  it("does not expose snapshots to users with only raw-log download access", () => {
    expect(renderToStaticMarkup(<UploadedArtifactRow logId={artifact.log_group_id} artifact={snapshot} canDownloadFiles />)).toBe("");
  });

  it("shows administrators download, direct inspector, and creation timestamp", () => {
    const markup = renderToStaticMarkup(<UploadedArtifactRow logId={artifact.log_group_id} artifact={snapshot} canDownloadFiles={false} hasAdminLogs />);
    expect(markup).toContain(`/api/v1/raidlogs/logs/${artifact.log_group_id}/artifacts/${artifact.id}/download`);
    expect(markup).toContain(`/technical/state-graph?log=${artifact.log_group_id}&amp;artifact=${artifact.id}`);
    expect(markup).toContain(`dateTime="${artifact.created_at}"`);
    expect(markup).toContain("may predate the latest reparse");
  });

  it("does not offer actions for deleted snapshots", () => {
    const markup = renderToStaticMarkup(<UploadedArtifactRow logId={artifact.log_group_id} artifact={{ ...snapshot, storage_deleted_at: artifact.created_at }} canDownloadFiles hasAdminLogs />);
    expect(markup).not.toContain("/download");
    expect(markup).not.toContain("Inspect snapshot");
  });
});

describe("UploadedArtifactRow", () => {
  it("shows the artifact and download link with raw-log download permission", () => {
    const markup = renderToStaticMarkup(
      <UploadedArtifactRow logId={artifact.log_group_id} artifact={artifact} canDownloadFiles />,
    );

    expect(markup).toContain("ChronicleSidekickBridgeWoTLK.lua");
    expect(markup).toContain("Artifact · sidekick-storage · schema v2");
    expect(markup).toContain(`/api/v1/raidlogs/logs/${artifact.log_group_id}/artifacts/${artifact.id}/download`);
  });

  it("hides the download link without raw-log download permission", () => {
    const markup = renderToStaticMarkup(
      <UploadedArtifactRow logId={artifact.log_group_id} artifact={artifact} canDownloadFiles={false} />,
    );

    expect(markup).toContain("ChronicleSidekickBridgeWoTLK.lua");
    expect(markup).not.toContain("/download");
  });
});


describe("LogDetailView admin tool placement", () => {
  it.each([false, true])("separates diagnostics from title for admin=%s while preserving ordinary reparse", (hasAdminLogs) => {
    const noop = () => {};
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <LogDetailView
            log={{ id: artifact.log_group_id, publication_pending: false, owner: "owner", log_type: "vanilla", upload_source: "web", unlisted: false, raw_files_pinned: false, parsed_bytes: 0, created_at: artifact.created_at, updated_at: artifact.updated_at, files: [], status: { id: 1, state: "completed", kind: "log-parse", attempt: 1, max_attempts: 5, created_at: artifact.created_at, scheduled_at: artifact.created_at, attempted_at: null, finalized_at: null, errors: [], output: {} } }}
            logLoading={false} logError={null} onDelete={noop} isDeleting={false} showDeleteConfirm={false} setShowDeleteConfirm={noop}
            onReparse={noop} isReparsing={false} canReparse canProfile={hasAdminLogs}
            onDeleteFiles={noop} isDeletingFiles={false} canDeleteFiles={false} canDownloadFiles={false}
            canUploadYoutube={false} canDeleteInstance={true} onDeleteInstance={noop} isDeletingInstance={false}
            onRefresh={noop} isRefreshing={false} canMarkUnlisted={false} onMarkUnlisted={noop} isMarkingUnlisted={false}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const header = markup.match(/<header[^>]*>([\s\S]*?)<\/header>/)?.[1];
    expect(header).toContain("Log Upload");
    expect(header).not.toContain('id="parser-engine"');
    expect(header).not.toContain("Admin parser tools");
    expect(markup.includes('aria-label="Admin parser tools"')).toBe(hasAdminLogs);
    if (hasAdminLogs) {
      expect(markup.indexOf('aria-label="Identity catalogue disclosure"')).toBeGreaterThan(markup.indexOf("Danger Zone"));
      expect(markup).toMatch(/aria-label="Identity catalogue disclosure"[\s\S]*aria-expanded="false"/);
      expect(markup).not.toContain("Catalogue review filters");
    } else {
      expect(markup).not.toContain("Identity catalogue disclosure");
    }
    if (!hasAdminLogs) {
      expect(header).toContain("Reparse");
      expect(markup).not.toContain("Verbose");
      expect(markup).not.toContain("CPU Profile");
    }
  });
});


describe("published job output", () => {
  function makeLog(kind: string, pending = false): WoWLogGroupState {
    return {
      id: artifact.log_group_id, publication_pending: pending, owner: "owner", log_type: "vanilla", upload_source: "web", unlisted: false, raw_files_pinned: false, parsed_bytes: 0, created_at: artifact.created_at, updated_at: artifact.updated_at, files: [],
      status: { id: 1, state: "completed", kind, attempt: 1, max_attempts: 5, created_at: artifact.created_at, scheduled_at: artifact.created_at, attempted_at: null, finalized_at: null, errors: [], output: {
        complete: artifact.created_at,
        instances: [{ id: "published-id", slug: "stable-instance-slug", name: "Published raid", encounters: [], start_time: artifact.created_at, end_time: artifact.updated_at }],
        instance_failures: {},
        report: { total_lines: 10, total_duration_ms: 1000, load_file_duration_ms: 1, parse_duration_ms: 2, finalize_duration_ms: 3, db_insert_duration_ms: 4 },
      } as unknown as Record<string, string> },
    };
  }
  function render(log: WoWLogGroupState) {
    const noop = () => {};
    return renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><MemoryRouter>
      <LogDetailView log={log} logLoading={false} logError={null} onDelete={noop} isDeleting={false} showDeleteConfirm={false} setShowDeleteConfirm={noop}
        onReparse={noop} isReparsing={false} canReparse={false} canProfile={false} onDeleteFiles={noop} isDeletingFiles={false} canDeleteFiles={false} canDownloadFiles={false}
        canUploadYoutube={false} canDeleteInstance={false} onDeleteInstance={noop} isDeletingInstance={false} onRefresh={noop} isRefreshing={false} canMarkUnlisted={false} onMarkUnlisted={noop} isMarkingUnlisted={false} />
    </MemoryRouter></QueryClientProvider>);
  }

  it.each(["log-parse", "log-parse-finalize"])("shows published instance links and timing for%s", (kind) => {
    const html = render(makeLog(kind));
    expect(html).toContain('href="/instances/stable-instance-slug"');
    expect(html).toContain("Timing Report");
    expect(html).toContain("Detected Instances");
    expect(html).toContain(kind === "log-parse" ? "Legacy log parsing" : "Instance publication (finalize)");
    expect(getLogGroupRefetchInterval(makeLog(kind))).toBe(false);
  });

  it("shows native producer completion as checkpoint handoff waiting, not empty publication or success", () => {
    const log = makeLog("native-log-parse", true);
    const html = render(log);
    expect(html).toContain("Parsing checkpoint accepted");
    expect(html).toContain("Awaiting publication");
    expect(html).toContain("Native parsing (checkpoint handoff)");
    expect(html).not.toContain("No instances were found");
    expect(html).not.toContain("Timing Report");
    expect(getLogGroupRefetchInterval(log)).toBe(9000);
  });
});
