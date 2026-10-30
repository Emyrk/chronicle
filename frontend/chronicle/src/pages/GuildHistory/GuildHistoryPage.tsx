import { useState } from "react";
import { Search, Timer } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useGuildSearch } from "@/api/queries";
import { Card } from "@/components/ui/Card/Card";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { GuildHistoryExplorer, GuildPickRow } from "./GuildHistoryExplorer";
import {
  DEFAULT_GUILD_HISTORY_STATE,
  parseGuildHistoryState,
  serializeGuildHistoryState,
  type GuildHistoryState,
} from "./guildHistoryState";

/** Shareable clear-time history for one guild or a comparison of several. */
export function GuildHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const state = parseGuildHistoryState(searchParams);
  const updateState = (next: GuildHistoryState) => {
    setSearchParams(serializeGuildHistoryState(next), { replace: true });
  };

  if (state.guildIds.length === 0) {
    return (
      <GuildHistoryLanding
        onSelect={(guildId) => setSearchParams(serializeGuildHistoryState({ ...DEFAULT_GUILD_HISTORY_STATE, guildIds: [guildId] }))}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-2 py-3 sm:px-4 sm:py-4">
      <GuildHistoryExplorer state={state} onStateChange={updateState} />
    </div>
  );
}

function GuildHistoryLanding({ onSelect }: { onSelect: (guildId: string) => void }) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 250);
  const search = useGuildSearch({ search: debounced });
  const guilds = search.data?.guilds ?? [];

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-12">
      <Card className="mx-auto max-w-3xl p-8">
        <div className="mx-auto max-w-xl text-center">
          <Timer className="mx-auto h-8 w-8 text-sky-400" />
          <h1 className="mt-4 text-xl font-semibold">Guild Analysis</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose a guild to see how its clear times change over time, then add others to compare.
          </p>
          <div className="relative mt-6 text-left">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guild name…" className="pl-9" />
          </div>
          {debounced.length >= 2 && (
            <div className="mt-2 max-h-80 overflow-y-auto rounded-md border border-border text-left styled-scrollbar">
              {search.isLoading ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Searching…</div>
              ) : guilds.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No guilds found.</div>
              ) : (
                guilds.slice(0, 15).map((guild) => <GuildPickRow key={guild.id} guild={guild} onSelect={() => onSelect(guild.id)} />)
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
