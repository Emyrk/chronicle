import type { FavoriteGuild, FavoritePlayer, UserFavoritesResponse } from "@/api/typesGenerated";

export interface FavoriteGuildGroup {
  guild: FavoriteGuild;
  players: FavoritePlayer[];
}

export function groupFavorites(favorites: UserFavoritesResponse): {
  guilds: FavoriteGuildGroup[];
  standalonePlayers: FavoritePlayer[];
} {
  const playersByGuild = new Map<string, FavoritePlayer[]>();
  for (const player of favorites.players) {
    if (!player.guild_id) continue;
    const players = playersByGuild.get(player.guild_id) ?? [];
    players.push(player);
    playersByGuild.set(player.guild_id, players);
  }

  const favoriteGuildIDs = new Set(favorites.guilds.map((guild) => guild.id));
  return {
    guilds: favorites.guilds.map((guild) => ({
      guild,
      players: playersByGuild.get(guild.id) ?? [],
    })),
    standalonePlayers: favorites.players.filter(
      (player) => !player.guild_id || !favoriteGuildIDs.has(player.guild_id),
    ),
  };
}
