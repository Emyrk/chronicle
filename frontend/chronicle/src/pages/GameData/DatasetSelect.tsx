import { useDatasets, DEFAULT_DATASET_ID } from "@/api/queries";

/**
 * DatasetSelect picks the target dataset for an import. Defaults to the
 * well-known default dataset. The chosen id should be sent as the `dataset_id`
 * query param on the import request.
 */
export function DatasetSelect({
  value,
  onChange,
  label = "Dataset",
}: {
  value: string;
  onChange: (datasetID: string) => void;
  label?: string;
}) {
  const { data: datasets } = useDatasets();
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <select
        value={value || DEFAULT_DATASET_ID}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      >
        {(datasets ?? []).map((d) => (
          <option key={d.id} value={d.id}>
            {d.name} ({d.slug}){d.id === DEFAULT_DATASET_ID ? " — default" : ""}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground mt-1">
        Imported data is written to this dataset.
      </p>
    </div>
  );
}
