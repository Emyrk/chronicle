import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Search, Star, Swords, X } from "lucide-react";
import {
  useAdminLinkCharacter,
  useAdminUnlinkCharacter,
  useAdminUserCharacters,
  useArmorySearch,
  type LinkedCharacter,
  type RequestError,
} from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getClassColorVar } from "@/pages/ArmoryPage/types";

function errorToast(fallback: string, error: unknown) {
  const requestError = error as RequestError;
  toast.error(requestError?.message || fallback, {
    description: requestError?.detail ? (
      <span className="mt-1 block font-mono text-xs whitespace-pre-wrap break-all">
        {requestError.detail}
      </span>
    ) : undefined,
  });
}

function CharacterRow({ character, userId }: { character: LinkedCharacter; userId: string }) {
  const unlink = useAdminUnlinkCharacter();

  const handleUnlink = () => {
    if (!window.confirm(`Unlink ${character.name} from this account?`)) return;
    unlink.mutate(
      { userId, realmId: character.realm_id, characterGuid: character.character_guid },
      {
        onSuccess: () => toast.success(`${character.name} unlinked.`),
        onError: (error) => errorToast("Failed to unlink character", error),
      },
    );
  };

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Link
            to={`/armory/${encodeURIComponent(character.realm_name)}/${character.character_guid}`}
            className="text-sm font-medium hover:underline"
            style={{ color: getClassColorVar(character.class) }}
          >
            {character.name}
          </Link>
          {character.is_primary && (
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-500">
              <Star className="h-3 w-3" />
              Primary
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          Level {character.level} {character.race} {character.class}
          {" · "}
          {character.realm_name}
          {character.guild_name ? ` · <${character.guild_name}>` : ""}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive shrink-0"
        disabled={unlink.isPending}
        onClick={handleUnlink}
      >
        Unlink
      </Button>
    </div>
  );
}

function LinkCharacterForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [query, setQuery] = useState("");
  const { data: results, isFetching } = useArmorySearch({ q: query });
  const linkMutation = useAdminLinkCharacter();

  const handleLink = (player: { id: string; realm_id: string; name: string }) => {
    linkMutation.mutate(
      { userId, request: { realm_id: player.realm_id, character_guid: player.id } },
      {
        onSuccess: () => {
          toast.success(`${player.name} linked.`);
          onDone();
        },
        onError: (error) => errorToast("Failed to link character", error),
      },
    );
  };

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          autoFocus
          placeholder="Search characters by name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8"
        />
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onDone} aria-label="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {isFetching ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching...
        </div>
      ) : results && results.players.length > 0 ? (
        <div className="max-h-56 overflow-y-auto divide-y rounded border">
          {results.players.map((player) => (
            <button
              key={`${player.realm_id}-${player.id}`}
              type="button"
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50 disabled:opacity-50"
              disabled={linkMutation.isPending}
              onClick={() => handleLink(player)}
            >
              <span className="text-sm font-medium" style={{ color: getClassColorVar(player.class) }}>
                {player.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {player.level} {player.class} · {player.realm_name}
              </span>
            </button>
          ))}
        </div>
      ) : query.length >= 2 ? (
        <p className="text-sm text-muted-foreground py-1">No characters found.</p>
      ) : (
        <p className="text-xs text-muted-foreground py-1">Type at least 2 characters to search.</p>
      )}
    </div>
  );
}

/**
 * Admin section listing a user's linked characters with link/unlink actions.
 * Rendered inside the expanded user row on the admin users page.
 */
export function UserCharactersSection({ userId, enabled }: { userId: string; enabled: boolean }) {
  const { data: characters, isLoading } = useAdminUserCharacters(userId, { enabled });
  const [linking, setLinking] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Swords className="h-4 w-4 text-muted-foreground" />
          Linked Characters
        </div>
        {!linking && (
          <Button size="sm" variant="outline" onClick={() => setLinking(true)}>
            Link character
          </Button>
        )}
      </div>

      {linking && <LinkCharacterForm userId={userId} onDone={() => setLinking(false)} />}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : characters && characters.length > 0 ? (
        <div className="border rounded-lg divide-y mt-2">
          {characters.map((character) => (
            <CharacterRow
              key={`${character.realm_id}-${character.character_guid}`}
              character={character}
              userId={userId}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-2">No linked characters.</p>
      )}
    </div>
  );
}
