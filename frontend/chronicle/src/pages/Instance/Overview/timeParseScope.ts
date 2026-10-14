import type {
  InstanceTimeParsesResponse,
  TimeParseScopeResult,
} from "@/api/typesGenerated";
import type { PopulationSelection } from "./populationSelectionState";

export type TimeParseScope = "server" | "realm" | "guild";

export type { TimeParseScopeResult } from "@/api/typesGenerated";

/**
 * Allows the server-scope compatibility fallback while older cached responses
 * without the new scopes field age out.
 */
export type ScopedInstanceTimeParsesResponse = Omit<InstanceTimeParsesResponse, "scopes"> & {
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
