import type {
  AnalyticsLeaderboardBreakdown,
  AnalyticsProductFamilyRow,
  AnalyticsServerProductRow,
} from "./types";

export const PRODUCT_FAMILIES = [
  { id: "leaderboards", label: "Leaderboards & rankings" },
  { id: "instance_reports", label: "Instance reports" },
  { id: "armory_search", label: "Armory search" },
  { id: "armory_players", label: "Armory players" },
  { id: "home", label: "Home" },
  { id: "talents", label: "Talent calculator" },
  { id: "recent", label: "Recent activity" },
  { id: "guilds", label: "Guild pages" },
  { id: "logs_collection", label: "My Logs" },
  { id: "log_detail", label: "Log details" },
  { id: "upload", label: "Upload" },
  { id: "instance_collection", label: "Instance collection" },
  { id: "performance", label: "Performance history" },
  { id: "gear", label: "Gear planner" },
  { id: "account", label: "Account & settings" },
  { id: "other", label: "Rest / uncategorized" },
] as const;

export type ProductFamilyID = (typeof PRODUCT_FAMILIES)[number]["id"];

export interface RoutePageViewRow {
  hostname: string;
  path: string;
  pageViews: number;
}

export interface LocationPageViewRow {
  hostname: string;
  location: string;
  pageViews: number;
}

const KNOWN_INSTANCES = new Set([
  "Molten Core",
  "Upper Tower of Karazhan",
  "Blackwing Lair",
  "Temple of Ahn'Qiraj",
  "Naxxramas",
  "Onyxia's Lair",
  "Zul'Gurub",
  "Lower Tower of Karazhan",
  "Ulduar",
  "Emerald Sanctum",
  "Deadmines",
  "Ruins of Ahn'Qiraj",
]);

export function classifyRoute(path: string): ProductFamilyID {
  const normalized = path.split("?")[0].replace(/\/+$/, "") || "/";
  if (normalized === "/") return "home";
  if (/^\/(leaderboards?|rankings?)(\/|$)/.test(normalized)) return "leaderboards";
  if (normalized === "/instances") return "instance_collection";
  if (normalized.startsWith("/instances/")) return "instance_reports";
  if (normalized === "/armory") return "armory_search";
  if (normalized.startsWith("/armory/")) return "armory_players";
  if (normalized === "/g" || normalized.startsWith("/g/")) return "guilds";
  if (normalized === "/recent" || normalized.startsWith("/recent/")) return "recent";
  if (normalized === "/talents" || normalized.startsWith("/talents/")) return "talents";
  if (normalized === "/logs") return "logs_collection";
  if (normalized.startsWith("/logs/")) return "log_detail";
  if (normalized === "/upload" || normalized.startsWith("/upload/")) return "upload";
  if (normalized.startsWith("/performance-history")) return "performance";
  if (normalized.startsWith("/gear")) return "gear";
  if (normalized.startsWith("/account")) return "account";
  return "other";
}

export function aggregateRouteFamilies(rows: RoutePageViewRow[]): {
  productFamilies: AnalyticsProductFamilyRow[];
  serverProducts: AnalyticsServerProductRow[];
} {
  const totals = new Map<ProductFamilyID, number>();
  const servers = new Map<string, { pageViews: number; families: Record<string, number> }>();
  let totalPageViews = 0;

  for (const row of rows) {
    const family = classifyRoute(row.path);
    totalPageViews += row.pageViews;
    totals.set(family, (totals.get(family) ?? 0) + row.pageViews);
    const server = servers.get(row.hostname) ?? { pageViews: 0, families: {} };
    server.pageViews += row.pageViews;
    server.families[family] = (server.families[family] ?? 0) + row.pageViews;
    servers.set(row.hostname, server);
  }

  const productFamilies = PRODUCT_FAMILIES.map(({ id, label }) => ({
    id,
    label,
    pageViews: totals.get(id) ?? 0,
    share: totalPageViews === 0 ? 0 : (totals.get(id) ?? 0) / totalPageViews,
  })).sort((a, b) => b.pageViews - a.pageViews);

  const serverProducts = Array.from(servers, ([hostname, values]) => ({
    hostname,
    pageViews: values.pageViews,
    families: values.families,
  })).sort((a, b) => b.pageViews - a.pageViews);

  return { productFamilies, serverProducts };
}

function leaderboardMode(url: URL): string {
  const tab = url.searchParams.get("tab")?.trim().replace(/[\\+]+$/, "").toLowerCase();
  if (tab === "speedrun" || url.pathname.includes("speedrun")) return "Speedruns";
  return "Statistics";
}

function leaderboardInstance(url: URL): string {
  const instance = url.searchParams.get("instance");
  if (!instance) return "No instance selected";
  return KNOWN_INSTANCES.has(instance) ? instance : "Other instances";
}

function rowsWithShare(values: Map<string, number>, denominator: number) {
  return Array.from(values, ([label, pageViews]) => ({
    label,
    pageViews,
    share: denominator === 0 ? 0 : pageViews / denominator,
  })).sort((a, b) => b.pageViews - a.pageViews);
}

export function aggregateLeaderboards(
  routeLeaderboardPageViews: number,
  routeLeaderboardPageViewsByHost: Map<string, number>,
  rows: LocationPageViewRow[]
): AnalyticsLeaderboardBreakdown {
  const modes = new Map<string, number>();
  const instances = new Map<string, number>();
  const serverInstances = new Map<
    string,
    { classifiedPageViews: number; instances: Map<string, number> }
  >();
  let classifiedPageViews = 0;

  for (const row of rows) {
    try {
      const url = new URL(row.location);
      if (!/^\/(leaderboards?|rankings?)(\/|$)/.test(url.pathname)) continue;
      classifiedPageViews += row.pageViews;
      const mode = leaderboardMode(url);
      const instance = leaderboardInstance(url);
      modes.set(mode, (modes.get(mode) ?? 0) + row.pageViews);
      instances.set(instance, (instances.get(instance) ?? 0) + row.pageViews);

      const server = serverInstances.get(row.hostname) ?? {
        classifiedPageViews: 0,
        instances: new Map<string, number>(),
      };
      server.classifiedPageViews += row.pageViews;
      server.instances.set(instance, (server.instances.get(instance) ?? 0) + row.pageViews);
      serverInstances.set(row.hostname, server);
    } catch {
      // Malformed high-cardinality URLs are omitted and reflected in coverage.
    }
  }

  const servers = Array.from(routeLeaderboardPageViewsByHost, ([hostname, totalPageViews]) => {
    const server = serverInstances.get(hostname) ?? {
      classifiedPageViews: 0,
      instances: new Map<string, number>(),
    };
    return {
      hostname,
      totalPageViews,
      classifiedPageViews: server.classifiedPageViews,
      coverage: totalPageViews === 0 ? 0 : server.classifiedPageViews / totalPageViews,
      instances: rowsWithShare(server.instances, server.classifiedPageViews),
    };
  }).sort((a, b) => b.totalPageViews - a.totalPageViews);

  return {
    totalPageViews: routeLeaderboardPageViews,
    classifiedPageViews,
    coverage: routeLeaderboardPageViews === 0 ? 0 : classifiedPageViews / routeLeaderboardPageViews,
    modes: rowsWithShare(modes, classifiedPageViews),
    instances: rowsWithShare(instances, classifiedPageViews),
    servers,
  };
}
