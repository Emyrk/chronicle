import type { DataGrant } from "@/api/queries";
import { formatBytes, formatSource } from "@/lib/format";

export function isExpiringGrant(grant: DataGrant): boolean {
  return !!grant.expires_at;
}

export function splitGrants(grants: readonly DataGrant[]): { permanent: DataGrant[]; expiring: DataGrant[] } {
  const permanent: DataGrant[] = [];
  const expiring: DataGrant[] = [];
  for (const grant of grants) {
    (isExpiringGrant(grant) ? expiring : permanent).push(grant);
  }
  return { permanent, expiring };
}

export function sumBytes(grants: readonly DataGrant[]): number {
  return grants.reduce((sum, g) => sum + g.storage_bytes, 0);
}

/**
 * Builds the "why do I have this much storage, and what happens when a
 * grant expires" forecast sentence shown in the raw-storage card's grants
 * tooltip. Answers: which part of the limit is permanent, which part can
 * expire, and what the limit/usage picture looks like after the next
 * expiring grant lapses (assuming it isn't renewed).
 */
export function buildForecastSentence(grants: readonly DataGrant[], usedBytes: number): string {
  const { permanent, expiring } = splitGrants(grants);
  const permanentTotal = sumBytes(permanent);

  if (expiring.length === 0) {
    return "None of your storage grants can expire — this total is permanent.";
  }

  const subject =
    expiring.length === 1
      ? `The ${formatSource(expiring[0].source)} is the only grant that can expire`
      : `${expiring.length} of your grants can expire`;

  const comparison =
    permanentTotal >= usedBytes
      ? `currently well above your ${formatBytes(usedBytes)} in use`
      : `below your ${formatBytes(usedBytes)} in use — you'd be over your limit`;

  return `${subject}. If it lapses without renewing, your limit drops to ${formatBytes(permanentTotal)} — ${comparison}.`;
}
