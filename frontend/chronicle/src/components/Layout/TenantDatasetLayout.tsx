import { Outlet } from "react-router-dom";
import { useDatasets, useSiteConfig } from "@/api/queries";
import { DatasetProvider } from "@/hooks/useDatasetId";
import { resolveTenantDatasetScope } from "@/hooks/datasetScope";

export function TenantDatasetLayout() {
  const { data: siteConfig, isLoading: isSiteConfigLoading } = useSiteConfig();
  const { data: datasets, isLoading: areDatasetsLoading } = useDatasets();
  const defaultDatasetId = siteConfig?.tenant?.default_dataset_id;
  const datasetScope = resolveTenantDatasetScope(defaultDatasetId, datasets);

  if (isSiteConfigLoading || (defaultDatasetId && areDatasetsLoading)) {
    return null;
  }

  return (
    <DatasetProvider
      datasetId={datasetScope.datasetId}
      iconBaseUrl={datasetScope.iconBaseUrl}
    >
      <Outlet />
    </DatasetProvider>
  );
}
