import { createContext, useContext } from "react";

/**
 * DatasetContext provides the resolved dataset_id for the current page scope
 * (e.g. an instance page). Components like spell tooltips use this to fetch
 * data from the correct dataset. When not provided, API calls fall back to the
 * server/tenant default.
 */
const DatasetContext = createContext<string | undefined>(undefined);

export const DatasetProvider = DatasetContext.Provider;

/** Returns the dataset_id from the nearest DatasetProvider, or undefined. */
export function useDatasetId(): string | undefined {
  return useContext(DatasetContext);
}
