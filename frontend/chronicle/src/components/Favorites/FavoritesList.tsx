import { Link } from "react-router-dom";
import { Shield, Star } from "lucide-react";
import type { FavoriteGuild, FavoritePlayer, UserFavoritesResponse } from "@/api/typesGenerated";
import { groupFavorites } from "./favorites";

function GuildFavorite({ guild }: { guild: FavoriteGuild }) {
  return (
    <Link
      to={`/g/${guild.id}`}
      className="flex min-w-0 items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted"
    >
      {guild.logo_url ? (
        <img
          src={guild.logo_url}
          alt={`${guild.name} logo`}
          className="size-10 shrink-0 rounded border border-border bg-muted object-cover"
        />
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded border border-border bg-muted">
          <Shield className="size-5 text-amber-500" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-amber-500">{guild.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{guild.realm_name}</span>
      </span>
    </Link>
  );
}

function PlayerFavorite({ player, nested = false }: { player: FavoritePlayer; nested?: boolean }) {
  return (
    <Link
      to={`/armory/${encodeURIComponent(player.realm_name)}/${encodeURIComponent(player.id)}`}
      className={`flex min-w-0 items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted ${
        nested ? "ml-5" : ""
      }`}
    >
      <img
        src={`/c/icons/class_${player.class.toLowerCase()}.png`}
        alt=""
        className="size-8 shrink-0 rounded border border-border bg-muted"
      />
      <span className="min-w-0">
        <span
          className="block truncate text-sm font-medium"
          style={{ color: `var(--color-class-${player.class.toLowerCase()})` }}
        >
          {player.name}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {player.guild_name ? `<${player.guild_name}> · ` : ""}Level {player.level} · {player.realm_name}
        </span>
      </span>
    </Link>
  );
}

export function FavoritesList({
  data,
  isLoading = false,
}: {
  data?: UserFavoritesResponse;
  isLoading?: boolean;
}) {
  const hasFavorites = !!data && (data.guilds.length > 0 || data.players.length > 0);
  const grouped = data ? groupFavorites(data) : undefined;

  return (
    <section className="rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <Star className="size-4 fill-amber-400 text-amber-400" />
        <h3 className="text-sm font-medium">Favorites</h3>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Quick links to your favorite guilds and characters.
      </p>

      {isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading favorites...</p>
      ) : !hasFavorites || !grouped ? (
        <p className="mt-4 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          You have not added any favorites yet.
        </p>
      ) : (
        <div className="mt-3 grid gap-1 sm:grid-cols-2">
          {grouped.guilds.map(({ guild, players }) => (
            <div key={guild.id} className="min-w-0">
              <GuildFavorite guild={guild} />
              {players.map((player) => (
                <PlayerFavorite key={`${player.realm_id}:${player.id}`} player={player} nested />
              ))}
            </div>
          ))}
          {grouped.standalonePlayers.map((player) => (
            <PlayerFavorite key={`${player.realm_id}:${player.id}`} player={player} />
          ))}
        </div>
      )}
    </section>
  );
}
