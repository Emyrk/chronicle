import type {
  InstanceTimeParsesResponse,
  TimeParseAverage,
  TimeParseScore,
  BossKillTimeParse,
} from "@/api/typesGenerated";
import type { PopulationSelection } from "./populationSelectionState";

export type TimeParseScope = "server" | "realm" | "guild";

/** The persisted parse payload for one comparison scope. */
export interface TimeParseScopeResult {
  readonly available: boolean;
  readonly reason?: string;
  readonly clear_time?: TimeParseScore;
  readonly boss_kill_times: readonly BossKillTimeParse[];
  readonly average_boss_kill_parse?: TimeParseAverage;
}

/**
 * Transitional response shape while the generated SDK gains scoped results.
 * The top-level fields remain the server-scope compatibility payload.
 */
export type ScopedInstanceTimeParsesResponse = InstanceTimeParsesResponse & {
  readonly scopes?: Readonly<Record<string, TimeParseScopeResult>>;
};

export function timeParseScopeForComparison(
  comparison: PopulationSelection | undefined,
): TimeParseScope {
  return comparison?.kind === "cohort" ? comparison.scope : "server";
}

/** Selects persisted parses for the active comparison, with top-level server compatibility. */
export function selectTimeParseScopeResult(
  response: ScopedInstanceTimeParsesResponse | undefined,
  comparison: PopulationSelection | undefined,
): TimeParseScopeResult | undefined {
  if (!response) return undefined;

  const scope = timeParseScopeForComparison(comparison);
  const scoped = response.scopes?.[scope];
  if (scoped) return scoped;

  return scope === "server" ? response : undefined;
}
