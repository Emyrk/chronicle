import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { useMyFavorites } from "@/api/queries";
import type { FavoritePlayer } from "@/api/typesGenerated";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import { groupFavorites } from "./favorites";

function PlayerFavorite({ player, nested = false }: { player: FavoritePlayer; nested?: boolean }) {
  return (
    <DropdownMenuItem asChild>
      <Link
        to={`/armory/${encodeURIComponent(player.realm_name)}/${encodeURIComponent(player.id)}`}
        className={nested ? "pl-7" : undefined}
      >
        <img
          src={`/c/icons/class_${player.class.toLowerCase()}.png`}
          alt=""
          className="size-7 rounded border border-border bg-muted"
        />
        <span className="min-w-0 flex-1">
          <span
            className="block truncate font-medium"
            style={{ color: `var(--color-class-${player.class.toLowerCase()})` }}
          >
            {player.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {player.guild_name ? `<${player.guild_name}> · ` : ""}Level {player.level} · {player.realm_name}
          </span>
        </span>
      </Link>
    </DropdownMenuItem>
  );
}

export function FavoritesMenu() {
  const { data } = useMyFavorites();
  if (!data || (data.guilds.length === 0 && data.players.length === 0)) return null;

  const grouped = groupFavorites(data);

  return (
    <>
      <DropdownMenuLabel className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Star className="size-3.5 fill-amber-400 text-amber-400" />
        Favorites
      </DropdownMenuLabel>
      {grouped.guilds.map(({ guild, players }) => (
        <div key={guild.id}>
          <DropdownMenuItem asChild>
            <Link to={`/g/${guild.id}`}>
              <Star className="size-4 fill-amber-400 text-amber-400" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-amber-500">{guild.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{guild.realm_name}</span>
              </span>
            </Link>
          </DropdownMenuItem>
          {players.map((player) => (
            <PlayerFavorite key={`${player.realm_id}:${player.id}`} player={player} nested />
          ))}
        </div>
      ))}
      {grouped.standalonePlayers.map((player) => (
        <PlayerFavorite key={`${player.realm_id}:${player.id}`} player={player} />
      ))}
      <DropdownMenuSeparator />
    </>
  );
}
