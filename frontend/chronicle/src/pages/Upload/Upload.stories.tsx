import type { Meta, StoryObj } from "@storybook/react-vite"
import { MemoryRouter } from "react-router-dom"
import { UploadView, type UploadViewProps } from "./Upload"

const mockFile = new File(["content"], "WoWCombatLog.txt", { type: "text/plain" });
Object.defineProperty(mockFile, "size", { value: 1024 * 1024 * 5 }); // 5MB

const mockRawFile = new File(["content"], "WoWRawCombatLog.txt", { type: "text/plain" });
Object.defineProperty(mockRawFile, "size", { value: 1024 * 500 }); // 500KB

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

const meta: Meta<typeof UploadView> = {
  title: "Pages/Upload",
  component: UploadView,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
  args: defaultProps,
}

export default meta
type Story = StoryObj<typeof UploadView>

export const NotAuthenticated: Story = {
  args: {
    isAuthenticated: false,
    authLoading: false,
  },
}

export const Authenticated: Story = {
  args: {
    isAuthenticated: true,
  },
}

export const WithFilesSelected: Story = {
  args: {
    isAuthenticated: true,
    combatLog: mockFile,
    rawCombatLog: mockRawFile,
  },
}

export const UploadInProgress: Story = {
  args: {
    isAuthenticated: true,
    combatLog: mockFile,
    rawCombatLog: mockRawFile,
    uploading: true,
    uploadProgress: 45,
  },
}

export const UploadFailed: Story = {
  args: {
    isAuthenticated: true,
    combatLog: mockFile,
    rawCombatLog: mockRawFile,
    error: { 
      message: "Invalid combat log format", 
      detail: "Expected header 'COMBAT_LOG_VERSION' at line 1, but found 'INVALID_HEADER'. Please ensure you're uploading the correct WoWCombatLog.txt file." 
    },
  },
}

export const UploadSucceeded: Story = {
  args: {
    isAuthenticated: true,
    success: { 
      message: "Raid log uploaded successfully. Processing will begin shortly.", 
      logId: "550e8400-e29b-41d4-a716-446655440000" 
    },
  },
}

export const WotlkSidekickCollapsed: Story = {
  args: {
    effectiveFormat: "3.3.5a-cc-addon",
  },
}

export const WotlkSidekickAttached: Story = {
  args: {
    effectiveFormat: "3.3.5a-cc-addon",
    combatLog: mockFile,
    sidekickStorage: new File(["content"], "ChronicleSidekickBridgeWoTLK.lua", { type: "text/plain" }),
  },
}
