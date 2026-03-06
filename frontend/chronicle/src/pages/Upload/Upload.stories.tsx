import type { Meta, StoryObj } from "@storybook/react-vite"
import { MemoryRouter } from "react-router-dom"
import { UploadView } from "./Upload"

const mockFile = new File(["content"], "WoWCombatLog.txt", { type: "text/plain" });
Object.defineProperty(mockFile, "size", { value: 1024 * 1024 * 5 }); // 5MB

const mockRawFile = new File(["content"], "WoWRawCombatLog.txt", { type: "text/plain" });
Object.defineProperty(mockRawFile, "size", { value: 1024 * 500 }); // 500KB

const defaultProps = {
  isAuthenticated: true,
  authLoading: false,
  combatLog: null,
  rawCombatLog: null,
  uploading: false,
  uploadProgress: 0,
  error: null,
  success: null,
  onFileSelect: () => {},
  onUpload: () => {},
  useV2Upload: true,
  onToggleV2Upload: () => {},
  showLegacy: false,
  hasUploadPermission: true,
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
