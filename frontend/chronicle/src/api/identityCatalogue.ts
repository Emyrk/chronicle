import type { IdentityCatalogueResponse } from "./typesGenerated";

export type CatalogueReview = "all" | "unknown" | "conflicts";
export interface CatalogueCursor { after: string; generation: number }
export const CATALOGUE_PAGE_SIZE = 100;

export function identityCatalogueURL(logId: string, review: CatalogueReview, cursor?: CatalogueCursor): string {
  const params = new URLSearchParams({ review, limit: String(CATALOGUE_PAGE_SIZE) });
  if (cursor) {
    params.set("after", cursor.after);
    params.set("generation", String(cursor.generation));
  }
  return `/api/v1/raidlogs/logs/${encodeURIComponent(logId)}/identity-catalogue?${params}`;
}

export function identityCatalogueDownloadURL(logId: string, generation: number): string {
  return `/api/v1/raidlogs/logs/${encodeURIComponent(logId)}/identity-catalogue/download?generation=${generation}`;
}

export async function fetchIdentityCatalogue(logId: string, review: CatalogueReview, cursor?: CatalogueCursor, signal?: AbortSignal): Promise<{ page: IdentityCatalogueResponse; reset: boolean }> {
  const request = (next?: CatalogueCursor) => fetch(identityCatalogueURL(logId, review, next), { credentials: "same-origin", signal });
  let response = await request(cursor);
  const reset = response.status === 409 && !!cursor;
  // A successful reparse replaced this generation. Never mix old and new pages.
  if (reset) response = await request();
  if (!response.ok) throw new Error(`Unable to load identity catalogue (${response.status}). Try refreshing; administrator access is required.`);
  return { page: await response.json() as IdentityCatalogueResponse, reset };
}
