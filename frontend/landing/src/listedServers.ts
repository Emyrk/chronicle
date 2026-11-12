import { FEATURED_SERVER } from "./data/servers.ts";
import type { ServerEntry } from "./types.ts";

function normalizeURL(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Every server rendered on the home page: the featured hero card, then the
 * grid (which skips the featured server), de-duplicated by Chronicle URL.
 */
export function listedServers(servers: Pick<ServerEntry, "name" | "chronicleUrl">[]): { name: string; url: string }[] {
  const seen = new Set<string>();
  const listed: { name: string; url: string }[] = [];
  for (const server of [FEATURED_SERVER, ...servers]) {
    const url = normalizeURL(server.chronicleUrl);
    if (seen.has(url)) continue;
    seen.add(url);
    listed.push({ name: server.name, url });
  }
  return listed;
}
