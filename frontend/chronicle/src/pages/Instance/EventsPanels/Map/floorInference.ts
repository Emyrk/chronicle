/** Geometry is supplied by the dataset's versioned support artifact, not log offsets.
 * Callers supply party members only, and partition by dataset/map/coordinate space.
 * The separate result never turns an inferred floor into raw telemetry. */
export interface FloorObservation {
  timestampMs: number;
  unit: string;
  candidates: readonly number[];
  floor?: number;
  /** Cached encounter-start snapshots are not fresh position measurements. */
  synthetic?: boolean;
}

export interface FloorEstimate {
  timestampMs: number;
  floor: number | null;
  source: "telemetry" | "geometry" | "continuity" | "lookahead" | "unknown";
}

export interface FloorInferenceOptions {
  /** Maximum age of another party member's vote. */
  evidenceWindowMs: number;
  /** Maximum time since an unambiguous anchor, not since the last ambiguous vote. */
  continuityMs: number;
  /** Offline replay only. Zero/absent preserves causal live behavior. */
  lookaheadMs?: number;
}

function majority(votes: readonly number[], total: number): number | null {
  const counts = new Map<number, number>();
  for (const floor of votes) counts.set(floor, (counts.get(floor) ?? 0) + 1);
  for (const [floor, count] of counts) if (count > total / 2) return floor;
  return null;
}

/** Causal, deterministic party inference. Recompute from observations after streaming
 * changes; never use the last rendered frame as evidence (seeking would change results). */
export function inferFloorTrack(observations: readonly FloorObservation[], options: FloorInferenceOptions): FloorEstimate[] {
  if (!Number.isFinite(options.evidenceWindowMs) || options.evidenceWindowMs < 0
    || !Number.isFinite(options.continuityMs) || options.continuityMs < 0) throw new Error("Invalid floor inference windows");
  const rows = observations.filter(row => Number.isFinite(row.timestampMs)).slice().sort((a, b) => a.timestampMs - b.timestampMs);
  const latest = new Map<string, FloorObservation>();
  const track: FloorEstimate[] = [];
  const compatible: (number[] | null)[] = [];
  let anchor: { floor: number; timestampMs: number } | null = null;
  for (let i = 0; i < rows.length;) {
    const timestampMs = rows[i].timestampMs;
    const batch = new Map<string, FloorObservation>();
    while (i < rows.length && rows[i].timestampMs === timestampMs) {
      const row = rows[i++];
      if (row.synthetic) continue;
      const previous = batch.get(row.unit);
      // Conflicting same-time duplicate observations cannot create certainty.
      batch.set(row.unit, previous ? {
        ...row,
        candidates: [...new Set([...previous.candidates, ...row.candidates])],
        floor: previous.floor === row.floor ? row.floor : undefined,
      } : row);
    }
    for (const [unit, row] of batch) latest.set(unit, row);
    for (const [unit, row] of latest) if (timestampMs - row.timestampMs > options.evidenceWindowMs) latest.delete(unit);
    const evidence = [...latest.values()];
    const explicit = evidence.flatMap(row => Number.isInteger(row.floor) ? [row.floor!] : []);
    let floor = majority(explicit, explicit.length);
    let source: FloorEstimate["source"] = floor === null ? "unknown" : "telemetry";
    if (!explicit.length) {
      const singletonVotes = evidence.flatMap(row => row.candidates.length === 1 ? [row.candidates[0]] : []);
      floor = majority(singletonVotes, singletonVotes.length);
      // Ambiguous party members corroborate an anchor only when every observed
      // member could occupy it; contrary singleton/unsupported evidence abstains.
      if (floor !== null && !evidence.every(row => row.candidates.includes(floor!))) floor = null;
      if (floor !== null) source = "geometry";
      else if (anchor && timestampMs - anchor.timestampMs <= options.continuityMs
        && evidence.filter(row => row.candidates.includes(anchor!.floor)).length > evidence.length / 2) {
        floor = anchor.floor;
        source = "continuity";
      }
    }
    if (floor !== null && source !== "continuity") anchor = { floor, timestampMs };
    // Contradictory telemetry invalidates an old geometric anchor too.
    if (explicit.length && floor === null) anchor = null;
    compatible.push(explicit.length ? [] : evidence.length
      ? [...new Set(evidence[0].candidates)].filter(candidate => evidence.every(row => row.candidates.includes(candidate)))
      : null);
    track.push({ timestampMs, floor, source });
  }
  const lookaheadMs = options.lookaheadMs ?? 0;
  if (!Number.isFinite(lookaheadMs) || lookaheadMs < 0) throw new Error("Invalid floor lookahead");
  // Only resolve unknowns. Never overwrite fresh geometry or explicit telemetry,
  // and never carry future evidence across an observation gap larger than the window.
  let next: FloorEstimate | null = null;
  for (let i = track.length - 1; i >= 0; i--) {
    const current = track[i];
    if (i + 1 < track.length && track[i + 1].timestampMs - current.timestampMs > options.evidenceWindowMs) next = null;
    if (current.source === "telemetry" || current.source === "geometry") next = current;
    else if (current.source === "unknown" && next && next.timestampMs - current.timestampMs <= lookaheadMs) {
      if (compatible[i] === null || compatible[i]!.includes(next.floor!)) {
        track[i] = { timestampMs: current.timestampMs, floor: next.floor, source: "lookahead" };
      }
    }
  }
  return track;
}

/** Returns null before the first sample or across an unsupported gap. */
export function inferredFloorAt(track: readonly FloorEstimate[], timestampMs: number, maxAgeMs: number): FloorEstimate | null {
  if (!Number.isFinite(timestampMs) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) return null;
  let lo = 0;
  let hi = track.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (track[mid].timestampMs <= timestampMs) lo = mid + 1;
    else hi = mid;
  }
  const estimate = track[lo - 1];
  return estimate && timestampMs - estimate.timestampMs <= maxAgeMs ? estimate : null;
}
