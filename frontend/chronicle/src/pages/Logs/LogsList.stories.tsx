import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { LogsListView } from "./LogsList";
import type { WoWLogGroup, WoWParsedLogJobOutput } from "@/api/queries";

// Parsed output for Scarlet Monastery Cathedral
const cathedralParsedOutput: WoWParsedLogJobOutput = {
  instances: [
    {
      id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8",
      name: "Scarlet Monastery Cathedral",
      slug: "scarlet-monastery-cathedral",
      realm_id: "851d2fd3-f9c5-4623-b714-924b59d916aa",
      log_group_id: "550e8400-e29b-41d4-a716-446655440000",
      encounters: [],
    },
  ],
  instance_failures: {},
};

// Parsed output with multiple instances
const multiInstanceParsedOutput: WoWParsedLogJobOutput = {
  instances: [
    {
      id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8",
      name: "Scarlet Monastery Cathedral",
      slug: "scarlet-monastery-cathedral",
      realm_id: "851d2fd3-f9c5-4623-b714-924b59d916aa",
      log_group_id: "550e8400-e29b-41d4-a716-446655440001",
      encounters: [],
    },
    {
      id: "d63bdaae-bb0c-4952-a6d3-6848c6f639c9",
      name: "Scarlet Monastery Library",
      slug: "scarlet-monastery-library",
      realm_id: "851d2fd3-f9c5-4623-b714-924b59d916aa",
      log_group_id: "550e8400-e29b-41d4-a716-446655440001",
      encounters: [],
    },
  ],
  instance_failures: {},
};

// Parsed output with failures
const failedParsedOutput: WoWParsedLogJobOutput = {
  instances: [
    {
      id: "e74bdaae-bb0c-4952-a6d3-6848c6f639ca",
      name: "Deadmines",
      slug: "deadmines",
      realm_id: "851d2fd3-f9c5-4623-b714-924b59d916aa",
      log_group_id: "550e8400-e29b-41d4-a716-446655440002",
      encounters: [],
    },
  ],
  instance_failures: {
    "Unknown Instance_0": "Failed to parse",
    "Corrupted Data_1": "Invalid timestamp",
  },
};

const mockLogs: WoWLogGroup[] = [
  {
    id: "550e8400-e29b-41d4-a716-446655440000",
    owner: "user-123",
    created_at: { Time: "2026-01-10T14:30:00Z", Valid: true },
    updated_at: { Time: "2026-01-10T14:30:00Z", Valid: true },
    files: [
      {
        id: "file-001",
        owner: "user-123",
        wow_log_id: "550e8400-e29b-41d4-a716-446655440000",
        hash: "abc123",
        size_bytes: 1024 * 1024 * 25, // 25MB
        mime_type: "text/plain",
        created_at: { Time: "2026-01-10T14:30:00Z", Valid: true },
        updated_at: { Time: "2026-01-10T14:30:00Z", Valid: true },
      },
      {
        id: "file-002",
        owner: "user-123",
        wow_log_id: "550e8400-e29b-41d4-a716-446655440000",
        hash: "def456",
        size_bytes: 1024 * 500, // 500KB
        mime_type: "text/plain",
        created_at: { Time: "2026-01-10T14:30:00Z", Valid: true },
        updated_at: { Time: "2026-01-10T14:30:00Z", Valid: true },
      },
    ],
    processing_output: cathedralParsedOutput,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440001",
    owner: "user-123",
    created_at: { Time: "2026-01-09T20:15:00Z", Valid: true },
    updated_at: { Time: "2026-01-09T20:15:00Z", Valid: true },
    files: [
      {
        id: "file-003",
        owner: "user-123",
        wow_log_id: "550e8400-e29b-41d4-a716-446655440001",
        hash: "ghi789",
        size_bytes: 1024 * 1024 * 50, // 50MB
        mime_type: "text/plain",
        created_at: { Time: "2026-01-09T20:15:00Z", Valid: true },
        updated_at: { Time: "2026-01-09T20:15:00Z", Valid: true },
      },
    ],
    processing_output: multiInstanceParsedOutput,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440002",
    owner: "user-123",
    created_at: { Time: "2026-01-08T10:00:00Z", Valid: true },
    updated_at: { Time: "2026-01-08T10:00:00Z", Valid: true },
    files: [
      {
        id: "file-004",
        owner: "user-123",
        wow_log_id: "550e8400-e29b-41d4-a716-446655440002",
        hash: "jkl012",
        size_bytes: 1024 * 1024 * 15, // 15MB
        mime_type: "text/plain",
        created_at: { Time: "2026-01-08T10:00:00Z", Valid: true },
        updated_at: { Time: "2026-01-08T10:00:00Z", Valid: true },
      },
      {
        id: "file-005",
        owner: "user-123",
        wow_log_id: "550e8400-e29b-41d4-a716-446655440002",
        hash: "mno345",
        size_bytes: 1024 * 250, // 250KB
        mime_type: "text/plain",
        created_at: { Time: "2026-01-08T10:00:00Z", Valid: true },
        updated_at: { Time: "2026-01-08T10:00:00Z", Valid: true },
      },
    ],
    processing_output: failedParsedOutput,
  },
];

// Logs without any parsed output (still processing or no output)
const mockLogsNoParsedOutput: WoWLogGroup[] = mockLogs.map(log => ({
  ...log,
  processing_output: undefined,
}));

const defaultProps = {
  isAuthenticated: true,
  authLoading: false,
  logs: mockLogs,
  logsLoading: false,
  logsError: null,
  maxStorageBytes: 500 * 1024 * 1024, // 500MB
  consumedStorageBytes: 150 * 1024 * 1024, // 150MB used
};

const meta: Meta<typeof LogsListView> = {
  title: "Pages/Logs/LogsList",
  component: LogsListView,
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
type Story = StoryObj<typeof LogsListView>;

export const NotAuthenticated: Story = {
  args: {
    isAuthenticated: false,
    authLoading: false,
    logs: undefined,
  },
};

export const Loading: Story = {
  args: {
    isAuthenticated: true,
    logsLoading: true,
    logs: undefined,
  },
};

export const Empty: Story = {
  args: {
    isAuthenticated: true,
    logs: [],
  },
};

export const WithLogs: Story = {
  args: {
    isAuthenticated: true,
    logs: mockLogs,
  },
};

export const SingleLog: Story = {
  args: {
    isAuthenticated: true,
    logs: [mockLogs[0]],
  },
};

export const LoadError: Story = {
  args: {
    isAuthenticated: true,
    logs: undefined,
    logsError: new Error("Failed to fetch logs. Please try again later."),
  },
};

export const WithParsedInstances: Story = {
  args: {
    isAuthenticated: true,
    logs: mockLogs,
  },
};

export const NoParsedOutput: Story = {
  args: {
    isAuthenticated: true,
    logs: mockLogsNoParsedOutput,
  },
};
