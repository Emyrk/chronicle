import { describe, expect, it } from "vitest";
import type { FavoriteGuild, FavoritePlayer } from "@/api/typesGenerated";
import { groupFavorites } from "./favorites";

const guild: FavoriteGuild = {
  id: "guild-1",
  name: "Raiders",
  realm_id: "realm-1",
  realm_name: "Realm",
};

function player(overrides: Partial<FavoritePlayer>): FavoritePlayer {
  return {
    id: "0x0000000000000001",
    realm_id: "realm-1",
    realm_name: "Realm",
    name: "Player",
    class: "Mage",
    race: "Gnome",
    gender: "Female",
    level: 60,
    ...overrides,
  };
}

describe("groupFavorites", () => {
  it("nests players under favorite guilds and keeps other players standalone", () => {
    const nested = player({ guild_id: guild.id, guild_name: guild.name });
    const otherGuild = player({ id: "0x0000000000000002", guild_id: "guild-2" });
    const guildless = player({ id: "0x0000000000000003" });

    const grouped = groupFavorites({
      guilds: [guild],
      players: [nested, otherGuild, guildless],
    });

    expect(grouped.guilds).toEqual([{ guild, players: [nested] }]);
    expect(grouped.standalonePlayers).toEqual([otherGuild, guildless]);
  });
});
