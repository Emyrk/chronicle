import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { StorageSettingsView } from "./index";
import type { UserStorageInfo, WoWLogGroup, WoWLogFile, WoWParsedLogJobOutput } from "@/api/queries";

function file(overrides: Partial<WoWLogFile> & { id: string }): WoWLogFile {
  return {
    owner: "user-123",
    wow_log_id: "log-1",
    hash: "hash",
    size_bytes: 25 * 1024 * 1024,
    mime_type: "text/plain",
    created_at: "2026-08-10T14:30:00Z",
    updated_at: "2026-08-10T14:30:00Z",
    ...overrides,
  };
}

const completeOutput: WoWParsedLogJobOutput = {
  complete: "2026-08-10T15:00:00Z",
  instance_failures: {},
  instances: [
    {
      id: "inst-1",
      name: "Molten Core",
      slug: "molten-core",
      realm_id: "realm-1",
      server_name: "ChromieCraft",
      tenant_name: "ChromieCraft",
      log_group_id: "log-complete",
      encounters: [
        { id: "e1", instance_id: "inst-1", boss: true, name: "Lucifron", kill_type: "clean", start_time: "2026-08-10T14:00:00Z", end_time: "2026-08-10T14:05:00Z" },
        { id: "e2", instance_id: "inst-1", boss: true, name: "Magmadar", kill_type: "clean", start_time: "2026-08-10T14:10:00Z", end_time: "2026-08-10T14:16:00Z" },
      ],
      capabilities: [],
      versions: {},
      recorder_name: "Someone",
      recorder_guid: "guid-1",
      difficulty_name: "Normal",
      max_players: 40,
      dynamic_difficulty: 0,
    },
  ],
};

const multiInstanceOutput: WoWParsedLogJobOutput = {
  complete: "2026-08-11T15:00:00Z",
  instance_failures: {},
  instances: [
    { ...completeOutput.instances[0], id: "inst-2a", name: "Scarlet Monastery Cathedral", log_group_id: "log-multi" },
    { ...completeOutput.instances[0], id: "inst-2b", name: "Scarlet Monastery Library", log_group_id: "log-multi", encounters: [] },
  ],
};

const warningsOutput: WoWParsedLogJobOutput = {
  complete: "2026-08-12T15:00:00Z",
  instance_failures: { "Unknown Instance_0": "Failed to parse a secondary instance in this upload" },
  instances: [{ ...completeOutput.instances[0], id: "inst-3", name: "Onyxia's Lair", log_group_id: "log-warnings" }],
};

// Uploaded from a different community than the one this story is viewed as
// (see defaultProps.currentTenantName) — exercises the tenant-mismatch badge.
const otherTenantOutput: WoWParsedLogJobOutput = {
  complete: "2026-08-14T15:00:00Z",
  instance_failures: {},
  instances: [
    {
      ...completeOutput.instances[0],
      id: "inst-other-tenant",
      name: "Zul'Gurub",
      server_name: "Nordanaar",
      tenant_name: "Nordanaar",
      log_group_id: "log-other-tenant",
    },
  ],
};

const failedOutput: WoWParsedLogJobOutput = {
  complete: "2026-08-13T15:00:00Z",
  instance_failures: { "Corrupted Data_0": "Invalid timestamp" },
  instances: [],
};

const mockLogs: WoWLogGroup[] = [
  {
    id: "log-complete",
    owner: "user-123",
    created_at: "2026-08-10T14:30:00Z",
    updated_at: "2026-08-10T15:00:00Z",
    log_type: "combat_log",
    files: [file({ id: "f-complete-1", wow_log_id: "log-complete", compressed_size_bytes: 12 * 1024 * 1024 })],
    processing_output: completeOutput as unknown as WoWLogGroup["processing_output"],
    parsed_bytes: 4 * 1024 * 1024,
  },
  {
    id: "log-multi",
    owner: "user-123",
    created_at: "2026-08-11T09:00:00Z",
    updated_at: "2026-08-11T09:30:00Z",
    log_type: "combat_log",
    files: [file({ id: "f-multi-1", wow_log_id: "log-multi", size_bytes: 50 * 1024 * 1024, compressed_size_bytes: 30 * 1024 * 1024 })],
    processing_output: multiInstanceOutput as unknown as WoWLogGroup["processing_output"],
    parsed_bytes: 9 * 1024 * 1024,
  },
  {
    id: "log-warnings",
    owner: "user-123",
    created_at: "2026-08-12T20:00:00Z",
    updated_at: "2026-08-12T20:30:00Z",
    log_type: "combat_log",
    files: [file({ id: "f-warnings-1", wow_log_id: "log-warnings", size_bytes: 19 * 1024 * 1024, compressed_size_bytes: 11 * 1024 * 1024 })],
    processing_output: warningsOutput as unknown as WoWLogGroup["processing_output"],
    parsed_bytes: 2 * 1024 * 1024,
  },
  {
    id: "log-processing",
    owner: "user-123",
    created_at: "2026-09-01T09:12:00Z",
    updated_at: "2026-09-01T09:12:00Z",
    log_type: "combat_log",
    files: [
      file({ id: "f-processing-1", wow_log_id: "log-processing", size_bytes: 98 * 1024 * 1024, compressed_size_bytes: 64 * 1024 * 1024 }),
    ],
    parsed_bytes: 0,
  },
  {
    id: "log-failed",
    owner: "user-123",
    created_at: "2026-08-13T18:00:00Z",
    updated_at: "2026-08-13T18:30:00Z",
    log_type: "combat_log",
    files: [file({ id: "f-failed-1", wow_log_id: "log-failed", size_bytes: 47 * 1024 * 1024 })],
    processing_output: failedOutput as unknown as WoWLogGroup["processing_output"],
    parsed_bytes: 0,
  },
  {
    id: "log-raw-deleted",
    owner: "user-123",
    created_at: "2026-08-05T12:00:00Z",
    updated_at: "2026-08-05T12:30:00Z",
    log_type: "combat_log",
    files: [
      file({
        id: "f-raw-deleted-1",
        wow_log_id: "log-raw-deleted",
        size_bytes: 15 * 1024 * 1024,
        storage_deleted_at: "2026-08-20T00:00:00Z",
      }),
    ],
    processing_output: { ...completeOutput, instances: [{ ...completeOutput.instances[0], id: "inst-6", name: "Stormwind Stockade", log_group_id: "log-raw-deleted" }] } as unknown as WoWLogGroup["processing_output"],
    parsed_bytes: 3 * 1024 * 1024,
  },
  {
    id: "log-partially-deleted",
    owner: "user-123",
    created_at: "2026-08-01T12:00:00Z",
    updated_at: "2026-08-01T12:30:00Z",
    log_type: "combat_log",
    files: [
      file({ id: "f-partial-1", wow_log_id: "log-partially-deleted", size_bytes: 20 * 1024 * 1024, compressed_size_bytes: 12 * 1024 * 1024 }),
      file({
        id: "f-partial-2",
        wow_log_id: "log-partially-deleted",
        size_bytes: 51 * 1024 * 1024,
        compressed_size_bytes: 30 * 1024 * 1024,
        storage_deleted_at: "2026-08-15T00:00:00Z",
      }),
    ],
    processing_output: { ...completeOutput, instances: [{ ...completeOutput.instances[0], id: "inst-7", name: "Scholomance", log_group_id: "log-partially-deleted" }] } as unknown as WoWLogGroup["processing_output"],
    parsed_bytes: 5 * 1024 * 1024,
  },
  {
    // Sanity check for the deriveLogStatus precedence rule: parsed with
    // warnings, but every raw file is already gone — the pill collapses to
    // "Raw deleted" while the row's note text still surfaces the warning.
    id: "log-warnings-raw-deleted",
    owner: "user-123",
    created_at: "2026-07-20T12:00:00Z",
    updated_at: "2026-07-20T12:30:00Z",
    log_type: "combat_log",
    files: [file({ id: "f-warn-deleted-1", wow_log_id: "log-warnings-raw-deleted", storage_deleted_at: "2026-08-01T00:00:00Z" })],
    processing_output: { ...warningsOutput, instances: [{ ...completeOutput.instances[0], id: "inst-8", name: "Deadmines", log_group_id: "log-warnings-raw-deleted" }] } as unknown as WoWLogGroup["processing_output"],
    parsed_bytes: 1 * 1024 * 1024,
  },
  {
    id: "log-other-tenant",
    owner: "user-123",
    created_at: "2026-08-14T16:00:00Z",
    updated_at: "2026-08-14T16:30:00Z",
    log_type: "combat_log",
    files: [file({ id: "f-other-tenant-1", wow_log_id: "log-other-tenant", compressed_size_bytes: 18 * 1024 * 1024 })],
    processing_output: otherTenantOutput as unknown as WoWLogGroup["processing_output"],
    parsed_bytes: 2 * 1024 * 1024,
  },
];

const mockStorage: UserStorageInfo = {
  max_storage_bytes: Math.round(97.66 * 1024 * 1024 * 1024) + 1024 * 1024 * 1024,
  consumed_storage_bytes: 150 * 1024 * 1024,
  parsed_storage_bytes: 24 * 1024 * 1024,
  parsed_instance_count: mockLogs.length,
  grants: [
    {
      id: "grant-base",
      source: "base",
      storage_bytes: Math.round(97.66 * 1024 * 1024 * 1024),
      description: "Base storage allocation",
      created_at: "2026-05-20T00:00:00Z",
    },
    {
      id: "grant-support",
      source: "support",
      storage_bytes: 1024 * 1024 * 1024,
      description: "Thank you for financially supporting Chronicle! This grant renews every 30 days as long as you remain a supporter.",
      created_at: "2026-05-20T00:00:00Z",
      expires_at: "2026-10-06T00:00:00Z",
    },
  ],
};

const defaultProps = {
  storage: mockStorage,
  storageLoading: false,
  logs: mockLogs,
  logsLoading: false,
  // Viewing as if browsing from ChromieCraft's subdomain — makes log-other-tenant
  // (uploaded from Nordanaar) render the tenant-mismatch badge.
  currentTenantName: "ChromieCraft",
};

const meta: Meta<typeof StorageSettingsView> = {
  title: "Pages/Settings/StorageSettings",
  component: StorageSettingsView,
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
};

export default meta;
type Story = StoryObj<typeof StorageSettingsView>;

export const WithLogs: Story = {};

export const Loading: Story = {
  args: {
    storageLoading: true,
    storage: undefined,
    logsLoading: true,
    logs: undefined,
  },
};

export const Empty: Story = {
  args: {
    logs: [],
  },
};
