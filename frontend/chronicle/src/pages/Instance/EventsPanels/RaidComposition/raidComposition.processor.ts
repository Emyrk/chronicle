import type {
  PanelProcessor,
  ProcessorContext,
  RaidGroupProcessorEvent,
} from "../processorTypes";

const RAID_GROUP_COUNT = 8;
const RAID_GROUP_SIZE = 5;

export interface RaidCompositionResult {
  /** Latest selected raid layout, preserving all 8 x 5 slots. */
  groups: string[][];
  encounterID: string | null;
  observedAt: number | null;
}

function emptyGroups(): string[][] {
  return Array.from({ length: RAID_GROUP_COUNT }, () =>
    Array<string>(RAID_GROUP_SIZE).fill(""),
  );
}

export const raidCompositionProcessor: PanelProcessor<
  RaidCompositionResult,
  RaidGroupProcessorEvent
> = {
  id: "raid_composition",
  streams: ["raid_group"],
  createState: () => ({
    groups: emptyGroups(),
    encounterID: null,
    observedAt: null,
  }),
  processEvent: (state, event, encounterID, firstTimestamp, _streamType, context: ProcessorContext) => {
    if (!context.selectedEncounterIds.has(encounterID)) return;

    state.groups = Array.from({ length: RAID_GROUP_COUNT }, (_, groupIndex) =>
      Array.from({ length: RAID_GROUP_SIZE }, (_, slotIndex) =>
        event.groupMemberGuids[groupIndex * RAID_GROUP_SIZE + slotIndex] ?? "",
      ),
    );
    state.encounterID = encounterID;
    state.observedAt = firstTimestamp.getTime() + event.offsetMilli;
  },
};
