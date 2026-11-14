import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { UploadView, type UploadViewProps } from "./Upload";
import { MultiUpload } from "./MultiUpload";

const defaultProps: UploadViewProps = {
  isAuthenticated: true,
  authLoading: false,
  hasUploadPermission: true,
  hasAdminLogs: false,
  canMarkUnlisted: true,
  combatLog: null,
  rawCombatLog: null,
  sidekickStorage: null,
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


describe("MultiUpload parser engine", () => {
  it.each([false, true])("uses effective admin permission (%s) for the batch selector", (hasAdminLogs) => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <MultiUpload format="3.3.5a-cc-addon" unlistedLog={false} canMarkUnlisted={true} onUnlistedLogChange={() => {}} hasAdminLogs={hasAdminLogs} />
      </MemoryRouter>,
    );
    expect(markup.includes('id="parser-engine"')).toBe(hasAdminLogs);
    if (hasAdminLogs) expect(markup).toContain('<option value="legacy" selected="">');
  });
});

describe("UploadView parser engine", () => {
  it("hides the selector without effective admin permission", () => {
    expect(render({ parserEngine: "parsernext" })).not.toContain('id="parser-engine"');
  });

  it("defaults administrators to legacy", () => {
    const markup = render({ hasAdminLogs: true });
    expect(markup).toContain('<option value="legacy" selected="">');
    expect(markup).toContain("Parsernext (experimental)");
  });

  it("shows explicit parsernext selection and locks it during submission", () => {
    const markup = render({ hasAdminLogs: true, parserEngine: "parsernext", uploading: true });
    expect(markup).toContain('<option value="parsernext" selected="">');
    expect(markup).toMatch(/<select id="parser-engine"[^>]*disabled=""/);
  });

  it("does not offer parsernext on the retired upload transport", () => {
    expect(render({ hasAdminLogs: true, useV2Upload: false })).not.toContain('id="parser-engine"');
  });
});
