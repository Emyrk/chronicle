import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WoWLogArtifact, WoWLogFile } from "@/api/queries";
import { UploadedArtifactRow, UploadedLogFileRows } from "./LogDetail";

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
