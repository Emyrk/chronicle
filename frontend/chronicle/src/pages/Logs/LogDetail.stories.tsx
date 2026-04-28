import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { LogDetailView } from "./LogDetail";
import type { WoWLogGroupState, JobStatus, WoWParsedLogJobOutput } from "@/api/queries";

const mockJobStatus: JobStatus = {
  id: 12345,
  state: "pending",
  kind: "log-parse",
  attempt: 1,
  max_attempts: 5,
  created_at: "2026-01-14T20:22:09.639625Z",
  scheduled_at: "2026-01-14T20:22:09.639625Z",
  attempted_at: null,
  finalized_at: null,
  errors: [],
  output: {},
};

// Realistic parsed output based on actual API response
const mockParsedOutput: WoWParsedLogJobOutput = {
  instances: [
    {
      id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8",
      name: "Scarlet Monastery Cathedral",
      slug: "scarlet-monastery-cathedral",
      realm_id: "851d2fd3-f9c5-4623-b714-924b59d916aa",
      log_group_id: "296c74e3-310b-4137-987d-f711471f68e6",
      encounters: [
        // Trash fights
        { id: "ad0f8a04-27bf-44c5-817e-e0b76288b980", boss: false, kill: true, name: "Scarlet Myrmidon", end_time: "2025-12-09T11:13:34.196-06:00", start_time: "2025-12-09T11:13:10.957-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "d2931f06-afa1-4ed7-8b90-5d257bb0fe65", boss: false, kill: true, name: "Scarlet Defender", end_time: "2025-12-09T11:17:35.293-06:00", start_time: "2025-12-09T11:17:00.279-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "a0265ecf-ad76-4b10-87d6-a7440f505029", boss: false, kill: true, name: "Scarlet Myrmidon", end_time: "2025-12-09T11:18:10.272-06:00", start_time: "2025-12-09T11:17:46.777-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "6a2db932-dc64-4a20-b09e-cde6b4088a83", boss: false, kill: true, name: "Scarlet Wizard", end_time: "2025-12-09T11:18:53.172-06:00", start_time: "2025-12-09T11:18:22.845-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "8c65237c-a3fa-434f-84f7-16729ca12764", boss: false, kill: false, name: "Scarlet Centurion", end_time: "2025-12-09T11:22:13.084-06:00", start_time: "2025-12-09T11:18:54.162-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "f55f53b9-2051-4413-9eb2-2720c6ace639", boss: false, kill: true, name: "Scarlet Centurion", end_time: "2025-12-09T11:23:01.85-06:00", start_time: "2025-12-09T11:22:37.934-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "6fe02ebd-d9ee-47fa-9a50-e788aa1fe1c2", boss: false, kill: true, name: "Scarlet Myrmidon", end_time: "2025-12-09T12:53:04.489-06:00", start_time: "2025-12-09T12:52:05.383-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "e5a672ed-acfb-4f91-a56c-621d9ecce952", boss: false, kill: true, name: "Scarlet Myrmidon", end_time: "2025-12-09T12:53:40.629-06:00", start_time: "2025-12-09T12:53:14.819-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "2252aa73-71aa-46cc-85ed-9b1fa167d33e", boss: false, kill: true, name: "Scarlet Defender", end_time: "2025-12-09T12:54:31.752-06:00", start_time: "2025-12-09T12:53:51.944-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "3cb3bc29-200c-4c22-a7aa-6ea8d47bfb01", boss: false, kill: true, name: "Scarlet Centurion", end_time: "2025-12-09T12:56:45.6-06:00", start_time: "2025-12-09T12:54:38.552-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "85674dea-ac02-4cd4-8ad7-fb8c990962e4", boss: false, kill: true, name: "Scarlet Monk", end_time: "2025-12-09T12:58:09.389-06:00", start_time: "2025-12-09T12:57:13.485-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "a8db7341-facf-40b4-bb61-9e46b214bea3", boss: false, kill: true, name: "Scarlet Centurion", end_time: "2025-12-09T12:58:54.827-06:00", start_time: "2025-12-09T12:58:19.751-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "dca456a6-1089-4298-9163-f541ffa7d7c4", boss: false, kill: true, name: "Scarlet Champion", end_time: "2025-12-09T13:00:42.752-06:00", start_time: "2025-12-09T12:59:57.303-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "5b8ae64a-c7b9-438e-bef5-43f0df75a043", boss: false, kill: true, name: "Scarlet Centurion", end_time: "2025-12-09T13:01:52.891-06:00", start_time: "2025-12-09T13:00:51.496-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "ccc3df92-2748-4285-8ec4-df8a193ce5e0", boss: false, kill: true, name: "Scarlet Champion", end_time: "2025-12-09T13:02:55.688-06:00", start_time: "2025-12-09T13:02:22.878-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "5a8cc429-3153-4e7c-9f26-5febe456616c", boss: false, kill: true, name: "Scarlet Centurion", end_time: "2025-12-09T13:04:05.615-06:00", start_time: "2025-12-09T13:03:18.326-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "2570dab3-c103-40a5-9b56-5cf31b860400", boss: false, kill: false, name: "Scarlet Champion", end_time: "2025-12-09T13:05:45.611-06:00", start_time: "2025-12-09T13:04:15.681-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "a2dc84c0-d841-493a-a352-fe0892b730c7", boss: false, kill: true, name: "Scarlet Centurion", end_time: "2025-12-09T13:06:40.164-06:00", start_time: "2025-12-09T13:05:51.291-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "efc40838-39a1-4a9b-960f-42307bf6939b", boss: false, kill: true, name: "Scarlet Monk", end_time: "2025-12-09T13:07:21.99-06:00", start_time: "2025-12-09T13:06:56.059-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "d580061f-538e-42f6-900d-3b5460b65a0f", boss: false, kill: true, name: "Scarlet Wizard", end_time: "2025-12-09T13:11:45.206-06:00", start_time: "2025-12-09T13:11:34.382-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "b04c6e37-d356-48d1-b06b-61d5ea6db066", boss: false, kill: true, name: "Scarlet Monk", end_time: "2025-12-09T13:12:14.212-06:00", start_time: "2025-12-09T13:11:53.422-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "f7e5ece5-8621-4e1b-84aa-51d3c6597e0c", boss: false, kill: true, name: "Scarlet Monk", end_time: "2025-12-09T13:12:56.024-06:00", start_time: "2025-12-09T13:12:31.24-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "e9da6add-db4f-497d-879d-5cff780778fc", boss: false, kill: true, name: "Scarlet Champion", end_time: "2025-12-09T13:13:25.789-06:00", start_time: "2025-12-09T13:13:11.699-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        // Boss fights
        { id: "9f94b2ed-d1da-4ebc-9c86-0e1c7b33e35c", boss: true, kill: true, name: "High Inquisitor Fairbanks", end_time: "2025-12-09T13:09:37.554-06:00", start_time: "2025-12-09T13:08:59.042-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "6e825e0d-51ed-48e7-be4a-6d14cf5beab8", boss: true, kill: false, name: "Scarlet Commander Mograine", end_time: "2025-12-09T13:11:21.412-06:00", start_time: "2025-12-09T13:10:01.215-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
        { id: "0a9ed597-cc25-4587-86e5-e1501b0cfce4", boss: true, kill: true, name: "Scarlet Commander Mograine", end_time: "2025-12-09T13:26:57.526-06:00", start_time: "2025-12-09T13:24:51.034-06:00", instance_id: "c52bdaae-bb0c-4952-a6d3-6848c6f639c8"},
      ],
    },
  ],
  instance_failures: {},
};

const mockLog: WoWLogGroupState = {
  id: "296c74e3-310b-4137-987d-f711471f68e6",
  owner: "15d4cade-e036-4608-bcd2-d957df76d20e",
  created_at: "2026-01-14T14:22:09.612412-06:00",
  updated_at: "2026-01-14T14:22:09.612412-06:00",
  files: [
    {
      id: "a69bba6b-e615-444d-b2f1-8d12a5ac1cd5",
      owner: "15d4cade-e036-4608-bcd2-d957df76d20e",
      wow_log_id: "296c74e3-310b-4137-987d-f711471f68e6",
      hash: "7c8c68dfe1af11b560831558ff324741f43989c825ffa4c243d2021d4960256f",
      size_bytes: 1110349,
      mime_type: "text/plain",
      created_at: "2026-01-14T20:22:09.612412Z",
      updated_at: "2026-01-14T20:22:09.612412Z",
    },
    {
      id: "82fc37ab-a021-4a56-9549-2a19f061cf76",
      owner: "15d4cade-e036-4608-bcd2-d957df76d20e",
      wow_log_id: "296c74e3-310b-4137-987d-f711471f68e6",
      hash: "933f6fb25a3fd8f639c8af9865a1c49dfc1ecf7d240da64e863ccada0933eed1",
      size_bytes: 1346489,
      mime_type: "text/plain",
      created_at: "2026-01-14T20:22:09.612412Z",
      updated_at: "2026-01-14T20:22:09.612412Z",
    },
  ],
  status: mockJobStatus,
};

const defaultProps = {
  isAuthenticated: true,
  authLoading: false,
  log: mockLog,
  logLoading: false,
  logError: null,
  onDelete: () => console.log("Delete clicked"),
  isDeleting: false,
  showDeleteConfirm: false,
  setShowDeleteConfirm: () => {},
  onReparse: () => console.log("Reparse clicked"),
  isReparsing: false,
  canReparse: true,
  onDeleteFiles: () => console.log("Delete files clicked"),
  isDeletingFiles: false,
  canDeleteFiles: true,
  canDownloadFiles: true,
  canUploadYoutube: true,
  canDeleteInstance: true,
  onDeleteInstance: () => console.log("Delete instance clicked"),
  isDeletingInstance: false,
  onRefresh: () => console.log("Refresh clicked"),
  isRefreshing: false,
};

const meta: Meta<typeof LogDetailView> = {
  title: "Pages/Logs/LogDetail",
  component: LogDetailView,
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
type Story = StoryObj<typeof LogDetailView>;

export const NotAuthenticated: Story = {
  args: {
    isAuthenticated: false,
    authLoading: false,
    log: undefined,
  },
};

export const Loading: Story = {
  args: {
    isAuthenticated: true,
    logLoading: true,
    log: undefined,
  },
};

export const NotFound: Story = {
  args: {
    isAuthenticated: true,
    log: undefined,
    logLoading: false,
  },
};

export const LoadError: Story = {
  args: {
    isAuthenticated: true,
    log: undefined,
    logError: new Error("Failed to load log details. Please try again."),
  },
};

export const Pending: Story = {
  args: {
    log: {
      ...mockLog,
      status: { ...mockJobStatus, state: "pending" },
    },
  },
};

export const Scheduled: Story = {
  args: {
    log: {
      ...mockLog,
      status: { ...mockJobStatus, state: "scheduled" },
    },
  },
};

export const Processing: Story = {
  args: {
    log: {
      ...mockLog,
      status: {
        ...mockJobStatus,
        state: "running",
        attempted_at: "2026-01-10T14:31:00Z",
        output: {
          instances: mockParsedOutput.instances.slice(0, 1),
          instance_failures: {},
          progress: {
            phase: "parsing",
            percent: 47,
            processed_bytes: 1245184,
            total_bytes: 2621440,
          },
        } as unknown as Record<string, string>,
      },
    },
  },
};

export const Completed: Story = {
  args: {
    log: {
      ...mockLog,
      status: {
        ...mockJobStatus,
        state: "completed",
        attempted_at: "2026-01-14T20:22:09.641085Z",
        finalized_at: "2026-01-14T20:22:10.342483Z",
        output: mockParsedOutput as unknown as Record<string, string>,
      },
    },
  },
};

export const ReparseInProgress: Story = {
  args: {
    log: {
      ...mockLog,
      status: {
        ...mockJobStatus,
        kind: "reparse_log",
        state: "running",
        attempted_at: "2026-01-10T15:00:00Z",
      },
    },
  },
};

export const ReparseCompleted: Story = {
  args: {
    log: {
      ...mockLog,
      status: {
        ...mockJobStatus,
        kind: "reparse_log",
        state: "completed",
        attempted_at: "2026-01-10T15:00:00Z",
        finalized_at: "2026-01-10T15:02:00Z",
      },
    },
  },
};

export const Reparsing: Story = {
  args: {
    log: {
      ...mockLog,
      status: {
        ...mockJobStatus,
        state: "completed",
        finalized_at: "2026-01-10T14:35:00Z",
      },
    },
    isReparsing: true,
  },
};



export const Retryable: Story = {
  args: {
    log: {
      ...mockLog,
      status: {
        ...mockJobStatus,
        state: "retryable",
        attempted_at: "2026-01-10T14:31:00Z",
        errors: [
          {
            at: "2026-01-10T14:32:00Z",
            attempt: 1,
            error: "Connection timeout while processing log file",
            trace: "",
          },
        ],
      },
    },
  },
};

export const Failed: Story = {
  args: {
    log: {
      ...mockLog,
      status: {
        ...mockJobStatus,
        state: "discarded",
        attempt: 3,
        max_attempts: 3,
        attempted_at: "2026-01-10T14:31:00Z",
        finalized_at: "2026-01-10T14:35:00Z",
        errors: [
          {
            at: "2026-01-10T14:32:00Z",
            attempt: 1,
            error: "Connection timeout while processing log file",
            trace: "",
          },
          {
            at: "2026-01-10T14:34:00Z",
            attempt: 2,
            error: "Database connection failed during processing",
            trace: "",
          },
          {
            at: "2026-01-10T14:35:00Z",
            attempt: 3,
            error: "Invalid log format: expected COMBAT_LOG_VERSION header",
            trace: "goroutine 1 [running]:\nmain.processLog()\n\t/app/process.go:42\nmain.main()\n\t/app/main.go:15",
          },
        ],
      },
    },
  },
};

export const Cancelled: Story = {
  args: {
    log: {
      ...mockLog,
      status: {
        ...mockJobStatus,
        state: "cancelled",
        finalized_at: "2026-01-10T14:33:00Z",
      },
    },
  },
};

export const CancelledWithErrors: Story = {
  args: {
    log: {
      ...mockLog,
      status: {
        ...mockJobStatus,
        state: "cancelled",
        attempt: 2,
        max_attempts: 3,
        attempted_at: "2026-01-10T14:31:00Z",
        finalized_at: "2026-01-10T14:33:00Z",
        errors: [
          {
            at: "2026-01-10T14:31:30Z",
            attempt: 1,
            error: "Connection timeout during processing",
            trace: "",
          },
          {
            at: "2026-01-10T14:32:00Z",
            attempt: 2,
            error: "Job cancelled by user request",
            trace: "",
          },
        ],
      },
    },
  },
};

export const DeleteConfirmation: Story = {
  args: {
    log: mockLog,
    showDeleteConfirm: true,
  },
};

export const Deleting: Story = {
  args: {
    log: mockLog,
    showDeleteConfirm: true,
    isDeleting: true,
  },
};

export const SingleFile: Story = {
  args: {
    log: {
      ...mockLog,
      files: [mockLog.files[0]],
      status: { ...mockJobStatus, state: "completed", finalized_at: "2026-01-10T14:35:00Z" },
    },
  },
};

export const NoFiles: Story = {
  args: {
    log: {
      ...mockLog,
      files: [],
    },
  },
};

// Story with parsed instances showing the full cathedral run
export const WithParsedInstances: Story = {
  args: {
    log: {
      ...mockLog,
      status: {
        ...mockJobStatus,
        state: "completed",
        attempted_at: "2026-01-14T20:22:09.641085Z",
        finalized_at: "2026-01-14T20:22:10.342483Z",
        output: mockParsedOutput as unknown as Record<string, string>,
      },
    },
  },
};

// Story with multiple instances
export const MultipleInstances: Story = {
  args: {
    log: {
      ...mockLog,
      status: {
        ...mockJobStatus,
        state: "completed",
        attempted_at: "2026-01-14T20:22:09.641085Z",
        finalized_at: "2026-01-14T20:22:10.342483Z",
        output: {
          instances: [
            ...mockParsedOutput.instances,
            {
              id: "d63bdaae-bb0c-4952-a6d3-6848c6f639c9",
              name: "Scarlet Monastery Library",
              realm_id: "851d2fd3-f9c5-4623-b714-924b59d916aa",
              log_group_id: "296c74e3-310b-4137-987d-f711471f68e6",
              encounters: [
                { id: "1f94b2ed-d1da-4ebc-9c86-0e1c7b33e35d", boss: true, kill: true, name: "Houndmaster Loksey", end_time: "2025-12-09T10:30:00.000-06:00", start_time: "2025-12-09T10:28:00.000-06:00", instance_id: "d63bdaae-bb0c-4952-a6d3-6848c6f639c9" },
                { id: "2f94b2ed-d1da-4ebc-9c86-0e1c7b33e35e", boss: true, kill: true, name: "Arcanist Doan", end_time: "2025-12-09T10:45:00.000-06:00", start_time: "2025-12-09T10:42:00.000-06:00", instance_id: "d63bdaae-bb0c-4952-a6d3-6848c6f639c9" },
                { id: "3f94b2ed-d1da-4ebc-9c86-0e1c7b33e35f", boss: false, kill: true, name: "Scarlet Sorcerer", end_time: "2025-12-09T10:35:00.000-06:00", start_time: "2025-12-09T10:34:00.000-06:00", instance_id: "d63bdaae-bb0c-4952-a6d3-6848c6f639c9" },
                { id: "4f94b2ed-d1da-4ebc-9c86-0e1c7b33e360", boss: false, kill: true, name: "Scarlet Adept", end_time: "2025-12-09T10:36:00.000-06:00", start_time: "2025-12-09T10:35:30.000-06:00", instance_id: "d63bdaae-bb0c-4952-a6d3-6848c6f639c9" },
              ],
            },
          ],
          instance_failures: {},
        } as unknown as Record<string, string>,
      },
    },
  },
};

// Story with instance parse failures
export const WithInstanceFailures: Story = {
  args: {
    log: {
      ...mockLog,
      status: {
        ...mockJobStatus,
        state: "completed",
        attempted_at: "2026-01-14T20:22:09.641085Z",
        finalized_at: "2026-01-14T20:22:10.342483Z",
        output: {
          instances: mockParsedOutput.instances,
          instance_failures: {
            "Scarlet Monastery Graveyard_0": "Failed to parse encounter data: invalid timestamp format",
            "Unknown Instance_1": "Instance not recognized in database",
          },
        } as unknown as Record<string, string>,
      },
    },
  },
};

// Story with only trash fights (no bosses)
export const OnlyTrashFights: Story = {
  args: {
    log: {
      ...mockLog,
      status: {
        ...mockJobStatus,
        state: "completed",
        attempted_at: "2026-01-14T20:22:09.641085Z",
        finalized_at: "2026-01-14T20:22:10.342483Z",
        output: {
          instances: [
            {
              id: "e74bdaae-bb0c-4952-a6d3-6848c6f639ca",
              name: "Deadmines",
              realm_id: "851d2fd3-f9c5-4623-b714-924b59d916aa",
              log_group_id: "296c74e3-310b-4137-987d-f711471f68e6",
              encounters: [
                { id: "5f94b2ed-d1da-4ebc-9c86-0e1c7b33e361", boss: false, kill: true, name: "Defias Pirate", end_time: "2025-12-09T09:15:00.000-06:00", start_time: "2025-12-09T09:14:00.000-06:00", instance_id: "e74bdaae-bb0c-4952-a6d3-6848c6f639ca" },
                { id: "6f94b2ed-d1da-4ebc-9c86-0e1c7b33e362", boss: false, kill: true, name: "Defias Miner", end_time: "2025-12-09T09:16:00.000-06:00", start_time: "2025-12-09T09:15:30.000-06:00", instance_id: "e74bdaae-bb0c-4952-a6d3-6848c6f639ca" },
                { id: "7f94b2ed-d1da-4ebc-9c86-0e1c7b33e363", boss: false, kill: false, name: "Defias Overseer", end_time: "2025-12-09T09:18:00.000-06:00", start_time: "2025-12-09T09:16:30.000-06:00", instance_id: "e74bdaae-bb0c-4952-a6d3-6848c6f639ca" },
              ],
            },
          ],
          instance_failures: {},
        } as unknown as Record<string, string>,
      },
    },
  },
};

// Story with no instances parsed
export const NoInstancesParsed: Story = {
  args: {
    log: {
      ...mockLog,
      status: {
        ...mockJobStatus,
        state: "completed",
        attempted_at: "2026-01-14T20:22:09.641085Z",
        finalized_at: "2026-01-14T20:22:10.342483Z",
        output: {
          instances: [],
          instance_failures: {},
        } as unknown as Record<string, string>,
      },
    },
  },
};
