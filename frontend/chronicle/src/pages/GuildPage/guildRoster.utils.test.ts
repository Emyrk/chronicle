import { describe, expect, it } from "vitest";
import type { GuildRosterMember, User } from "@/api/queries";
import { filterAddableGuildUsers } from "./guildRoster.utils";

function user(id: string, username: string, email = `${username.toLowerCase()}@example.com`): User {
  return {
    id,
    username,
    email,
    roles: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    max_storage_bytes: 0,
    max_storage_bytes_updated: "2026-01-01T00:00:00Z",
    consumed_storage_bytes: 0,
    raw_log_retention_hours: null,
  };
}

const members: GuildRosterMember[] = [
  { user_id: "member-id", username: "Existing", roles: ["member"] },
];

const users = [
  user("member-id", "Existing"),
  user("z-id", "Zelda"),
  user("a-id", "Alice", "healer@example.com"),
];

describe("filterAddableGuildUsers", () => {
  it("requires at least two search characters", () => {
    expect(filterAddableGuildUsers(users, members, "a")).toEqual([]);
  });

  it("matches user fields and excludes existing guild members", () => {
    expect(filterAddableGuildUsers(users, members, "example").map((candidate) => candidate.username))
      .toEqual(["Alice", "Zelda"]);
    expect(filterAddableGuildUsers(users, members, "a-id").map((candidate) => candidate.username))
      .toEqual(["Alice"]);
  });

  it("sorts matches by username and applies the result limit", () => {
    expect(filterAddableGuildUsers(users, [], "example", 1).map((candidate) => candidate.username))
      .toEqual(["Alice"]);
  });
});
