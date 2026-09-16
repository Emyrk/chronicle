import type { UnitAuraSegment } from "./unitAuras.processor";

export interface AuraSourceSummary {
  guid: string | null;
  name: string | null;
  uptimeMs: number;
  windows: number;
}

export function mergeAdjacentAuraSegments<T extends UnitAuraSegment>(
  segments: readonly T[],
): T[] {
  const merged: T[] = [];

  for (const segment of segments) {
    const previous = merged.at(-1);
    if (
      previous
      && previous.encounterId === segment.encounterId
      && previous.sourceGuid === segment.sourceGuid
      && previous.endMs >= segment.startMs
    ) {
      merged[merged.length - 1] = {
        ...previous,
        endMs: Math.max(previous.endMs, segment.endMs),
      };
      continue;
    }
    merged.push({ ...segment });
  }

  return merged;
}

export function summarizeAuraSources(
  segments: readonly UnitAuraSegment[],
): AuraSourceSummary[] {
  const summaries = new Map<string, AuraSourceSummary>();

  for (const segment of segments) {
    const key = segment.sourceGuid ?? "unknown";
    const summary = summaries.get(key) ?? {
      guid: segment.sourceGuid,
      name: segment.sourceName,
      uptimeMs: 0,
      windows: 0,
    };
    summary.uptimeMs += Math.max(0, segment.endMs - segment.startMs);
    summary.windows++;
    summaries.set(key, summary);
  }

  return [...summaries.values()].sort((a, b) => b.uptimeMs - a.uptimeMs);
}
