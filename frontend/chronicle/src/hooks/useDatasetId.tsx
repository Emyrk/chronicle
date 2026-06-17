import { createContext, useContext, useMemo } from "react";

interface DatasetContextValue {
  datasetId: string | undefined;
  iconBaseUrl: string | undefined;
}

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

/** Returns the dataset_id from the nearest DatasetProvider, or undefined. */
export function useDatasetId(): string | undefined {
  return useContext(DatasetContext).datasetId;
}

/** Returns the icon base URL from the nearest DatasetProvider, or undefined. */
export function useIconBaseUrl(): string | undefined {
  return useContext(DatasetContext).iconBaseUrl;
}
