import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { UploadView, type UploadViewProps } from "./Upload";

const defaultProps: UploadViewProps = {
  isAuthenticated: true,
  authLoading: false,
  hasUploadPermission: true,
  hasAdminLogs: false,
  canMarkUnlisted: true,
  combatLog: null,
  rawCombatLog: null,
  sidekickStorage: null,
  foreverEvents: null,
  uploading: false,
  uploadProgress: 0,
  error: null,
  success: null,
  onFileDrop: () => {},
  onUpload: () => {},
  useV2Upload: true,
  onToggleV2Upload: () => {},
  showLegacy: false,
  flavorOverride: "",
  onFlavorOverrideChange: () => {},
  effectiveFormat: "1.12a-cc-addon",
  configLoaded: true,
  flavorTags: [],
  datasetFlavor: [],
  availableFormats: [],
  selectedFormat: "",
  onFormatSelect: () => {},
  unlistedLog: false,
  onUnlistedLogChange: () => {},
};

function render(props: Partial<UploadViewProps> = {}) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <UploadView {...defaultProps} {...props} />
    </MemoryRouter>,
  );
}

describe("UploadView Sidekick storage", () => {
  it("collapses the optional SavedVariables input for 3.3.5a uploads", () => {
    const markup = render({ effectiveFormat: "3.3.5a-cc-addon" });

    expect(markup).toContain("Attach Sidekick SavedVariables");
    expect(markup).not.toContain("ChronicleSidekickBridgeWoTLK.lua");
    expect(markup).not.toContain('accept=".lua"');
  });

  it("expands the SavedVariables input when a file is attached", () => {
    const markup = render({
      effectiveFormat: "3.3.5a-cc-addon",
      sidekickStorage: new File(["x"], "ChronicleSidekickBridgeWoTLK.lua"),
    });

    expect(markup).toContain("ChronicleSidekickBridgeWoTLK.lua");
    expect(markup).toContain('accept=".lua"');
  });

  it("does not show the SavedVariables input for other formats", () => {
    const markup = render({ effectiveFormat: "1.12a-cc-addon" });

    expect(markup).not.toContain("Sidekick SavedVariables");
    expect(markup).not.toContain("ChronicleSidekickBridgeWoTLK.lua");
  });
});

describe("UploadView cleanup", () => {
  const cleanup = { deleted_log_ids: ["older-log"] };

  it("shows cleanup after a successful upload", () => {
    const markup = render({ success: { message: "Uploaded", logId: "new-log", cleanup } });
    expect(markup).toContain("Upload Successful");
    expect(markup).toContain('href="/logs/older-log"');
    expect(markup).toContain("Parsed reports are preserved.");
  });

  it("shows cleanup even when an upload fails", () => {
    const markup = render({ error: { message: "Upload rejected", cleanup } });
    expect(markup).toContain("Upload rejected");
    expect(markup).toContain('href="/logs/older-log"');
    expect(markup).toContain("Parsed reports are preserved.");
  });
});

describe("UploadView Forever events", () => {
  it("collapses the optional attachment for Forever uploads", () => {
    const markup = render({ effectiveFormat: "v22-cleu" });
    expect(markup).toContain("Attach Forever events");
    expect(markup).not.toContain('accept=".json,application/json"');
    expect(markup).not.toContain("Sidekick SavedVariables");
  });

  it("expands the JSON input when a file is attached", () => {
    const markup = render({
      effectiveFormat: "v22-cleu",
      foreverEvents: new File(["{}"], "forever-events-v1.json"),
    });
    expect(markup).toContain("forever-events-v1.json");
    expect(markup).toContain('accept=".json,application/json"');
    expect(markup).toContain("not interpreted yet");
  });

  it.each(["1.12a-cc-addon", "3.3.5a-cc-addon"])("hides the attachment for %s", (effectiveFormat) => {
    const markup = render({ effectiveFormat });
    expect(markup).not.toContain("Forever events");
  });

  it("hides the attachment in legacy upload mode", () => {
    const markup = render({ effectiveFormat: "v22-cleu", useV2Upload: false });
    expect(markup).not.toContain("Forever events");
  });
});
