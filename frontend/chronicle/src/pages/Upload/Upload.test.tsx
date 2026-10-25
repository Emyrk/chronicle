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
  it("shows the optional SavedVariables input for 3.3.5a uploads", () => {
    const markup = render({ effectiveFormat: "3.3.5a-cc-addon" });

    expect(markup).toContain("Sidekick SavedVariables");
    expect(markup).toContain("ChronicleSidekickBridgeWoTLK.lua");
    expect(markup).toContain('accept=".lua"');
  });

  it("does not show the SavedVariables input for other formats", () => {
    const markup = render({ effectiveFormat: "1.12a-cc-addon" });

    expect(markup).not.toContain("Sidekick SavedVariables");
    expect(markup).not.toContain("ChronicleSidekickBridgeWoTLK.lua");
  });
});
