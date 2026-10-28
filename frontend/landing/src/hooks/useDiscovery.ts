import { useEffect, useState } from "react";
import type {
  Client,
  DiscoveryBranding,
  DiscoveryEntry,
  Engine,
  Expansion,
  Logging,
  ServerEntry,
  StatusTag,
} from "../types";

const CACHE_KEY_PREFIX = "chronicle_discovery_v2_";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CHRONICLE_HOSTED_DISCOVERY_URL = "https://legacy.chronicleclassic.com";

interface SourcedDiscoveryEntry extends DiscoveryEntry {
  discoverySource: string;
}

/** Cache key includes a hash of the URL list so changing URLs invalidates the cache. */
function cacheKey(urls: string[]): string {
  const source = import.meta.env.DEV ? "dev-proxy:" : "production:";
  return CACHE_KEY_PREFIX + source + urls.join(",");
}

// --- Tag → attribute mapping ---

const TAG_TO_EXPANSION: Record<string, Expansion> = {
  Vanilla: "vanilla",
  TBC: "tbc",
  Wrath: "wotlk",
};

const TAG_TO_CLIENT: Record<string, Client> = {
  "1.12": "1.12.1",
  "2.4.3": "2.4.3",
  "2.5.3": "2.5.3",
  "3.3.5a": "3.3.5a",
};

const TAG_TO_LOGGING: Record<string, Logging> = {
  "Client Side": "client",
  "Server Side": "server",
};

const TAG_TO_ENGINE: Record<string, Engine> = {
  "Azeroth Core": "azerothcore",
};

const TAG_TO_STATUS: Record<string, StatusTag> = {
  "Custom Content": "custom-content",
  Progression: "progression",
};

function parseTags(tags: string[]): {
  expansion: Expansion;
  client: Client;
  logging: Logging;
  engine: Engine;
  status: StatusTag[];
} {
  let expansion: Expansion = "vanilla";
  let client: Client = "1.12.1";
  let logging: Logging = "client";
  let engine: Engine = "unknown";
  const status: StatusTag[] = [];

  for (const tag of tags) {
    if (TAG_TO_EXPANSION[tag]) expansion = TAG_TO_EXPANSION[tag];
    else if (TAG_TO_CLIENT[tag]) client = TAG_TO_CLIENT[tag];
    else if (TAG_TO_LOGGING[tag]) logging = TAG_TO_LOGGING[tag];
    else if (TAG_TO_ENGINE[tag]) engine = TAG_TO_ENGINE[tag];
    else if (TAG_TO_STATUS[tag]) status.push(TAG_TO_STATUS[tag]);
  }

  return { expansion, client, logging, engine, status };
}

function discoveryToServer(
  entry: SourcedDiscoveryEntry,
  branding: DiscoveryBranding,
): ServerEntry {
  const { expansion, client, logging, engine, status } = parseTags(
    branding.tags ?? [],
  );

  // Derive an id from the entry URL hostname.
  let id = "unknown";
  try {
    id = new URL(entry.url).hostname.split(".")[0];
  } catch {
    // ignore
  }

  return {
    id,
    name: branding.display_name ?? id,
    tagline: branding.tagline ?? "",
    description: branding.description ?? "",
    logo: branding.square_logo ?? "",
    banner: branding.background_banner,
    expansion,
    client,
    logging,
    engine,
    chronicleUrl: entry.url,
    status: status.length > 0 ? status : undefined,
    hostedByChronicle: entry.discoverySource === CHRONICLE_HOSTED_DISCOVERY_URL,
    instances14d: entry.instances_14d,
    uniquePlayers14d: entry.unique_players_14d,
  };
}

interface CacheEntry {
  data: SourcedDiscoveryEntry[];
  ts: number;
}

function readCache(key: string): SourcedDiscoveryEntry[] | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: SourcedDiscoveryEntry[]) {
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({ data, ts: Date.now() } satisfies CacheEntry),
    );
  } catch {
    // quota exceeded — ignore
  }
}

function discoveryEndpoint(url: string): string {
  if (!import.meta.env.DEV) return `${url}/api/v1/discovery`;
  return `/__discovery/${new URL(url).hostname}`;
}

function isHTTPURL(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

async function fetchDiscovery(url: string): Promise<SourcedDiscoveryEntry[]> {
  try {
    const resp = await fetch(discoveryEndpoint(url));
    if (!resp.ok) return [];
    const data = (await resp.json()) as DiscoveryEntry[];
    if (!Array.isArray(data)) return [];
    return data
      .filter((entry) => typeof entry.url === "string" && isHTTPURL(entry.url))
      .map((entry) => ({ ...entry, discoverySource: url }));
  } catch {
    return [];
  }
}

async function fetchDiscoveryEntries(discoveryUrls: string[]): Promise<SourcedDiscoveryEntry[]> {
  const results = await Promise.allSettled(discoveryUrls.map(fetchDiscovery));
  const entries: SourcedDiscoveryEntry[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") entries.push(...result.value);
  }
  return entries;
}

/** Resolve the complete directory for build-time prerendering. */
export async function discoverServers(
  baseline: ServerEntry[],
  discoveryUrls: string[],
): Promise<ServerEntry[]> {
  if (discoveryUrls.length === 0) return baseline;
  return mergeDiscovery(baseline, await fetchDiscoveryEntries(discoveryUrls));
}

/**
 * Uses the static SERVERS list as baseline. Fetches /api/v1/discovery from
 * each discoveryUrls entry and merges the results:
 * - Matching chronicleUrl → enriches the static entry (instances24h, live branding fields)
 * - New URL not in baseline → appended as a new server
 *
 * Returns the static list immediately so the page is never empty.
 */
export function useDiscovery(
  baseline: ServerEntry[],
  discoveryUrls: string[],
  initialServers?: ServerEntry[],
): { servers: ServerEntry[]; loading: boolean } {
  // The production build prerenders prefetched discovery data. Use that exact
  // snapshot for the first client render so hydration matches the static HTML.
  const [servers, setServers] = useState<ServerEntry[]>(
    initialServers ?? (discoveryUrls.length > 0 ? [] : baseline),
  );
  const [loading, setLoading] = useState(
    initialServers === undefined && discoveryUrls.length > 0,
  );

  useEffect(() => {
    if (discoveryUrls.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const key = cacheKey(discoveryUrls);
    const cached = readCache(key);
    if (cached) {
      setServers(mergeDiscovery(baseline, cached));
      setLoading(false);
      return;
    }

    fetchDiscoveryEntries(discoveryUrls).then((entries) => {
      if (cancelled) return;
      writeCache(key, entries);
      // Keep a successfully prerendered directory visible during a transient
      // client-side discovery outage instead of collapsing to the baseline.
      if (entries.length > 0 || initialServers === undefined) {
        setServers(mergeDiscovery(baseline, entries));
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { servers, loading };
}

/**
 * Merge discovery responses into the baseline server list.
 * - Match by chronicleUrl → enrich existing entry with instances24h + any branding overrides
 * - No match → append as new server (if it has display_name)
 */
function mergeDiscovery(
  baseline: ServerEntry[],
  entries: SourcedDiscoveryEntry[],
): ServerEntry[] {
  const entryMap = new Map<string, SourcedDiscoveryEntry>();
  for (const e of entries) {
    if (e.url) entryMap.set(e.url, e);
  }

  // Enrich existing servers.
  const merged = baseline.map((server) => {
    const entry = entryMap.get(server.chronicleUrl);
    if (!entry) return server;
    entryMap.delete(server.chronicleUrl); // consumed
    return enrichServer(server, entry);
  });

  // Append new servers from discovery that aren't in the baseline.
  for (const entry of entryMap.values()) {
    if (!entry.branding?.display_name) continue;
    merged.push(discoveryToServer(entry, entry.branding));
  }

  return merged;
}

/** Enrich an existing static server entry with live discovery data. */
function enrichServer(server: ServerEntry, entry: SourcedDiscoveryEntry): ServerEntry {
  const enriched = {
    ...server,
    hostedByChronicle: entry.discoverySource === CHRONICLE_HOSTED_DISCOVERY_URL,
  };
  const b = entry.branding;
  if (!b) return enriched;
  // Only override fields if discovery provides them — static data is the fallback.
  if (b.display_name) enriched.name = b.display_name;
  if (b.tagline) enriched.tagline = b.tagline;
  if (b.description) enriched.description = b.description;
  if (b.square_logo) enriched.logo = b.square_logo;
  if (b.background_banner) enriched.banner = b.background_banner;
  // Activity metrics from discovery.
  if (entry.instances_14d != null) enriched.instances14d = entry.instances_14d;
  if (entry.unique_players_14d != null) enriched.uniquePlayers14d = entry.unique_players_14d;
  return enriched;
}
