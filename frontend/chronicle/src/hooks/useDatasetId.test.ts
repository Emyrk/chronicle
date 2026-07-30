import { describe, expect, it } from "vitest";
import type { Dataset } from "@/api/typesGenerated";
import { resolveTenantDatasetScope } from "./datasetScope";

const datasets = [
  {
    id: "root-dataset",
    icon_base_url: "https://icons.example/root",
  },
  {
    id: "tenant-dataset",
    icon_base_url: "https://icons.example/tenant",
  },
] as Dataset[];

describe("resolveTenantDatasetScope", () => {
  it("uses the icon base URL from the tenant default dataset", () => {
    expect(resolveTenantDatasetScope("tenant-dataset", datasets)).toEqual({
      datasetId: "tenant-dataset",
      iconBaseUrl: "https://icons.example/tenant",
    });
  });

  it("does not borrow the root dataset URL when the tenant has no default dataset", () => {
    expect(resolveTenantDatasetScope(null, datasets)).toEqual({
      datasetId: undefined,
      iconBaseUrl: undefined,
    });
  });
});
