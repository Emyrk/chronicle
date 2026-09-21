import { useState } from "react";
import { ArrowLeft, ChartNoAxesCombined, Search } from "lucide-react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { useArmoryPlayers, useArmorySearch } from "@/api/queries";
import type { ArmoryPlayer } from "@/api/typesGenerated";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card/Card";
import { Input } from "@/components/ui/input";
import { DatasetProvider } from "@/hooks/useDatasetId";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { getClassColorVar } from "./types";
import { IdentityHeader } from "./overview/IdentityHeader";
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
  const state = parsePerformanceComparisonState(searchParams);
  const playerQueries = useArmoryPlayers(state.realmName, state.players.map((player) => player.id));

  if (!state.realmName || state.players.length === 0) {
    return <PerformanceComparisonLanding onSelect={(realmName, playerId) => {
      setSearchParams(serializePerformanceComparisonState({
        ...DEFAULT_PERFORMANCE_COMPARISON_STATE,
        realmName,
        players: [{ id: playerId, spec: null, subSpec: null }],
      }));
    }} />;
  }

  if (playerQueries.some((query) => query.isLoading)) {
    return <div className="flex min-h-[400px] items-center justify-center text-muted-foreground">Loading characters…</div>;
  }

  const players = playerQueries.flatMap((query) => query.data ? [query.data] : []);
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
    <DatasetProvider datasetId={players[0].dataset_id} iconBaseUrl={players[0].icon_base_url}>
      <AnalysisContent players={players} state={state} onStateChange={updateState} />
    </DatasetProvider>
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
    players: playerIdentifier ? [{ id: playerIdentifier, spec: null, subSpec: null }] : [],
  });
  return <Navigate replace to={`/performance-comparison?${search.toString()}`} />;
}

function PerformanceComparisonLanding({ onSelect }: { onSelect: (realmName: string, playerId: string) => void }) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const search = useArmorySearch({ q: debouncedQuery });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <Card className="p-8">
        <div className="mx-auto max-w-xl text-center">
          <ChartNoAxesCombined className="mx-auto h-8 w-8 text-sky-400" />
          <h1 className="mt-4 text-xl font-semibold">Player Analysis</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose a player to explore performance history and build a comparison.
          </p>
          <div className="relative mt-6 text-left">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search player name…"
              className="pl-9"
            />
          </div>
          {debouncedQuery.length >= 2 && (
            <div className="mt-2 max-h-80 overflow-y-auto rounded-md border border-border text-left styled-scrollbar">
              {search.isLoading ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Searching…</div>
              ) : (search.data?.players ?? []).length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No players found.</div>
              ) : (
                (search.data?.players ?? []).slice(0, 15).map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => onSelect(player.realm_name, player.id)}
                    className="flex w-full items-center justify-between border-b border-border/60 px-3 py-2.5 text-left last:border-0 hover:bg-accent/50"
                  >
                    <span>
                      <span className="font-medium" style={{ color: getClassColorVar(player.class) }}>{player.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{player.class}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{player.realm_name}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </Card>
    </main>
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
  const primaryPlayer = players[0];
  const armoryPath = `/armory/${encodeURIComponent(primaryPlayer.realm_name)}/${encodeURIComponent(primaryPlayer.id)}`;

  return (
    <div className="mx-auto w-full max-w-[92rem] px-4 py-8">
      <div className="mb-6 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border pb-3">
        <Button variant="ghost" size="sm" className="justify-self-start" asChild>
          <Link to={armoryPath}>
            <ArrowLeft className="h-4 w-4" />
            Back to Armory
          </Link>
        </Button>
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-foreground">
          <ChartNoAxesCombined className="h-4 w-4 text-sky-400" />
          Player Analysis
        </div>
        <div aria-hidden="true" />
      </div>

      <IdentityHeader player={primaryPlayer} />

      <main className="mt-8">
        <PerformanceExplorer players={players} state={state} onStateChange={onStateChange} />
      </main>
    </div>
  );
}
