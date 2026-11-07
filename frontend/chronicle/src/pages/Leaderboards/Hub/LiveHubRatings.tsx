import { useMemo, type ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
import type { LeaderboardV2Response } from "@/api/typesGenerated";
import { RatingBoards } from "@/pages/Leaderboards/Ratings/RatingLeaderboard";
import type { RatingLiveData } from "@/pages/Leaderboards/Ratings/ratingLiveData";
import {
  RATING_METRICS,
  type RatingPeriod,
  type RatingScope,
} from "@/pages/Leaderboards/Ratings/ratingBoards.fixtures";
import type { RatingView } from "@/pages/Leaderboards/Ratings/ratingThemes";
import { GuildRatingBoards, type GuildRatingData } from "./GuildRatings";
import type { HubSummary } from "./hubSummaryAdapter";
import { hubJSON } from "./resolvedHubAdapter";
import {
  createV2Pager,
  v2BoardURL,
  v2PlayerEntry,
  v2RatingParams,
  type V2RatingContext,
} from "./v2RatingAdapter";

export interface LiveHubRatingsProps {
  instanceName: string;
  bosses: readonly string[];
  selected: readonly string[];
  scope: RatingScope;
  onScope: (scope: RatingScope) => void;
  view: RatingView;
  onView: (view: RatingView) => void;
  period: RatingPeriod;
  subject: "player" | "guild";
  realmIDs?: readonly string[];
  cohort?: { difficulty: string; maxPlayers: number };
  role: "dps" | "healing";
  where: string;
  toolbar?: ReactNode;
  summary?: HubSummary;
}

/** Existing Hub presentation; only its source and cursor adapter change. */
export function LiveHubRatings(props: LiveHubRatingsProps) {
  const {
    instanceName,
    bosses,
    selected,
    scope,
    onScope,
    view,
    onView,
    subject,
    cohort,
    role,
    where,
    toolbar,
    summary,
  } = props;
  const key = JSON.stringify([
    instanceName,
    selected,
    scope,
    cohort,
    role,
    subject,
    props.realmIDs,
    summary?.configuration,
    summary?.cohorts,
  ]);
  const context = useMemo<V2RatingContext | undefined>(
    () =>
      summary?.configuration && cohort
        ? {
            configuration: summary.configuration,
            cohorts: summary.cohorts ?? [],
            instance: instanceName,
            difficulty: cohort.difficulty,
            size: cohort.maxPlayers,
            subject,
            performance: role === "healing" ? "hps" : "dps",
            selected,
            realmIDs: props.realmIDs,
          }
        : undefined,
    // The key includes the complete immutable request identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const targets = [
    scope,
    ...(view === "overview" && !scope.boss
      ? (selected.length ? selected : bosses).map((boss) => ({
          ...scope,
          boss,
        }))
      : []),
  ];
  const requests = targets.flatMap((target) =>
    RATING_METRICS.map((metric) => {
      try {
        if (!context) throw new Error("No enabled instance variant.");
        const params = v2RatingParams(context, target, metric);
        params.set(
          "limit",
          target.boss && target.boss !== scope.boss ? "3" : "50",
        );
        return { params, error: undefined, metric, target };
      } catch (error) {
        return { params: undefined, error: error as Error, metric, target };
      }
    }),
  );
  const allQueries = useQueries({
    queries: requests.map((request) => ({
      queryKey: [
        "hub-v2-rating",
        request.params?.toString() ??
          `${key}|${request.target.boss}|${request.metric}`,
      ],
      queryFn: async () => {
        if (request.error) throw request.error;
        return {
          params: request.params!,
          response: await hubJSON<LeaderboardV2Response>(
            v2BoardURL(request.params!),
          ),
        };
      },
      enabled: !!context,
      retry: false,
      staleTime: 30_000,
    })),
  });
  const queries = allQueries.slice(0, 3);

  const pager = useMemo(
    () => (context ? createV2Pager(context) : undefined),
    [context],
  );
  const live: RatingLiveData = {
    ranksKnown: false,
    catchupStatus: false,
    pageKey: key,
    loadPage: pager,
    board: ({ scope: target, metric }) => {
      if (!context)
        return { status: "error", error: "No enabled instance variant." };
      const targetIndex = targets.findIndex(
        (item) => item.boss === target.boss,
      );
      const q =
        allQueries[
          Math.max(0, targetIndex) * 3 + RATING_METRICS.indexOf(metric)
        ];
      if (q.isError) return { status: "error", error: q.error.message };
      if (!q.data) return { status: "loading" };
      return {
        status: "ready",
        data: {
          id: target.boss ?? "raid",
          kind: target.boss ? "boss" : "raid",
          scope: target,
          title:
            metric === "renown"
              ? (q.data.params.get("boss") ?? instanceName)
              : (target.boss ?? where),
          subtitle:
            q.data.response.status === "empty_selection"
              ? "Empty encounter set: no eligible bosses."
              : metric === "renown"
                ? q.data.params.has("boss")
                  ? "This boss's completions and current award; independent of class filters."
                  : "Sum of selected bosses in this variant; independent of class filters."
                : `${q.data.response.included_bosses.length} bosses · a missed boss counts as 0`,
          entries: q.data.response.entries.map((row) =>
            v2PlayerEntry(row, q.data.params, metric),
          ),
        },
      };
    },
  };
  if (!context)
    return (
      <p
        role="status"
        className="rounded-xl border bg-card p-8 text-sm text-muted-foreground"
      >
        No enabled instance variant.
      </p>
    );
  const notice = (
    <p className="text-xs text-muted-foreground">
      All-time. Renown sums the selected bosses in this variant, independent of
      class filters. In-place repairs may temporarily mix calculation versions.
    </p>
  );
  if (subject === "guild") {
    const current =
      view === "overview"
        ? queries.find((q) => q.isError)
        : queries[RATING_METRICS.indexOf(view)];
    const ratings = Object.fromEntries(
      RATING_METRICS.map((metric, i) => [
        metric,
        (queries[i].data?.response.entries ?? []).map((row) => ({
          guild: row.name,
          guildId: row.subject_id,
          identity: `${row.realm_id}:${row.subject_id}`,
          score: row.score,
          detail: row.realm_id,
        })),
      ]),
    ) as unknown as GuildRatingData["ratings"];
    const data: GuildRatingData = {
      ratings,
      perBoss: (boss) => {
        const index = targets.findIndex((target) => target.boss === boss);
        if (index < 0) return undefined;
        const map = (offset: number) =>
          (allQueries[index * 3 + offset].data?.response.entries ?? []).map(
            (row) => ({
              guild: row.name,
              guildId: row.subject_id,
              score: row.score,
              detail: row.realm_id,
            }),
          );
        return { peak: map(0), mastery: map(1), renown: map(2) };
      },
      pending: !!context && queries.some((q) => q.isPending),
      error: !context
        ? "No enabled instance variant."
        : current?.isError
          ? current.error.message
          : undefined,
      live,
    };
    return (
      <div className="space-y-3">
        {notice}
        <GuildRatingBoards
          instanceName={instanceName}
          view={view}
          onView={onView}
          bosses={
            scope.boss ? [scope.boss] : selected.length ? selected : undefined
          }
          allBosses={bosses}
          where={where}
          onBoss={(boss) => onScope({ boss })}
          toolbar={toolbar}
          data={data}
        />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {notice}
      {view === "overview" && queries.find((q) => q.isError) && (
        <p role="status" className="text-sm text-muted-foreground">
          {queries.find((q) => q.isError)?.error?.message}
        </p>
      )}
      <RatingBoards
        instanceName={instanceName}
        bosses={scope.boss ? [scope.boss] : selected.length ? selected : bosses}
        scope={scope}
        onScope={onScope}
        view={view}
        onView={onView}
        period="all"
        toolbar={toolbar}
        live={live}
        title={where}
      />
    </div>
  );
}
