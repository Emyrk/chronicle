import { useState } from "react";
import { Pin, Trash2, Plus } from "lucide-react";
import {
  useStatWeightPins,
  useCreateStatWeightPin,
  useDeleteStatWeightPin,
} from "@/api/gearBuilderQueries";

export default function AdminGearBuilderPage() {
  const [datasetID, setDatasetID] = useState("");
  const [statWeightID, setStatWeightID] = useState("");
  const { data: pins, isLoading } = useStatWeightPins(datasetID || undefined);
  const createPin = useCreateStatWeightPin();
  const deletePin = useDeleteStatWeightPin();

  const handlePin = () => {
    if (!datasetID || !statWeightID) return;
    createPin.mutate(
      { dataset_id: datasetID, stat_weight_id: statWeightID },
      { onSuccess: () => setStatWeightID("") },
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-zinc-100">Gear Builder — Pin Management</h1>
      <p className="text-sm text-zinc-400">
        Pin a live user stat-weight reference for the current tenant and selected dataset.
        Users will see pinned weights as presets.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Dataset ID</label>
          <input
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200 font-mono text-sm"
            placeholder="UUID"
            value={datasetID}
            onChange={(e) => setDatasetID(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Stat Weight ID to pin</label>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-200 font-mono text-sm"
              placeholder="UUID"
              value={statWeightID}
              onChange={(e) => setStatWeightID(e.target.value)}
            />
            <button
              onClick={handlePin}
              disabled={!datasetID || !statWeightID || createPin.isPending}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-2 rounded text-sm"
            >
              <Plus className="h-4 w-4" /> Pin
            </button>
          </div>
        </div>
      </div>

      {createPin.isError && (
        <p className="text-red-400 text-sm">{createPin.error.message}</p>
      )}

      <div className="border border-zinc-700 rounded-lg overflow-hidden max-w-3xl">
        <div className="bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 flex items-center gap-2">
          <Pin className="h-4 w-4" />
          Pinned Stat Weights {datasetID ? `(dataset: ${datasetID.slice(0, 8)}…)` : ""}
        </div>

        {!datasetID ? (
          <p className="p-4 text-zinc-500 text-sm italic">Enter a dataset ID to view pins.</p>
        ) : isLoading ? (
          <p className="p-4 text-zinc-500 text-sm">Loading...</p>
        ) : (pins ?? []).length === 0 ? (
          <p className="p-4 text-zinc-500 text-sm italic">No pins for this tenant + dataset.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400">
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Class</th>
                <th className="px-4 py-2 text-left">Weight ID</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(pins ?? []).map((pin) => (
                <tr key={pin.id} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                  <td className="px-4 py-2 text-zinc-200">{pin.stat_weight_name}</td>
                  <td className="px-4 py-2 text-zinc-400">{pin.stat_weight_class_id}</td>
                  <td className="px-4 py-2 text-zinc-500 font-mono text-xs">{pin.stat_weight_id}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => deletePin.mutate(pin.id)}
                      className="text-red-400 hover:text-red-300"
                      title="Remove pin"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
