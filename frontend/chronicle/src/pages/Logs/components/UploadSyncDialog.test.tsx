import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { UploadSyncOptions } from "./UploadSyncDialog";

describe("UploadSyncOptions", () => {
  it("offers the guided wizard and manual JSON upload paths", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <UploadSyncOptions
          instanceId="instance-123"
          uploading={false}
          onManualUpload={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain('href="/youtube-sync-v3"');
    expect(markup).toContain("Create with Sync Wizard");
    expect(markup).toContain("Upload an Existing File");
    expect(markup).toContain("Choose JSON File");
    expect(markup).toContain("instance-123");
  });

  it("shows progress and disables manual selection while uploading", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <UploadSyncOptions
          instanceId="instance-123"
          uploading
          onManualUpload={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("Uploading Sync File…");
    expect(markup).toContain("disabled");
  });
});
