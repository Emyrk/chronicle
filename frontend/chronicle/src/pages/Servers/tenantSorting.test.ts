import { describe, expect, it } from "vitest";
import type { Tenant } from "@/api/typesGenerated";
import { sortTenants, type TenantSortField } from "./tenantSorting";

function tenant(overrides: Partial<Tenant> & Pick<Tenant, "id" | "name">): Tenant {
  return {
    slug: null,
    disable_client_upload: false,
    include_in_all: false,
    discoverable: false,
    ads_enabled: false,
    disabled_ads: [],
    branding: null,
    parse_config: null,
    default_dataset_id: null,
    default_format: null,
    available_formats: [],
    additional_flavor: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const alpha = tenant({
  id: "alpha",
  name: "Alpha",
  discoverable: true,
  default_dataset_id: "dataset-z",
  external_linking: { methods: { "photo-proof": { enabled: true } } },
});
const beta = tenant({
  id: "beta",
  name: "beta",
  disable_client_upload: true,
  default_dataset_id: "dataset-a",
});
const gamma = tenant({ id: "gamma", name: "Gamma" });
const tenants = [gamma, beta, alpha];
const serverCounts = new Map([["alpha", 2], ["beta", 4], ["gamma", 1]]);
const datasetNames = new Map([["dataset-z", "Zulu"], ["dataset-a", "Able"]]);

function names(field: TenantSortField, direction: "asc" | "desc"): string[] {
  return sortTenants(tenants, field, direction, serverCounts, datasetNames).map((item) => item.name);
}

describe("sortTenants", () => {
  it("sorts text fields in either direction without mutating the source", () => {
    expect(names("tenant", "asc")).toEqual(["Alpha", "beta", "Gamma"]);
    expect(names("tenant", "desc")).toEqual(["Gamma", "beta", "Alpha"]);
    expect(tenants).toEqual([gamma, beta, alpha]);
  });

  it("sorts numeric and boolean columns", () => {
    expect(names("servers", "asc")).toEqual(["Gamma", "Alpha", "beta"]);
    expect(names("uploads", "desc")[0]).toBe("beta");
    expect(names("discoverable", "desc")[0]).toBe("Alpha");
  });

  it("sorts linking methods and dataset display names", () => {
    expect(names("linking:photo-proof", "desc")[0]).toBe("Alpha");
    expect(names("dataset", "asc")).toEqual(["beta", "Gamma", "Alpha"]);
  });
});
