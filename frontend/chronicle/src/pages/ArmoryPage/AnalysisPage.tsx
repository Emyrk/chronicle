import { useState, type ReactNode } from "react";
import { ChartNoAxesCombined, Search, Shield, Star, Timer } from "lucide-react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useArmoryPlayers, useArmorySearch, useGuildSearch, useMyFavorites } from "@/api/queries";
import type {
  ArmoryPlayer,
  ArmorySearchResult,
  FavoriteGuild,
  FavoritePlayer,
  GuildInfo,
} from "@/api/typesGenerated";
import { AdRailStack } from "@/components/Ads/AdRailStack";
import { AdSlot } from "@/components/Ads/AdSlot";
import { AdSuppressionProvider } from "@/components/Ads/AdSuppressionProvider";
import { Card } from "@/components/ui/Card/Card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { DatasetProvider } from "@/hooks/useDatasetId";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  DEFAULT_GUILD_HISTORY_STATE,
  serializeGuildHistoryState,
} from "../GuildHistory/guildHistoryState";
import { performanceAdsSuppressed, shouldShowPerformanceSearchAd } from "./performanceAds";
import { excludeFavoriteResults, matchesLandingSearch } from "./performanceLandingModel";
import { getClassColorVar } from "./types";
import {
  DEFAULT_PERFORMANCE_COMPARISON_STATE,
  parsePerformanceComparisonState,
  serializePerformanceComparisonState,
  type PerformanceComparisonState,
} from "./overview/performanceComparisonState";
import { PerformanceExplorer } from "./overview/PerformanceExplorer";

/** Shareable workspace for player performance comparisons and future analysis tools. */
export function PerformanceComparisonPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const state = parsePerformanceComparisonState(searchParams);
  const playerQueries = useArmoryPlayers(state.players);

  if (!state.realmName || state.players.length === 0) {
    return (
      <PerformanceComparisonLanding
        onSelectPlayer={(realmName, playerId) => {
          setSearchParams(serializePerformanceComparisonState({
            ...DEFAULT_PERFORMANCE_COMPARISON_STATE,
            realmName,
            players: [{ id: playerId, realmName, spec: null, subSpec: null, hidden: false }],
          }));
        }}
        onSelectGuild={(guildId) => {
          const params = serializeGuildHistoryState({
            ...DEFAULT_GUILD_HISTORY_STATE,
            guildIds: [guildId],
          });
          navigate(`/guild-history?${params.toString()}`);
        }}
      />
    );
  }

  const players = playerQueries.flatMap((query) => query.data ? [query.data] : []);
  if (players.length === 0 && playerQueries.some((query) => query.isLoading)) {
    return <div className="flex min-h-[400px] items-center justify-center text-muted-foreground">Loading characters…</div>;
  }

  if (players.length === 0) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-muted-foreground">
        No selected characters could be loaded.
      </div>
    );
  }

  const updateState = (nextState: PerformanceComparisonState) => {
    setSearchParams(serializePerformanceComparisonState(nextState), { replace: true });
  };

  return (
    <AdSuppressionProvider suppressed={performanceAdsSuppressed(players)}>
      <DatasetProvider datasetId={players[0].dataset_id} iconBaseUrl={players[0].icon_base_url}>
        <AnalysisContent players={players} state={state} onStateChange={updateState} />
      </DatasetProvider>
    </AdSuppressionProvider>
  );
}

/** Preserve old direct Armory analysis links while moving state into the query string. */
export function ArmoryAnalysisRedirect() {
  const { realmName = "", playerIdentifier = "" } = useParams<{
    realmName: string;
    playerIdentifier: string;
  }>();
  const search = serializePerformanceComparisonState({
    ...DEFAULT_PERFORMANCE_COMPARISON_STATE,
    realmName,
    players: playerIdentifier ? [{ id: playerIdentifier, realmName, spec: null, subSpec: null, hidden: false }] : [],
  });
  return <Navigate replace to={`/performance-history?${search.toString()}`} />;
}

function PerformanceComparisonLanding({
  onSelectPlayer,
  onSelectGuild,
}: {
  onSelectPlayer: (realmName: string, playerId: string) => void;
  onSelectGuild: (guildId: string) => void;
}) {
  const [playerQuery, setPlayerQuery] = useState("");
  const [guildQuery, setGuildQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState<"player" | "guild" | null>(null);
  const debouncedPlayerQuery = useDebouncedValue(playerQuery.trim(), 250);
  const debouncedGuildQuery = useDebouncedValue(guildQuery.trim(), 250);
  const playerSearch = useArmorySearch({ q: debouncedPlayerQuery });
  const guildSearch = useGuildSearch(
    { search: debouncedGuildQuery },
    { enabled: debouncedGuildQuery.length >= 2 },
  );
  const { isAuthenticated } = useAuth();
  const favorites = useMyFavorites({ enabled: isAuthenticated });
  const favoritePlayers = (favorites.data?.players ?? []).filter((player) => matchesLandingSearch(
    debouncedPlayerQuery,
    player.name,
    player.realm_name,
    player.class,
    player.guild_name,
  ));
  const favoriteGuilds = (favorites.data?.guilds ?? []).filter((guild) => matchesLandingSearch(
    debouncedGuildQuery,
    guild.name,
    guild.realm_name,
  ));
  const playerResults = excludeFavoriteResults(playerSearch.data?.players ?? [], favorites.data?.players ?? []).slice(0, 15);
  const guildResults = excludeFavoriteResults(guildSearch.data?.guilds ?? [], favorites.data?.guilds ?? []).slice(0, 15);

  return (
    <div className="mx-auto flex w-full max-w-[1920px] items-start gap-6 px-4 py-8 sm:py-12">
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 text-center">
            <ChartNoAxesCombined className="mx-auto h-8 w-8 text-sky-400" />
            <h1 className="mt-3 text-2xl font-semibold">Performance History</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Follow a character&apos;s raid performance, or track how a guild&apos;s clear times change over time.
            </p>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card className="overflow-hidden border-sky-500/20 bg-gradient-to-b from-sky-500/[0.06] to-card p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-sky-500/20 bg-sky-500/10">
                  <ChartNoAxesCombined className="h-5 w-5 text-sky-400" />
                </span>
                <div>
                  <h2 className="font-semibold">Player performance</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Review parses, trends, gear, and compare characters.</p>
                </div>
              </div>
              <div className="relative mt-5">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={playerQuery}
                  onFocus={() => setActiveSearch("player")}
                  onChange={(event) => {
                    setPlayerQuery(event.target.value);
                    setActiveSearch("player");
                  }}
                  placeholder="Search player name…"
                  aria-label="Search player performance"
                  aria-expanded={activeSearch === "player"}
                  className="pl-9"
                />
              </div>
              {activeSearch === "player" && (
                <SearchResultsShell>
                  <FavoriteSection
                    label="Favorite characters"
                    loading={favorites.isLoading}
                    hasFavorites={(favorites.data?.players.length ?? 0) > 0}
                    isAuthenticated={isAuthenticated}
                  >
                    {favoritePlayers.map((player) => (
                      <PlayerSearchRow
                        key={`${player.realm_id}:${player.id}`}
                        player={player}
                        favorite
                        onSelect={() => onSelectPlayer(player.realm_name, player.id)}
                      />
                    ))}
                  </FavoriteSection>
                  {debouncedPlayerQuery.length >= 2 && (
                    <SearchResultSection
                      label="Search results"
                      loading={playerSearch.isLoading}
                      empty={playerResults.length === 0}
                      emptyLabel={favoritePlayers.length > 0 ? "No other players found." : "No players found."}
                    >
                      {playerResults.map((player) => (
                        <PlayerSearchRow
                          key={`${player.realm_id}:${player.id}`}
                          player={player}
                          onSelect={() => onSelectPlayer(player.realm_name, player.id)}
                        />
                      ))}
                    </SearchResultSection>
                  )}
                  {debouncedPlayerQuery.length < 2 && favoritePlayers.length === 0 && !favorites.isLoading && (
                    <SearchHint />
                  )}
                </SearchResultsShell>
              )}
            </Card>

            <Card className="overflow-hidden border-amber-500/20 bg-gradient-to-b from-amber-500/[0.06] to-card p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10">
                  <Timer className="h-5 w-5 text-amber-400" />
                </span>
                <div>
                  <h2 className="font-semibold">Guild performance</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Explore clear times, boss splits, and guild comparisons.</p>
                </div>
              </div>
              <div className="relative mt-5">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={guildQuery}
                  onFocus={() => setActiveSearch("guild")}
                  onChange={(event) => {
                    setGuildQuery(event.target.value);
                    setActiveSearch("guild");
                  }}
                  placeholder="Search guild name…"
                  aria-label="Search guild performance"
                  aria-expanded={activeSearch === "guild"}
                  className="pl-9"
                />
              </div>
              {activeSearch === "guild" && (
                <SearchResultsShell>
                  <FavoriteSection
                    label="Favorite guilds"
                    loading={favorites.isLoading}
                    hasFavorites={(favorites.data?.guilds.length ?? 0) > 0}
                    isAuthenticated={isAuthenticated}
                  >
                    {favoriteGuilds.map((guild) => (
                      <GuildSearchRow
                        key={guild.id}
                        guild={guild}
                        favorite
                        onSelect={() => onSelectGuild(guild.id)}
                      />
                    ))}
                  </FavoriteSection>
                  {debouncedGuildQuery.length >= 2 && (
                    <SearchResultSection
                      label="Search results"
                      loading={guildSearch.isLoading}
                      empty={guildResults.length === 0}
                      emptyLabel={favoriteGuilds.length > 0 ? "No other guilds found." : "No guilds found."}
                    >
                      {guildResults.map((guild) => (
                        <GuildSearchRow key={guild.id} guild={guild} onSelect={() => onSelectGuild(guild.id)} />
                      ))}
                    </SearchResultSection>
                  )}
                  {debouncedGuildQuery.length < 2 && favoriteGuilds.length === 0 && !favorites.isLoading && (
                    <SearchHint />
                  )}
                </SearchResultsShell>
              )}
            </Card>
          </div>
        </div>
        {shouldShowPerformanceSearchAd(debouncedPlayerQuery)
          && shouldShowPerformanceSearchAd(debouncedGuildQuery) && (
          <AdSlot
            placement="performance-search-empty"
            format="adaptive"
            className="mx-auto mt-8 max-w-[970px]"
          />
        )}
      </main>
      <AdRailStack
        primaryPlacement="performance-right-rail"
        secondaryPlacement="performance-right-rail-lower"
      />
    </div>
  );
}

function SearchResultsShell({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 max-h-80 overflow-y-auto rounded-md border border-border bg-background/80 text-left shadow-lg styled-scrollbar">
      {children}
    </div>
  );
}

function FavoriteSection({
  label,
  loading,
  hasFavorites,
  isAuthenticated,
  children,
}: {
  label: string;
  loading: boolean;
  hasFavorites: boolean;
  isAuthenticated: boolean;
  children: ReactNode;
}) {
  const hasVisibleFavorites = Array.isArray(children) ? children.length > 0 : !!children;
  if (loading) return <div className="p-4 text-center text-sm text-muted-foreground">Loading favorites…</div>;
  if (!hasVisibleFavorites) {
    if (hasFavorites) return null;
    return (
      <div className="border-b border-border/60 px-3 py-3 text-xs text-muted-foreground">
        {isAuthenticated ? "No favorites yet." : "Sign in to see your favorites here."}
      </div>
    );
  }

  return (
    <section>
      <div className="flex items-center gap-1.5 border-b border-border/60 bg-amber-500/[0.06] px-3 py-2 text-xs font-medium text-muted-foreground">
        <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
        {label}
      </div>
      {children}
    </section>
  );
}

function SearchResultSection({
  label,
  loading,
  empty,
  emptyLabel,
  children,
}: {
  label: string;
  loading: boolean;
  empty: boolean;
  emptyLabel: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="border-b border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground">{label}</div>
      {loading ? (
        <div className="p-5 text-center text-sm text-muted-foreground">Searching…</div>
      ) : empty ? (
        <div className="p-5 text-center text-sm text-muted-foreground">{emptyLabel}</div>
      ) : children}
    </section>
  );
}

function SearchHint() {
  return <div className="px-3 py-3 text-xs text-muted-foreground">Type at least 2 characters to search.</div>;
}

function PlayerSearchRow({
  player,
  favorite = false,
  onSelect,
}: {
  player: FavoritePlayer | ArmorySearchResult;
  favorite?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5 text-left last:border-0 hover:bg-accent/50"
    >
      <span className="min-w-0">
        <span className="font-medium" style={{ color: getClassColorVar(player.class) }}>{player.name}</span>
        <span className="ml-2 text-xs text-muted-foreground">{player.class}</span>
        {player.guild_name && <span className="block truncate text-xs text-muted-foreground">&lt;{player.guild_name}&gt;</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        {favorite && <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" aria-label="Favorite" />}
        {player.realm_name}
      </span>
    </button>
  );
}

function GuildSearchRow({
  guild,
  favorite = false,
  onSelect,
}: {
  guild: FavoriteGuild | GuildInfo;
  favorite?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5 text-left last:border-0 hover:bg-accent/50"
    >
      <span className="flex min-w-0 items-center gap-2">
        {guild.logo_url ? (
          <img src={guild.logo_url} alt="" className="size-6 shrink-0 rounded object-cover" />
        ) : (
          <Shield className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate font-medium">{guild.name}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        {favorite && <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" aria-label="Favorite" />}
        {guild.realm_name}
      </span>
    </button>
  );
}

function AnalysisContent({
  players,
  state,
  onStateChange,
}: {
  players: ArmoryPlayer[];
  state: PerformanceComparisonState;
  onStateChange: (state: PerformanceComparisonState) => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1920px] items-start gap-6 px-2 py-3 sm:px-4 sm:py-4">
      <div className="min-w-0 flex-1">
        <main>
          <PerformanceExplorer players={players} state={state} onStateChange={onStateChange} />
        </main>
      </div>
      <AdRailStack
        primaryPlacement="performance-right-rail"
        secondaryPlacement="performance-right-rail-lower"
      />
    </div>
  );
}
