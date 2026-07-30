import { useState, useMemo, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Search, Shield, Users, Loader2, Swords } from "lucide-react";
import { useArmorySearch, useRealms } from "@/api/queries";
import type { ArmorySearchResult } from "@/api/typesGenerated";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { GuildSearchContent } from "@/pages/GuildSearch/GuildSearchContent";

type ArmoryTab = "characters" | "guilds";

const WOW_CLASSES = [
  "Warrior",
  "Paladin",
  "Hunter",
  "Rogue",
  "Priest",
  "Shaman",
  "Mage",
  "Warlock",
  "Druid",
] as const;

/** Map display names to the database enum values used for filtering. */
const CLASS_DB_VALUE: Record<string, string> = {
  Warrior: "WARRIOR",
  Paladin: "PALADIN",
  Hunter: "HUNTER",
  Rogue: "ROGUE",
  Priest: "PRIEST",
  Shaman: "SHAMAN",
  Mage: "MAGE",
  Warlock: "WARLOCK",
  Druid: "DRUID",
};

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function ArmorySearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: ArmoryTab = searchParams.get("tab") === "guilds" ? "guilds" : "characters";

  const setTab = (tab: ArmoryTab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === "guilds") next.set("tab", "guilds");
    else next.delete("tab");
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Armory
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search for characters and guilds seen in uploaded combat logs.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setTab("characters")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "characters"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Swords className="h-4 w-4" />
          Characters
        </button>
        <button
          onClick={() => setTab("guilds")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "guilds"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="h-4 w-4" />
          Guilds
        </button>
      </div>

      {activeTab === "guilds" ? (
        <GuildSearchContent />
      ) : (
        <CharacterSearchContent />
      )}
    </div>
  );
}

function CharacterSearchContent() {
  const { data: realms } = useRealms();
  const [searchParams, setSearchParams] = useSearchParams();

  const query = searchParams.get("q") ?? "";
  const classFilter = searchParams.get("class") ?? "";
  const realmFilter = searchParams.get("realm") ?? "";
  const guildFilter = searchParams.get("guild") ?? "";

  // Local state for the inputs so typing is instant
  const [localQuery, setLocalQuery] = useState(query);
  const [localGuild, setLocalGuild] = useState(guildFilter);

  const debouncedQuery = useDebounce(localQuery, 300);
  const debouncedGuild = useDebounce(localGuild, 300);

  // Sync debounced values to URL
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (debouncedQuery) next.set("q", debouncedQuery);
    else next.delete("q");
    if (debouncedGuild) next.set("guild", debouncedGuild);
    else next.delete("guild");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, debouncedGuild]);

  const apiParams = useMemo(
    () => ({
      q: debouncedQuery,
      class: classFilter ? CLASS_DB_VALUE[classFilter] ?? classFilter : undefined,
      realm: realmFilter || undefined,
      guild: debouncedGuild || undefined,
    }),
    [debouncedQuery, classFilter, realmFilter, debouncedGuild]
  );

  const { data, isLoading, isFetching } = useArmorySearch(apiParams);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      {/* Search + Filters */}
      <div className="space-y-3 mb-6">
        {/* Name search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="Search by character name…"
            className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
            autoFocus
          />
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap gap-3">
          <select
            value={realmFilter}
            onChange={(e) => setFilter("realm", e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-2 text-sm min-w-[140px] focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
          >
            <option value="">All Realms</option>
            {realms?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          <select
            value={classFilter}
            onChange={(e) => setFilter("class", e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-2 text-sm min-w-[140px] focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
          >
            <option value="">All Classes</option>
            {WOW_CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <div className="relative">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={localGuild}
              onChange={(e) => setLocalGuild(e.target.value)}
              placeholder="Guild name…"
              className="pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring min-w-[180px]"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      {debouncedQuery.length < 2 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Type at least 2 characters to search.</p>
        </div>
      ) : isLoading ? (
        <div className="text-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 mx-auto mb-3 animate-spin text-primary" />
          <p className="text-sm">Searching…</p>
        </div>
      ) : data && data.players.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground">
              {data.count} result{data.count !== 1 ? "s" : ""}
            </p>
            {isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-darker text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-medium">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Class</th>
                  <th className="text-center px-4 py-2.5 font-medium hidden md:table-cell">Level</th>
                  <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Guild</th>
                  <th className="text-left px-4 py-2.5 font-medium hidden lg:table-cell">Realm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.players.map((player) => (
                  <PlayerRow key={`${player.id}-${player.realm_id}`} player={player} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No characters found matching &ldquo;{debouncedQuery}&rdquo;.</p>
        </div>
      )}
    </div>
  );
}

function PlayerRow({ player }: { player: ArmorySearchResult }) {
  const classColor = getClassColorVar(player.class);

  return (
    <tr className="hover:bg-primary-darker/40 transition-colors">
      <td className="px-4 py-2.5">
        <Link
          to={`/armory/${encodeURIComponent(player.realm_name)}/${encodeURIComponent(player.id)}`}
          className="font-medium hover:underline"
          style={{ color: classColor }}
        >
          {player.name}
        </Link>
        {/* Show class + level on mobile where columns are hidden */}
        <span className="sm:hidden text-xs text-muted-foreground ml-2">
          {player.class} {player.level}
        </span>
      </td>
      <td className="px-4 py-2.5 hidden sm:table-cell" style={{ color: classColor }}>
        {player.class}
      </td>
      <td className="px-4 py-2.5 text-center hidden md:table-cell text-muted-foreground">
        {player.level}
      </td>
      <td className="px-4 py-2.5 hidden sm:table-cell text-muted-foreground">
        {player.guild_name || "—"}
      </td>
      <td className="px-4 py-2.5 hidden lg:table-cell text-muted-foreground">
        {player.realm_name}
      </td>
    </tr>
  );
}
