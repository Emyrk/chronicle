import { useState } from "react";
import { Database, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card/Card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert/Alert";
import {
  useDatasets,
  useUpsertDataset,
  useDeleteDataset,
  DEFAULT_DATASET_ID,
} from "@/api/queries";
import type { Dataset, UpsertDatasetRequest } from "@/api/typesGenerated";

/** Known WoW client versions and their build numbers (suggestions only — any
 * value is allowed). Mirrors the vsn constants used server-side. */
const KNOWN_VERSIONS: { wow: string; build: number; label: string }[] = [
  { wow: "1.12.1", build: 5875, label: "Vanilla 1.12.1" },
  { wow: "1.12.2", build: 6005, label: "Vanilla 1.12.2" },
  { wow: "2.4.3", build: 8606, label: "TBC 2.4.3" },
  { wow: "3.3.5a", build: 12340, label: "WotLK 3.3.5a" },
];

/** Inline create/edit form for a dataset. */
function DatasetForm({ dataset, onDone }: { dataset?: Dataset; onDone: () => void }) {
  const upsert = useUpsertDataset();
  const [name, setName] = useState(dataset?.name ?? "");
  const [slug, setSlug] = useState(dataset?.slug ?? "");
  const [wowVersion, setWowVersion] = useState(dataset?.wow_version ?? "");
  const [buildVersion, setBuildVersion] = useState(String(dataset?.build_version ?? ""));
  const [description, setDescription] = useState(dataset?.description ?? "");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const req: UpsertDatasetRequest = {
      id: dataset?.id ?? null,
      name,
      slug,
      wow_version: wowVersion,
      build_version: buildVersion ? Number(buildVersion) : null,
      description: description || null,
    };
    upsert.mutate(req, {
      onSuccess: () => onDone(),
      onError: (e) => setError(e instanceof Error ? e.message : "Failed to save dataset"),
    });
  };

  return (
    <Card className="p-4 space-y-3 max-w-lg">
      <h3 className="font-semibold text-sm">{dataset ? "Edit dataset" : "New dataset"}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1 text-sm"
            placeholder="Turtle WoW"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Slug</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1 text-sm font-mono"
            placeholder="turtle-wow"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">WoW version</span>
          <input
            value={wowVersion}
            onChange={(e) => {
              const v = e.target.value;
              setWowVersion(v);
              // Convenience: picking a known version fills its build number.
              const known = KNOWN_VERSIONS.find((k) => k.wow === v);
              if (known) setBuildVersion(String(known.build));
            }}
            list="wow-version-options"
            className="w-full rounded-md border bg-background px-2 py-1 text-sm"
            placeholder="1.12.1"
          />
          <datalist id="wow-version-options">
            {KNOWN_VERSIONS.map((k) => (
              <option key={k.wow} value={k.wow}>{k.label}</option>
            ))}
          </datalist>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Build version</span>
          <input
            value={buildVersion}
            onChange={(e) => setBuildVersion(e.target.value.replace(/[^0-9]/g, ""))}
            list="build-version-options"
            className="w-full rounded-md border bg-background px-2 py-1 text-sm"
            placeholder="5875"
            inputMode="numeric"
          />
          <datalist id="build-version-options">
            {KNOWN_VERSIONS.map((k) => (
              <option key={k.build} value={k.build}>{k.label}</option>
            ))}
          </datalist>
        </label>
      </div>
      <label className="space-y-1 block">
        <span className="text-xs text-muted-foreground">Description</span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
          placeholder="Optional"
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={submit}
          disabled={upsert.isPending || !name || !slug || !wowVersion}
        >
          {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {dataset ? "Save" : "Create"}
        </Button>
        <Button size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

export function DatasetsTab() {
  const { data: datasets, isLoading } = useDatasets();
  const deleteDataset = useDeleteDataset();
  const [editing, setEditing] = useState<Dataset | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const onDelete = (d: Dataset) => {
    setDeleteError(null);
    if (!window.confirm(`Delete dataset "${d.name}"? This cannot be undone.`)) return;
    deleteDataset.mutate(d.id, {
      onError: (e) => setDeleteError(e instanceof Error ? e.message : "Failed to delete"),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">Datasets</h2>
          <p className="text-sm text-muted-foreground mt-1">
            A dataset is a game-data payload (spells, items, talents) scoped to a WoW
            client version. Servers and tenants resolve to a dataset; imports target one.
          </p>
        </div>
        {!creating && !editing && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New dataset
          </Button>
        )}
      </div>

      {creating && <DatasetForm onDone={() => setCreating(false)} />}
      {editing && <DatasetForm dataset={editing} onDone={() => setEditing(null)} />}

      {deleteError && (
        <Alert variant="destructive" className="max-w-lg">
          <AlertTitle>Delete failed</AlertTitle>
          <AlertDescription>{deleteError}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading datasets…
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
          {(datasets ?? []).map((d) => {
            const isDefault = d.id === DEFAULT_DATASET_ID;
            return (
              <Card key={d.id} className="p-4 flex flex-col gap-2 aspect-square">
                <div className="flex items-start gap-2">
                  <Database className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="font-medium leading-tight">{d.name}</span>
                </div>
                {isDefault && (
                  <span className="self-start text-xs rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                    default
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground font-mono break-words">
                    {d.slug}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {d.wow_version} (build {d.build_version})
                  </p>
                  {d.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{d.description}</p>
                  )}
                </div>
                <div className="flex gap-1 justify-end">
                  <Button size="icon" variant="ghost" onClick={() => setEditing(d)} aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onDelete(d)}
                    disabled={isDefault || deleteDataset.isPending}
                    aria-label="Delete"
                    title={isDefault ? "The default dataset cannot be deleted" : "Delete"}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
