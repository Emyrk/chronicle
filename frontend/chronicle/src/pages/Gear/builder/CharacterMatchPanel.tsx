import { useState } from "react";
import { Search, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useArmorySearch, useMyCharacters } from "@/api/queries";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { cn } from "@/lib/utils";
import type { StageCoverage } from "./characterMatch";
import { slotLabel } from "./SlotEditorPanel";

export interface MatchedCharacter {
  realm: string;
  name: string;
}

export function parseCharParam(raw: string | null): MatchedCharacter | null {
  if (!raw) return null;
  const idx = raw.indexOf(":");
  if (idx <= 0 || idx === raw.length - 1) return null;
  return { realm: raw.slice(0, idx), name: raw.slice(idx + 1) };
}

export function formatCharParam(char: MatchedCharacter): string {
  return `${char.realm}:${char.name}`;
}

interface CharacterMatchPanelProps {
  matched: MatchedCharacter | null;
  onMatch: (char: MatchedCharacter | null) => void;
  /** Coverage of the currently shown stage, when a character is matched. */
  coverage?: StageCoverage;
  historyLoading?: boolean;
  historyError?: boolean;
}

/**
 * Match the list against an armory character: items seen in the
 * character's logged raid nights count as owned; the newest snapshot
 * counts as equipped. Shows per-stage coverage and what's still missing.
 */
/**
 * Armory-search typeahead: type a character name, pick from the realm's
 * indexed players.
 */
function CharacterSearch({ onPick }: { onPick: (char: MatchedCharacter) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const search = useArmorySearch({ q: debouncedQuery });
  const results = (search.data?.players ?? []).slice(0, 8);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500" />
        <Input
          className="h-6 w-52 pl-6 text-xs"
          placeholder="Search armory characters…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && debouncedQuery.length >= 2 && (
        <div className="absolute z-30 mt-1 w-72 max-h-64 overflow-y-auto rounded-md border border-zinc-700 bg-zinc-900 shadow-lg divide-y divide-zinc-800/70">
          {search.isLoading ? (
            <p className="p-2.5 text-xs text-zinc-500">Searching…</p>
          ) : results.length === 0 ? (
            <p className="p-2.5 text-xs text-zinc-500">No armory characters match.</p>
          ) : (
            results.map((player) => (
              <button
                key={player.id}
                type="button"
                className="flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left hover:bg-zinc-800/60"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick({ realm: player.realm_name, name: player.name });
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span className="text-xs" style={{ color: getClassColorVar(player.class) }}>
                  {player.name}
                </span>
                <span className="text-2xs text-zinc-500">
                  {player.level > 0 && `${player.level} · `}
                  {player.realm_name}
                  {player.guild_name && ` · <${player.guild_name}>`}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function CharacterMatchPanel({
  matched,
  onMatch,
  coverage,
  historyLoading,
  historyError,
}: CharacterMatchPanelProps) {
  const { isAuthenticated } = useAuth();
  const myCharacters = useMyCharacters({ enabled: isAuthenticated });

  return (
    <div className="rounded-md border border-zinc-700/60 bg-zinc-900/40 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-2xs uppercase tracking-wide text-zinc-500 mr-1 inline-flex items-center gap-1">
          <UserRound className="h-3 w-3" />
          Match against character
        </span>
        {(myCharacters.data ?? []).map((c) => {
          const active = matched?.realm === c.realm_name && matched?.name === c.name;
          return (
            <button
              key={c.link_id}
              type="button"
              onClick={() => onMatch(active ? null : { realm: c.realm_name, name: c.name })}
              className={cn(
                "px-2.5 py-0.5 rounded-full text-xs border transition-colors",
                active
                  ? "border-blue-500 bg-blue-500/10 text-white"
                  : "border-zinc-700 text-zinc-400 hover:text-zinc-200",
              )}
            >
              {c.name} · {c.realm_name}
            </button>
          );
        })}
        <CharacterSearch onPick={(char) => onMatch(char)} />
        {matched && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-xs text-zinc-500"
            onClick={() => onMatch(null)}
          >
            <X className="h-3 w-3 mr-0.5" />
            {matched.name}
          </Button>
        )}
      </div>

      {matched &&
        (historyLoading ? (
          <p className="text-2xs text-zinc-500">Loading {matched.name}'s gear history…</p>
        ) : historyError ? (
          <p className="text-2xs text-red-400">
            No armory data found for {matched.name} on {matched.realm}.
          </p>
        ) : coverage ? (
          <div className="space-y-1">
            <p className="text-xs text-zinc-300">
              Owns <span className="font-mono">{coverage.owned}</span> of{" "}
              <span className="font-mono">{coverage.filled}</span> items in this stage
              {coverage.equipped > 0 && (
                <span className="text-zinc-500">
                  {" "}
                  · {coverage.equipped} currently equipped
                </span>
              )}
            </p>
            {coverage.missing.length > 0 && (
              <p className="text-2xs text-zinc-500">
                Still missing: {coverage.missing.map((i) => slotLabel(i)).join(", ")}
              </p>
            )}
            <p className="text-2xs text-zinc-600">
              Ownership comes from logged raid nights — items never seen in a log won't count.
            </p>
          </div>
        ) : null)}
    </div>
  );
}
