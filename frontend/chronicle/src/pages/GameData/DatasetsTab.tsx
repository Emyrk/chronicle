import { useState } from "react";
import { Database, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/Card/Card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert/Alert";
import {
  useDatasets,
  useUpsertDataset,
  useDeleteDataset,
  useDatasetImportSummary,
  DEFAULT_DATASET_ID,
} from "@/api/queries";
import type { DatasetImportSummary } from "@/api/queries";
import type { Dataset, UpsertDatasetRequest } from "@/api/typesGenerated";

/** Known flavor tags. Mirrors FlavorTag constants in database/flavor.go.
 * Base flavors first, then server-specific, then content tags. */
const KNOWN_FLAVOR_TAGS = [
  { tag: "vanilla", label: "Vanilla", group: "base" },
  { tag: "wrath", label: "Wrath", group: "base" },
  { tag: "turtle", label: "Turtle", group: "server" },
  { tag: "kronos", label: "Kronos", group: "server" },
  { tag: "epoch", label: "Epoch", group: "server" },
  { tag: "azerothcore", label: "AzerothCore", group: "server" },
  { tag: "vanillaplus", label: "VanillaPlus", group: "server" },
  { tag: "octowow", label: "OctoWoW", group: "server" },
  { tag: "ascension", label: "Ascension", group: "server" },
  { tag: "nightmare-of-ursol", label: "Nightmare of Ursol", group: "content" },
] as const;

/** Known icon CDN base URLs. Users can also type a custom URL. */
const KNOWN_ICON_CDNS = [
  { url: "https://icons.chronicleclassic.com/turtle", label: "Turtle WoW" },
  { url: "https://icons.chronicleclassic.com/azerothcore", label: "AzerothCore" },
  { url: "https://icons.chronicleclassic.com/kronos", label: "Kronos" },
  { url: "https://icons.chronicleclassic.com/epoch", label: "Epoch" },
  { url: "https://icons.chronicleclassic.com/octowow", label: "OctoWoW" },
  { url: "https://icons.chronicleclassic.com/vanillaplus", label: "VanillaPlus" },
  { url: "https://icons.chronicleclassic.com/ascension", label: "Ascension" },
] as const;

/** Known WoW client versions and their build numbers (suggestions only — any
 * value is allowed). Mirrors the vsn constants used server-side. */
const KNOWN_VERSIONS: { wow: string; build: number; label: string }[] = [
  { wow: "1.12.1", build: 5875, label: "Vanilla 1.12.1" },
  { wow: "1.12.2", build: 6005, label: "Vanilla 1.12.2" },
  { wow: "2.4.3", build: 8606, label: "TBC 2.4.3" },
  { wow: "3.3.5a", build: 12340, label: "WotLK 3.3.5a" },
];

/** Data types tracked per dataset with their summary field names. */
const DATA_TYPES: { label: string; key: keyof DatasetImportSummary; isBool?: boolean }[] = [
  { label: "Spells", key: "spells_count" },
  { label: "Talents", key: "has_talents", isBool: true },
  { label: "Creatures", key: "creatures_count" },
  { label: "Items", key: "items_count" },
  { label: "Item Display Info", key: "item_display_count" },
  { label: "Enchantments", key: "enchantments_count" },
  { label: "Random Properties", key: "random_properties_count" },
  { label: "Item Sets", key: "item_sets_count" },
  // Spell metadata (companion DBC files):
  { label: "Cast Times", key: "cast_times_count" },
  { label: "Durations", key: "durations_count" },
  { label: "Ranges", key: "ranges_count" },
  { label: "Icons", key: "icons_count" },
  { label: "Categories", key: "categories_count" },
  { label: "Radii", key: "radii_count" },
  { label: "Focus Objects", key: "focus_objects_count" },
  // Derived data:
  { label: "Extra Attacks", key: "extra_attacks_count" },
  { label: "Duration Mods", key: "duration_modifiers_count" },
  { label: "Periodic Spells", key: "periodic_spells_count" },
];

/** Shows green/red import status for each data type in a dataset. */
function ImportStatusList({ datasetId }: { datasetId: string }) {
  const { data: summary, isLoading } = useDatasetImportSummary(datasetId);

  if (isLoading || !summary) {
    return <div className="mt-1.5 text-[10px] text-muted-foreground/40">Loading…</div>;
  }

  return (
    <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
      {DATA_TYPES.map(({ label, key, isBool }) => {
        const value = summary[key];
        const imported = isBool ? !!value : (value as number) > 0;
        return (
          <div key={key} className={imported ? "text-emerald-500" : "text-muted-foreground/40"}>
            {imported ? "✓" : "✗"}{" "}
            {label}
            {!isBool && imported && (
              <span className="text-muted-foreground/60 ml-0.5">
                ({(value as number).toLocaleString()})
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Inline create/edit form for a dataset. */
function DatasetForm({ dataset, onDone }: { dataset?: Dataset; onDone: () => void }) {
  const upsert = useUpsertDataset();
  const [name, setName] = useState(dataset?.name ?? "");
  const [slug, setSlug] = useState(dataset?.slug ?? "");
  const [wowVersion, setWowVersion] = useState(dataset?.wow_version ?? "");
  const [buildVersion, setBuildVersion] = useState(String(dataset?.build_version ?? ""));
  const [description, setDescription] = useState(dataset?.description ?? "");
  const [flavorTags, setFlavorTags] = useState<string[]>([...(dataset?.default_flavor ?? [])]);
  const [iconBaseUrl, setIconBaseUrl] = useState(dataset?.icon_base_url ?? "");
  const [error, setError] = useState<string | null>(null);

  const toggleFlavor = (tag: string) => {
    setFlavorTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const submit = () => {
    setError(null);
    const req: UpsertDatasetRequest = {
      id: dataset?.id ?? null,
      name,
      slug,
      wow_version: wowVersion,
      build_version: buildVersion ? Number(buildVersion) : null,
      description: description || null,
      default_flavor: flavorTags,
      icon_base_url: iconBaseUrl || null,
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
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Flavor tags</span>
        <div className="flex flex-wrap gap-1.5">
          {KNOWN_FLAVOR_TAGS.map(({ tag, label }) => {
            const active = flavorTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleFlavor(tag)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <label className="space-y-1 block">
        <span className="text-xs text-muted-foreground">Icon CDN base URL</span>
        <input
          value={iconBaseUrl}
          onChange={(e) => setIconBaseUrl(e.target.value)}
          list="icon-cdn-options"
          className="w-full rounded-md border bg-background px-2 py-1 text-sm font-mono"
          placeholder="https://icons.chronicleclassic.com/turtle"
        />
        <datalist id="icon-cdn-options">
          {KNOWN_ICON_CDNS.map((k) => (
            <option key={k.url} value={k.url}>{k.label}</option>
          ))}
        </datalist>
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
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(22rem,1fr))]">
          {(datasets ?? []).map((d) => {
            const isDefault = d.id === DEFAULT_DATASET_ID;
            return (
              <Card key={d.id} className="p-4 flex flex-col gap-2">
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
                  <p
                    className="text-[10px] text-muted-foreground/60 font-mono break-all cursor-pointer hover:text-muted-foreground transition-colors"
                    title="Click to copy dataset ID"
                    onClick={() => navigator.clipboard.writeText(d.id)}
                  >
                    {d.id}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono break-words">
                    {d.slug}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {d.wow_version} (build {d.build_version})
                  </p>
                  {d.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{d.description}</p>
                  )}
                  {d.default_flavor.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {d.default_flavor.map((tag) => (
                        <span key={tag} className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <ImportStatusList datasetId={d.id} />
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
