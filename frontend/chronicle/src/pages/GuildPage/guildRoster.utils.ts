import type { GuildRosterMember, User } from "@/api/queries";

export function filterAddableGuildUsers(
  users: readonly User[],
  members: readonly GuildRosterMember[],
  query: string,
  limit = 8,
): User[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length < 2) return [];

  const memberIDs = new Set(members.map((member) => member.user_id));
  return users
    .filter((user) => {
      if (memberIDs.has(user.id)) return false;
      return user.username.toLowerCase().includes(normalizedQuery)
        || user.email.toLowerCase().includes(normalizedQuery)
        || user.id.toLowerCase().includes(normalizedQuery);
    })
    .sort((a, b) => a.username.localeCompare(b.username))
    .slice(0, limit);
}
