/**
 * What the leaderboards are scoped to.
 *
 * - `clear`: whole-raid runs. Time is the full clear (first pull to last kill)
 *   and ratings are the raid's own.
 * - `bosses`: one or more bosses combined. Ratings average (Renown sums) over
 *   the chosen bosses, and time is total kill time, gaps between bosses
 *   excluded. Choosing every boss is still this, not a full clear.
 */
export type EncounterSelection = { kind: "clear" } | { kind: "bosses"; bosses: string[] }

export const FULL_CLEAR: EncounterSelection = { kind: "clear" }
