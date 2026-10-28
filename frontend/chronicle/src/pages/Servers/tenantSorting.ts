import type { Tenant } from "@/api/typesGenerated";

export type TenantLinkingMethod = "zug-zug" | "photo-proof";

export type TenantSortField =
  | "tenant"
  | "servers"
  | "discoverable"
  | "root"
  | "uploads"
  | "ads"
  | `linking:${TenantLinkingMethod}`
  | "parse_mode"
  | "format"
  | "dataset";

export type TenantSortDirection = "asc" | "desc";

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function linkingEnabled(tenant: Tenant, method: TenantLinkingMethod): boolean {
  return tenant.external_linking?.methods?.[method]?.enabled ?? false;
}

function compareField(
  a: Tenant,
  b: Tenant,
  field: TenantSortField,
  serverCounts: ReadonlyMap<string, number>,
  datasetNames: ReadonlyMap<string, string>,
): number {
  switch (field) {
    case "tenant":
      return compareStrings(a.name, b.name) || compareStrings(a.slug ?? "", b.slug ?? "");
    case "servers":
      return (serverCounts.get(a.id) ?? 0) - (serverCounts.get(b.id) ?? 0);
    case "discoverable":
      return Number(a.discoverable) - Number(b.discoverable);
    case "root":
      return Number(a.include_in_all) - Number(b.include_in_all);
    case "uploads":
      return Number(a.disable_client_upload) - Number(b.disable_client_upload);
    case "ads":
      return Number(a.ads_enabled) - Number(b.ads_enabled)
        || compareStrings(a.disabled_ads.join(","), b.disabled_ads.join(","));
    case "parse_mode":
      return compareStrings(a.parse_config?.cohort_mode ?? "spec", b.parse_config?.cohort_mode ?? "spec");
    case "format":
      return compareStrings(a.default_format ?? "", b.default_format ?? "");
    case "dataset":
      return compareStrings(
        a.default_dataset_id ? datasetNames.get(a.default_dataset_id) ?? a.default_dataset_id : "Default dataset",
        b.default_dataset_id ? datasetNames.get(b.default_dataset_id) ?? b.default_dataset_id : "Default dataset",
      );
    default: {
      const method = field.slice("linking:".length) as TenantLinkingMethod;
      return Number(linkingEnabled(a, method)) - Number(linkingEnabled(b, method));
    }
  }
}

export function sortTenants(
  tenants: readonly Tenant[],
  field: TenantSortField,
  direction: TenantSortDirection,
  serverCounts: ReadonlyMap<string, number>,
  datasetNames: ReadonlyMap<string, string>,
): Tenant[] {
  return [...tenants].sort((a, b) => {
    const comparison = compareField(a, b, field, serverCounts, datasetNames)
      || compareStrings(a.name, b.name)
      || compareStrings(a.id, b.id);
    return direction === "asc" ? comparison : -comparison;
  });
}
