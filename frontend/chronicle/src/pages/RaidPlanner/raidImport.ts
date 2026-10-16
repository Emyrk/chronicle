import type {
  GuildRosterCharacter,
  InstanceRaidGroupComposition,
  InstanceRaidGroupMember,
  InstanceRaidGroupResponse,
  WoWAttendanceInstance,
} from "@/api/typesGenerated";
import { GROUP_SIZE, MAX_GROUPS, playerEntry, type Board, type PlayerEntry } from "./types";

export interface RaidImportResult {
  board: Board;
  bench: PlayerEntry[];
}

function importEntry(
  instance: WoWAttendanceInstance,
  guid: string,
  member: InstanceRaidGroupMember | undefined,
  rosterByName: Map<string, PlayerEntry>,
): PlayerEntry {
  const logged = instance.players[guid];
  const name = member?.name ?? logged?.name ?? "Unknown";
  const matched = rosterByName.get(name.toLowerCase());
  const spec = member?.spec ?? matched?.reportedSpec ?? "";

  if (matched) {
    return {
      ...matched,
      spec: spec || matched.spec,
      reportedSpec: spec || matched.reportedSpec,
      note: "",
    };
  }

  return {
    kind: "player",
    id: `raid:${instance.id}:${guid}`,
    name,
    cls: member?.class ?? logged?.class ?? "UNKNOWN",
    spec,
    reportedSpec: spec,
    role: "",
    specRoles: spec ? [{ spec, role: "" }] : [],
    avgParse: -1,
    level: logged?.level ?? 0,
    realmName: instance.realm_name ?? "",
    note: "",
  };
}

function preferredComposition(raidGroup: InstanceRaidGroupResponse | null): InstanceRaidGroupComposition | null {
  if (!raidGroup?.available) return null;
  return raidGroup.final ?? raidGroup.clean_kills.at(-1)?.composition ?? null;
}

export async function fetchRaidImport(
  instanceID: string,
  roster: readonly GuildRosterCharacter[],
  signal?: AbortSignal,
): Promise<RaidImportResult & { title: string }> {
  const encodedID = encodeURIComponent(instanceID);
  const [instanceResponse, raidGroupResponse] = await Promise.all([
    fetch(`/api/v1/raidlogs/instances/${encodedID}?attendance_only=true`, { signal }),
    fetch(`/api/v1/raidlogs/instances/${encodedID}/raid-group`, { signal }),
  ]);
  if (!instanceResponse.ok) throw new Error("Failed to load that raid");
  const instance = (await instanceResponse.json()) as WoWAttendanceInstance;
  const raidGroup = raidGroupResponse.ok
    ? ((await raidGroupResponse.json()) as InstanceRaidGroupResponse)
    : null;
  return { ...buildRaidImport(instance, raidGroup, roster), title: instance.name };
}

export function buildRaidImport(
  instance: WoWAttendanceInstance,
  raidGroup: InstanceRaidGroupResponse | null,
  roster: readonly GuildRosterCharacter[],
): RaidImportResult {
  const rosterByName = new Map(
    roster.map((member) => {
      const entry = playerEntry(member);
      return [entry.name.toLowerCase(), entry] as const;
    }),
  );
  const composition = preferredComposition(raidGroup);
  const placedGuids = new Set<string>();

  const board: Board = composition
    ? composition.groups.slice(0, MAX_GROUPS).map((group) => {
        const entries = group.slice(0, GROUP_SIZE).map((member) => {
          placedGuids.add(member.guid);
          return importEntry(instance, member.guid, member, rosterByName);
        });
        return [...entries, ...Array<PlayerEntry | null>(GROUP_SIZE - entries.length).fill(null)];
      })
    : [];

  const remaining = Object.entries(instance.players)
    .filter(([guid]) => !placedGuids.has(guid))
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))
    .map(([guid]) => importEntry(instance, guid, undefined, rosterByName));

  if (board.length === 0) {
    const boardEntries = remaining.splice(0, MAX_GROUPS * GROUP_SIZE);
    for (let index = 0; index < boardEntries.length; index += GROUP_SIZE) {
      const entries = boardEntries.slice(index, index + GROUP_SIZE);
      board.push([...entries, ...Array<PlayerEntry | null>(GROUP_SIZE - entries.length).fill(null)]);
    }
  }

  return { board, bench: remaining };
}
