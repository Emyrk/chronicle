import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WoWLogArtifact } from "@/api/queries";
import { UploadedArtifactRow } from "./LogDetail";

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
