import { useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSnapshotsList, useSnapshotCohort } from "@/api/rankingsQueries";
import { parseColor, parseBgColor } from "@/pages/Instance/parseColors";
import type { CohortBucket } from "@/api/typesGenerated";

function formatDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CohortViewerPage() {
  const { data: snapshots, isLoading: snapshotsLoading } = useSnapshotsList();

  // All selections live in the URL so a cohort view can be linked/shared,
  // e.g. /parsing/cohorts?snapshot=...&encounter=Ragnaros&class=WARRIOR&metric=hps
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSnapshotId = searchParams.get("snapshot") ?? "";
  const encounterName = searchParams.get("encounter") ?? "";
  const playerClass = searchParams.get("class") ?? "";
  const playerSpec = searchParams.get("spec") ?? "";
  const difficulty = searchParams.get("difficulty") ?? "";
  const maxPlayersRaw = Number(searchParams.get("max_players") ?? "");
  const maxPlayers = Number.isFinite(maxPlayersRaw) && maxPlayersRaw > 0 ? maxPlayersRaw : undefined;
  const metric: "dps" | "hps" = searchParams.get("metric") === "hps" ? "hps" : "dps";

  // Apply several param changes at once (dropdowns cascade: picking a
  // snapshot resets encounter/class/spec, etc.). Empty values delete the
  // param to keep URLs short. replace avoids history spam while clicking
  // through dropdowns.
  const updateParams = useCallback(
    (changes: Record<string, string>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPlayerSpec = (v: string) => updateParams({ spec: v });
  const setDifficulty = (v: string) => updateParams({ difficulty: v });
  const setMaxPlayers = (v: number | undefined) => updateParams({ max_players: v ? String(v) : "" });
  const setMetric = (v: "dps" | "hps") => updateParams({ metric: v === "dps" ? "" : v });

  const { data: cohort, isLoading: cohortLoading } = useSnapshotCohort({
    snapshotId: selectedSnapshotId,
    encounter_name: encounterName || undefined,
    class: playerClass || undefined,
    spec: playerSpec || undefined,
    difficulty: difficulty,
    max_players: maxPlayers,
    metric,
  });

  // Derive filter options from buckets.
  const buckets = useMemo(() => cohort?.buckets ?? [], [cohort?.buckets]);

  const encounters = useMemo(
    () => [...new Set(buckets.map((b: CohortBucket) => b.encounter_name))].sort(),
    [buckets],
  );

  const classes = useMemo(() => {
    const filtered = encounterName
      ? buckets.filter((b: CohortBucket) => b.encounter_name === encounterName)
      : buckets;
    return [...new Set(filtered.map((b: CohortBucket) => b.player_class))].sort();
  }, [buckets, encounterName]);

  const specs = useMemo(() => {
    const filtered = buckets.filter(
      (b: CohortBucket) =>
        (!encounterName || b.encounter_name === encounterName) &&
        (!playerClass || b.player_class === playerClass),
    );
    return [...new Set(filtered.map((b: CohortBucket) => b.player_spec).filter(Boolean))].sort();
  }, [buckets, encounterName, playerClass]);

  const difficulties = useMemo(() => {
    return [...new Set(buckets.map((b: CohortBucket) => b.difficulty_name))].sort();
  }, [buckets]);

  const maxPlayerOptions = useMemo(() => {
    return [...new Set(buckets.map((b: CohortBucket) => b.max_players))].sort((a, b) => a - b);
  }, [buckets]);

  // When snapshot changes and we have buckets from a previous query, auto-select first encounter.
  // Use the buckets-driven approach: once the user picks a snapshot, the first cohort request
  // will return buckets and we drive the dropdowns from there.

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-6">
        <Link to="/parsing" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to How Parses Work
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-2">Cohort Viewer</h1>
      <p className="text-muted-foreground mb-8">
        Browse the raw data behind parse scores. Select a snapshot and filters to see the cohort
        values and computed scores.
      </p>

      {/* Snapshot selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-1">Snapshot</label>
          {snapshotsLoading ? (
            <div className="text-muted-foreground text-sm">Loading snapshots…</div>
          ) : !snapshots?.length ? (
            <div className="text-muted-foreground text-sm">No published snapshots available.</div>
          ) : (
            <select
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              value={selectedSnapshotId}
              onChange={(e) =>
                updateParams({ snapshot: e.target.value, encounter: "", class: "", spec: "" })
              }
            >
              <option value="">Select a snapshot…</option>
              {snapshots.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatDate(s.cutoff)} — {s.lookback_days === 0 ? "all-time" : `${s.lookback_days}d`}{" "}
                  ({s.cohort_mode}) · {s.member_count.toLocaleString()} members
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Encounter</label>
          <select
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            value={encounterName}
            onChange={(e) => updateParams({ encounter: e.target.value, class: "", spec: "" })}
            disabled={!selectedSnapshotId}
          >
            <option value="">{encounters.length ? "Select encounter…" : "Load a snapshot first"}</option>
            {encounters.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Class</label>
          <select
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            value={playerClass}
            onChange={(e) => updateParams({ class: e.target.value, spec: "" })}
            disabled={!encounterName}
          >
            <option value="">{classes.length ? "Select class…" : "Select encounter first"}</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Spec (optional)</label>
          <select
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            value={playerSpec}
            onChange={(e) => setPlayerSpec(e.target.value)}
            disabled={!playerClass}
          >
            <option value="">All specs</option>
            {specs.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {difficulties.length > 1 && (
          <div>
            <label className="block text-sm font-medium mb-1">Difficulty</label>
            <select
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              {difficulties.map((d) => (
                <option key={d} value={d}>
                  {d || "(default)"}
                </option>
              ))}
            </select>
          </div>
        )}

        {maxPlayerOptions.length > 1 && (
          <div>
            <label className="block text-sm font-medium mb-1">Max Players</label>
            <select
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              value={maxPlayers ?? ""}
              onChange={(e) =>
                setMaxPlayers(e.target.value ? Number(e.target.value) : undefined)
              }
            >
              {maxPlayerOptions.map((mp) => (
                <option key={mp} value={mp}>
                  {mp || "(default)"}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Metric</label>
          <div className="flex gap-2">
            <button
              className={`flex-1 rounded border px-3 py-2 text-sm ${
                metric === "dps"
                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                  : "border-border bg-background text-muted-foreground"
              }`}
              onClick={() => setMetric("dps")}
            >
              DPS
            </button>
            <button
              className={`flex-1 rounded border px-3 py-2 text-sm ${
                metric === "hps"
                  ? "border-green-500 bg-green-500/10 text-green-400"
                  : "border-border bg-background text-muted-foreground"
              }`}
              onClick={() => setMetric("hps")}
            >
              HPS
            </button>
          </div>
        </div>
      </div>

      {/* Content area */}
      {!selectedSnapshotId && (
        <div className="text-center py-16 text-muted-foreground">
          Select a snapshot to begin browsing cohort data.
        </div>
      )}

      {selectedSnapshotId && !encounterName && !cohortLoading && (
        <div className="text-center py-16 text-muted-foreground">
          Select an encounter to begin, then choose a class to view the cohort.
        </div>
      )}

      {cohortLoading && (
        <div className="text-center py-16 text-muted-foreground">Loading cohort data…</div>
      )}

      {cohort && !cohortLoading && (
        <>
          {/* Summary line */}
          <div className="mb-4 p-4 bg-muted/30 rounded-lg flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              <strong>{cohort.total_kills}</strong> kills in cohort
            </span>
            {cohort.total_kills > 0 && (
              <>
                <span>
                  Min: <strong>{cohort.min_value.toFixed(1)}</strong>
                </span>
                <span>
                  Median: <strong>{cohort.median_value.toFixed(1)}</strong>
                </span>
                <span>
                  Max: <strong>{cohort.max_value.toFixed(1)}</strong>
                </span>
              </>
            )}
          </div>

          {cohort.entries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No data for this bucket. Try different filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-3 py-2 w-12">#</th>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2 text-right">
                      {metric.toUpperCase()}
                    </th>
                    <th className="px-3 py-2 text-center w-24">Parse</th>
                    <th className="px-3 py-2">Killed</th>
                    <th className="px-3 py-2 w-12">Log</th>
                  </tr>
                </thead>
                <tbody>
                  {cohort.entries.map((entry) => (
                    <tr
                      key={`${entry.player_guid}-${entry.killed_at}`}
                      className="border-b border-border/50 hover:bg-muted/20"
                    >
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">
                        {entry.rank}
                      </td>
                      <td className="px-3 py-2">{entry.player_name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {entry.metric_value.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-semibold tabular-nums ${parseColor(entry.display_score)} ${parseBgColor(entry.display_score)}`}
                        >
                          {entry.display_score}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDate(entry.killed_at)}
                      </td>
                      <td className="px-3 py-2">
                        {entry.log_hashed_slug && (
                          <Link
                            to={`/instances/${entry.log_hashed_slug}`}
                            className="text-blue-400 hover:text-blue-300"
                            title="View log"
                          >
                            →
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
