import type {
  LeaderboardConfiguration,
  LeaderboardV2Cohort,
  LeaderboardV2Entry,
  LeaderboardV2Response,
} from "@/api/typesGenerated";
import type {
  RatingEntry,
  RatingMetric,
  RatingScope,
} from "../Ratings/ratingBoards.fixtures";
import type { RatingLivePage } from "../Ratings/ratingLiveData";
import { hubJSON } from "./resolvedHubAdapter";

export interface V2RatingContext {
  configuration: LeaderboardConfiguration;
  cohorts: readonly LeaderboardV2Cohort[];
  instance: string;
  difficulty: string;
  size: number;
  subject: "player" | "guild";
  performance: "dps" | "hps";
  selected: readonly string[];
  realmIDs?: readonly string[];
}
export function v2RatingParams(
  context: V2RatingContext,
  scope: RatingScope,
  metric: RatingMetric,
  search = "",
) {
  const p = new URLSearchParams({
    instance: context.instance,
    difficulty: context.difficulty,
    max_players: String(context.size),
    subject: context.subject,
    kind: metric === "renown" ? "renown" : "boss",
    score: metric,
  });
  if ((context.realmIDs?.length ?? 0) > 1)
    throw new Error("Choose one realm or All realms.");
  if (context.realmIDs?.[0]) p.set("realm", context.realmIDs[0]);
  if (search.trim()) p.set("search", search.trim());
  if (metric === "renown") return p; // Current instance/variant awards, never set or cohort filtered.
  const rows = context.configuration.rows.filter(
    (row) => row.instance_name === context.instance,
  );
  const selected = scope.boss ? [scope.boss] : context.selected;
  if (selected.length === 1) p.set("boss", selected[0]);
  else if (selected.length > 1) {
    for (const name of [...new Set(selected)].sort()) p.append("bosses", name);
  } else {
    const set = rows.find(
      (row) => row.kind === "set" && row.set_key === "default",
    );
    if (!set) throw new Error("No default encounter set is configured.");
    p.set("set", set.set_key);
  }
  if (context.subject === "player") {
    const choices = context.cohorts.filter(
      (c) =>
        c.metric === context.performance &&
        (!scope.cls || scope.cls === c.player_class) &&
        (!scope.spec || scope.spec === c.player_spec) &&
        (scope.subSpec === undefined || scope.subSpec === c.player_sub_spec),
    );
    if (choices.length !== 1)
      throw new Error(
        choices.length
          ? "Choose a class, spec and subspec to select one exact performance cohort."
          : "No performance summaries for this cohort.",
      );
    const c = choices[0];
    p.set("class", c.player_class);
    p.set("spec", c.player_spec);
    p.set("sub_spec", c.player_sub_spec);
    p.set("metric", c.metric);
  }
  return p;
}
export function v2PlayerEntry(
  row: LeaderboardV2Entry,
  params: URLSearchParams,
  metric: RatingMetric,
): RatingEntry {
  return {
    id: `${row.realm_id}:${row.subject_id}`,
    name: row.name,
    realm: row.realm_id,
    guid: row.subject_id,
    cls: params.get("class") ?? "",
    spec: params.get("spec") ?? "",
    subSpec: params.get("sub_spec") ?? "",
    score:
      metric === "peak"
        ? row.peak
        : metric === "mastery"
          ? row.mastery
          : row.renown,
    detail: row.realm_id,
  };
}
export function v2BoardURL(params: URLSearchParams) {
  return `/api/v1/leaderboards-v2?${params}`;
}

/** Translate existing Previous/Next page controls into request-bound cursor history.
 * Never invent a total or global rank, replay all observations, or request offsets.
 */
export function createV2Pager(context: V2RatingContext) {
  const cursors = new Map<string, Map<number, string>>();
  return async ({
    scope,
    metric,
    query,
    page,
  }: {
    scope: RatingScope;
    metric: RatingMetric;
    query: string;
    page: number;
  }): Promise<RatingLivePage> => {
    const params = v2RatingParams(context, scope, metric, query);
    const key = params.toString();
    let history = cursors.get(key);
    if (!history) {
      history = new Map([[0, ""]]);
      cursors.set(key, history);
    }
    const cursor = history.get(page);
    if (cursor === undefined)
      throw new Error("Restart from the first page for this selection.");
    if (cursor) params.set("cursor", cursor);
    const response = await hubJSON<LeaderboardV2Response>(v2BoardURL(params));
    if (response.next_cursor) history.set(page + 1, response.next_cursor);
    else history.delete(page + 1);
    return {
      page,
      hasPreviousPage: page > 0,
      hasNextPage: !!response.next_cursor,
      rows: response.entries.map((row) => ({
        rank: 0,
        entry: v2PlayerEntry(row, params, metric),
        scores:
          metric === "renown"
            ? { renown: v2PlayerEntry(row, params, "renown") }
            : {
                peak: v2PlayerEntry(row, params, "peak"),
                mastery: v2PlayerEntry(row, params, "mastery"),
              },
      })),
    };
  };
}
