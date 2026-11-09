import type {
  HubSummary,
  LeaderboardConfiguration,
  LeaderboardV2Cohort,
  HubRatingBoard,
  LeaderboardV2Response,
  RankingsInstanceSummary,
  RankingsLeaderboardResponse,
  SpeedrunLeaderboardEntry,
} from "@/api/typesGenerated";
import { v2RatingParams, v2BoardURL } from "./v2RatingAdapter";
import type { HubSummaryRequest } from "./hubSummaryAdapter";

export type ResolvedHubSummary = HubSummary & {
  configuration?: LeaderboardConfiguration;
  cohorts?: readonly LeaderboardV2Cohort[];
};

const HUB_REQUEST_TIMEOUT_MS = 15_000;

export async function hubJSON<T>(
  url: string,
  signal?: AbortSignal,
  timeoutMs = HUB_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = globalThis.setTimeout(
    () => controller.abort(new DOMException("Leaderboard request timed out", "TimeoutError")),
    timeoutMs,
  );
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(
        body?.message || `Leaderboard request failed (${response.status})`,
      );
    }
    return response.json();
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

/** Adapt resolved policy into the existing Hub's metadata contract, not a new UI. */
export function resolvedHubMetadata(
  config: LeaderboardConfiguration,
  request: HubSummaryRequest,
  realms: readonly { id: string; name: string }[],
  cohorts: readonly LeaderboardV2Cohort[],
  publishedInstances?: readonly RankingsInstanceSummary[],
): ResolvedHubSummary {
  if (config.conflict) throw new Error(config.conflict);
  if (!config.tenant_id)
    throw new Error("Visit a specific server to see ratings");
  const publishedByName = new Map<string, readonly RankingsInstanceSummary[]>();
  for (const instance of publishedInstances ?? []) {
    publishedByName.set(instance.instance_name, [
      ...(publishedByName.get(instance.instance_name) ?? []),
      instance,
    ]);
  }
  const instances = config.rows
    .filter((row) => row.kind === "instance")
    .flatMap((row) => {
      const variants = config.rows.filter(
        (v) => v.kind === "variant" && v.instance_name === row.instance_name,
      );
      const published = publishedByName.get(row.instance_name) ?? [];
      return (
        variants.length ? variants : [{ difficulty_name: "", max_players: 0 }]
      ).map((v) => {
        const matchingPublished = variants.length
          ? published.filter(
              (instance) =>
                instance.difficulty_name === v.difficulty_name &&
                instance.max_players === v.max_players,
            )
          : published;
        return {
          instance_name: row.instance_name,
          difficulty_name: v.difficulty_name,
          max_players: v.max_players,
          category: matchingPublished[0]?.category || "raid",
          total_kills: matchingPublished.reduce(
            (total, instance) => total + instance.total_kills,
            0,
          ),
          top_players: [],
        };
      });
    });
  const choices = instances.filter(
    (row) => row.instance_name === request.instanceName,
  );
  const selected =
    choices.find(
      (row) =>
        row.difficulty_name === request.cohort?.difficulty &&
        row.max_players === request.cohort?.maxPlayers,
    ) ?? choices[0];
  const rows = config.rows.filter(
    (row) => row.instance_name === request.instanceName,
  );
  const filters = [
    ...new Set(
      cohorts
        .filter((c) => c.metric === request.performance)
        .map((c) => c.player_class),
    ),
  ].map((player_class) => ({
    player_class,
    specs: [
      ...new Set(
        cohorts
          .filter(
            (c) =>
              c.player_class === player_class &&
              c.metric === request.performance,
          )
          .map((c) => c.player_spec),
      ),
    ].map((spec) => ({
      spec,
      sub_specs: cohorts
        .filter(
          (c) =>
            c.player_class === player_class &&
            c.player_spec === spec &&
            c.metric === request.performance,
        )
        .map((c) => c.player_sub_spec),
    })),
  }));
  return {
    configuration: config,
    cohorts,
    instances,
    realms,
    filters,
    selected_cohort: selected
      ? {
          difficulty_name: selected.difficulty_name,
          max_players: selected.max_players,
        }
      : null,
    landing_previews: [],
    generation_id: null,
    encounters: rows
      .filter((row) => row.kind === "boss")
      .map((row) => ({
        encounter_name: row.encounter_name,
        total_kills: 0,
        top_dps: 0,
      })),
    progression_bosses: rows
      .filter((row) => row.kind === "member" && row.set_key === "default")
      .map((row) => row.encounter_name),
    ranking_encounter_sets: rows
      .filter((row) => row.kind === "set")
      .sort(
        (a, b) =>
          Number(b.set_key === "default") - Number(a.set_key === "default"),
      )
      .map((row) => ({
        id: row.set_key,
        label: row.set_name,
        encounters: rows
          .filter((m) => m.kind === "member" && m.set_key === row.set_key)
          .sort((a, b) => a.position - b.position)
          .map((m) => m.encounter_name),
      })),
    ratings: {
      raid: {
        player: { peak: [], ranked_mastery: [], renown: [] },
        guild: { peak: [], ranked_mastery: [], renown: [] },
      },
      bosses: [],
    },
    performances: [],
    speedruns: [],
  };
}

function overviewBoardURLs(
  request: HubSummaryRequest,
  summary: ResolvedHubSummary,
): { performances: string; speedruns: string } {
  const cohort = summary.selected_cohort!;
  const selectedEncounters = request.encounters?.length
    ? request.encounters
    : summary.progression_bosses.length
      ? summary.progression_bosses
      : summary.encounters.map((row) => row.encounter_name);
  const performance = new URLSearchParams({
    instance_names: request.instanceName!,
    encounter_names: selectedEncounters.filter((name) => name !== "Trash").join(","),
    difficulty_names: cohort.difficulty_name,
    exact_cohort: "true",
    metric: request.performance,
    limit: "5",
  });
  performance.set("max_players", String(cohort.max_players));
  if (request.cls) performance.set("class", request.cls);
  if (request.spec) performance.set("spec", request.spec);
  if (request.subSpec) performance.set("sub_spec", request.subSpec);
  const realmNames = summary.realms
    .filter((realm) => request.realmIDs?.includes(realm.id))
    .map((realm) => realm.name);
  if (realmNames.length) performance.set("realm_names", realmNames.join(","));

  const speedrun = new URLSearchParams({
    instance_name: request.instanceName!,
    difficulty_name: cohort.difficulty_name,
    instance_max_players: String(cohort.max_players),
    timing: "full",
  });
  realmNames.forEach((realm) => speedrun.append("realm_name", realm));
  return {
    performances: `/api/v1/rankings/leaderboard?${performance}`,
    speedruns: `/api/v1/rankings/speedrun?${speedrun}`,
  };
}

export type ResolvedHubRaidRatings = {
  player: {
    peak: HubRatingBoard["player"]["peak"];
    ranked_mastery: HubRatingBoard["player"]["peak"];
    renown: HubRatingBoard["player"]["peak"];
  };
  guild: {
    peak: HubRatingBoard["guild"]["peak"];
    ranked_mastery: HubRatingBoard["guild"]["peak"];
    renown: HubRatingBoard["guild"]["peak"];
  };
};

export async function fetchResolvedHubRatings(
  request: HubSummaryRequest,
  summary: ResolvedHubSummary,
): Promise<ResolvedHubRaidRatings> {
  const board: ResolvedHubRaidRatings = {
    player: { peak: [], ranked_mastery: [], renown: [] },
    guild: { peak: [], ranked_mastery: [], renown: [] },
  };
  const config = summary.configuration;
  const cohort = summary.selected_cohort;
  if (!config || !cohort || !request.instanceName) return board;
  const cohorts = summary.cohorts ?? [];

  await Promise.all(
    (["player", "guild"] as const).flatMap((subject) =>
      (["peak", "mastery", "renown"] as const).map(async (metric) => {
        let params: URLSearchParams;
        try {
          params = v2RatingParams(
            {
              configuration: config,
              cohorts,
              instance: request.instanceName!,
              difficulty: cohort.difficulty_name,
              size: cohort.max_players,
              subject,
              performance: request.performance,
              selected: request.encounters ?? [],
              realmIDs: request.realmIDs,
            },
            { cls: request.cls, spec: request.spec, subSpec: request.subSpec },
            metric,
          );
        } catch {
          return;
        }
        params.set("limit", "5");
        const response = await hubJSON<LeaderboardV2Response>(
          v2BoardURL(params),
        );
        const key = metric === "mastery" ? "ranked_mastery" : metric;
        if (subject === "player") {
          board.player[key] = response.entries.map((row) => ({
            realm_id: row.realm_id,
            realm_name:
              summary.realms.find((realm) => realm.id === row.realm_id)?.name ??
              row.realm_id,
            player_guid: row.subject_id,
            player_name: row.name,
            player_class: row.player_class,
            player_spec: row.player_spec,
            player_sub_spec: row.player_sub_spec,
            score: row.score,
          }));
        } else {
          board.guild[key] = response.entries.map((row) => ({
            realm_id: row.realm_id,
            realm_name:
              summary.realms.find((realm) => realm.id === row.realm_id)?.name ??
              row.realm_id,
            guild_id: row.subject_id,
            guild_name: row.name,
            score: row.score,
          }));
        }
      }),
    ),
  );
  return board;
}

export async function fetchResolvedHubSummary(
  request: HubSummaryRequest,
): Promise<ResolvedHubSummary> {
  const [config, realms, publishedInstances] = await Promise.all([
    hubJSON<LeaderboardConfiguration>("/api/v1/leaderboard-configuration"),
    hubJSON<{ id: string; name: string }[]>("/api/v1/realms"),
    hubJSON<RankingsInstanceSummary[]>("/api/v1/rankings/instances"),
  ]);
  const metadata = resolvedHubMetadata(
    config,
    request,
    realms,
    [],
    publishedInstances,
  );
  if (!request.instanceName || !metadata.selected_cohort) return metadata;
  const p = new URLSearchParams({
    view: "cohorts",
    instance: request.instanceName,
    difficulty: metadata.selected_cohort.difficulty_name,
    max_players: String(metadata.selected_cohort.max_players),
  });
  const cohorts = await hubJSON<LeaderboardV2Cohort[]>(
    `/api/v1/leaderboards-v2?${p}`,
  );
  const result = resolvedHubMetadata(
    config,
    request,
    realms,
    cohorts,
    publishedInstances,
  );
  if (request.metadataOnly) return result;
  const urls = overviewBoardURLs(request, result);
  const [ratings, performance, speedruns] = await Promise.all([
    fetchResolvedHubRatings(request, result),
    hubJSON<RankingsLeaderboardResponse>(urls.performances),
    hubJSON<SpeedrunLeaderboardEntry[]>(urls.speedruns),
  ]);
  return {
    ...result,
    ratings: { raid: ratings, bosses: [] },
    performances: performance.entries,
    speedruns: speedruns.slice(0, 5),
  };
}
