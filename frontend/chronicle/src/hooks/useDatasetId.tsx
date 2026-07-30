/* eslint-disable react-refresh/only-export-components -- Context provider and its hooks are intentionally colocated. */
import { createContext, useContext, useMemo } from "react";
import { useDatasets, useSiteConfig } from "@/api/queries";
import { resolveTenantDatasetScope, type DatasetScope } from "./datasetScope";

type DatasetContextValue = DatasetScope;

const DatasetContext = createContext<DatasetContextValue>({
  datasetId: undefined,
  iconBaseUrl: undefined,
});

/** Wraps children with dataset scope (dataset_id + icon CDN base URL). */
export function DatasetProvider({
  datasetId,
  iconBaseUrl,
  children,
}: {
  datasetId?: string;
  iconBaseUrl?: string;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ datasetId, iconBaseUrl }),
    [datasetId, iconBaseUrl],
  );
  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>;
}

/** Resolves the current tenant's default dataset and icon CDN URL. */
export function useTenantDatasetScope(): DatasetContextValue {
  const { data: siteConfig } = useSiteConfig();
  const { data: datasets } = useDatasets();
  const defaultDatasetId = siteConfig?.tenant?.default_dataset_id;

  return useMemo(
    () => resolveTenantDatasetScope(defaultDatasetId, datasets),
    [defaultDatasetId, datasets],
  );
}

/** Returns the dataset_id from the nearest DatasetProvider, or undefined. */
export function useDatasetId(): string | undefined {
  return useContext(DatasetContext).datasetId;
}

/** Returns the icon base URL from the nearest DatasetProvider, or undefined. */
export function useIconBaseUrl(): string | undefined {
  return useContext(DatasetContext).iconBaseUrl;
}
