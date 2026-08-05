import { useState } from "react";
import { UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useMyCharacters } from "@/api/queries";
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
export function CharacterMatchPanel({
  matched,
  onMatch,
  coverage,
  historyLoading,
  historyError,
}: CharacterMatchPanelProps) {
  const { isAuthenticated } = useAuth();
  const myCharacters = useMyCharacters({ enabled: isAuthenticated });
  const [realm, setRealm] = useState("");
  const [name, setName] = useState("");

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
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!realm.trim() || !name.trim()) return;
            onMatch({ realm: realm.trim(), name: name.trim() });
          }}
        >
          <Input
            className="h-6 w-28 text-xs"
            placeholder="Realm"
            value={realm}
            onChange={(e) => setRealm(e.target.value)}
          />
          <Input
            className="h-6 w-28 text-xs"
            placeholder="Character"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" variant="outline" size="sm" className="h-6 px-2 text-xs">
            Match
          </Button>
        </form>
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
