import type { Dataset } from "@/api/typesGenerated";

export interface DatasetScope {
  datasetId: string | undefined;
  iconBaseUrl: string | undefined;
}

export function resolveTenantDatasetScope(
  defaultDatasetId: string | null | undefined,
  datasets: readonly Dataset[] | undefined,
): DatasetScope {
  const datasetId = defaultDatasetId ?? undefined;
  const iconBaseUrl = datasets?.find((dataset) => dataset.id === datasetId)?.icon_base_url || undefined;
  return { datasetId, iconBaseUrl };
}
