export type InstanceViewMode = "encounters" | "overview";

export function parseInstanceViewMode(value: string | null): InstanceViewMode {
  return value === "overview" ? "overview" : "encounters";
}

export function isInstanceOverviewEnabled(supportsOverview: boolean): boolean {
  return supportsOverview;
}

export function withInstanceViewMode(url: string, mode: InstanceViewMode): string {
  if (mode === "encounters") return url;

  const resolved = new URL(url, "https://chronicle.invalid");
  resolved.searchParams.set("view", "overview");
  if (/^https?:\/\//.test(url)) return resolved.toString();
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
