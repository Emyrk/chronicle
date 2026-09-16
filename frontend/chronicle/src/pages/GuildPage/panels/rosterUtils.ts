import type { GuildRosterCharacter } from "@/api/typesGenerated";

// Shared helpers for the Roster guild page panel.

export type RosterSort = "parse" | "level" | "lastSeen" | "name";

export function filterRosterMembers(
  members: readonly GuildRosterCharacter[],
  selectedClass: string | null,
): GuildRosterCharacter[] {
  if (!selectedClass) return [...members];
  return members.filter((member) => member.class === selectedClass);
}

export function sortRosterMembers(
  members: readonly GuildRosterCharacter[],
  sortBy: RosterSort,
): GuildRosterCharacter[] {
  const sorted = [...members];
  switch (sortBy) {
    case "level":
      sorted.sort((a, b) => b.level - a.level || b.avg_parse - a.avg_parse);
      break;
    case "lastSeen":
      sorted.sort((a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime());
      break;
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    default:
      // The server returns parse order, so preserve the input order.
      break;
  }
  return sorted;
}

export function paginateRosterMembers(
  members: readonly GuildRosterCharacter[],
  requestedPage: number,
  requestedPageSize: number,
) {
  const pageSize = Math.max(1, Math.floor(requestedPageSize));
  const totalPages = Math.max(1, Math.ceil(members.length / pageSize));
  const page = Math.min(Math.max(0, requestedPage), totalPages - 1);
  const start = page * pageSize;
  const end = Math.min(start + pageSize, members.length);

  return {
    members: members.slice(start, end),
    page,
    pageSize,
    totalPages,
    start,
    end,
  };
}

/** Formats an ISO timestamp as a compact "last seen" string ("3d ago"). */
export function formatLastSeen(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays < 1) return "today";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 60) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}
