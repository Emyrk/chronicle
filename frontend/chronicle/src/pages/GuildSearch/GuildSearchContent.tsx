import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Search, Users, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { useGuildSearch, useRealms } from "@/api/queries";
import type { GuildInfo } from "@/api/typesGenerated";

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Shared guild search UI. Used both on the standalone /guilds page
 * and embedded in the Armory "Guilds" tab.
 */
export function GuildSearchContent() {
  const { data: realms } = useRealms();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get("guild_q") ?? "";
  const realmFilter = searchParams.get("guild_realm") ?? "";

  const [localSearch, setLocalSearch] = useState(search);
  const debouncedSearch = useDebounce(localSearch, 300);
  const [page, setPage] = useState(0);
  const pageSize = 15;

  // Reset to first page when search or realm changes
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, realmFilter]);

  // Sync debounced value to URL
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (debouncedSearch) next.set("guild_q", debouncedSearch);
    else next.delete("guild_q");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const { data, isLoading, isFetching } = useGuildSearch({
    search: debouncedSearch,
    realm: realmFilter || undefined,
    offset: page * pageSize,
  });

  const total = data?.total ?? 0;
  const showingStart = total === 0 ? 0 : page * pageSize + 1;
  const showingEnd = Math.min((page + 1) * pageSize, total);
  const hasNextPage = showingEnd < total;
  const hasPrevPage = page > 0;

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
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search by guild name…"
            className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
            autoFocus
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={realmFilter}
            onChange={(e) => setFilter("guild_realm", e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-2 text-sm min-w-[140px] focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
          >
            <option value="">All Realms</option>
            {realms?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 mx-auto mb-3 animate-spin text-primary" />
          <p className="text-sm">Loading guilds…</p>
        </div>
      ) : data && data.guilds.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground">
              Showing {showingStart}–{showingEnd} of {total} guild{total !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-1">
              {isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              {(hasPrevPage || hasNextPage) && (
                <>
                  <button
                    onClick={() => setPage((p) => p - 1)}
                    disabled={!hasPrevPage}
                    className="p-1 rounded hover:bg-primary-darker disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!hasNextPage}
                    className="p-1 rounded hover:bg-primary-darker disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-darker text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-medium">Guild</th>
                  <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Realm</th>
                  <th className="text-center px-4 py-2.5 font-medium hidden md:table-cell">Players</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.guilds.map((guild) => (
                  <GuildRow key={guild.id} guild={guild} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">
            {debouncedSearch
              ? `No guilds found matching "${debouncedSearch}".`
              : "No guilds found."}
          </p>
        </div>
      )}
    </div>
  );
}

function GuildRow({ guild }: { guild: GuildInfo }) {
  return (
    <tr className="hover:bg-primary-darker/40 transition-colors">
      <td className="px-4 py-2.5">
        <Link
          to={`/g/${guild.id}`}
          className="font-medium text-foreground hover:underline flex items-center gap-2"
        >
          {guild.logo_url ? (
            <img
              src={guild.logo_url}
              alt=""
              className="h-5 w-5 rounded-full object-cover shrink-0"
            />
          ) : (
            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          {guild.name}
        </Link>
        <span className="sm:hidden text-xs text-muted-foreground ml-6">
          {guild.realm_name}
        </span>
      </td>
      <td className="px-4 py-2.5 hidden sm:table-cell text-muted-foreground">
        {guild.realm_name}
      </td>
      <td className="px-4 py-2.5 text-center hidden md:table-cell text-muted-foreground">
        {guild.player_count}
      </td>
    </tr>
  );
}
