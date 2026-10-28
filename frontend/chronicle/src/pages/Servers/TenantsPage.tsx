import { useMemo, useState } from "react";
import { TENANT_AD_DISABLE_OPTIONS } from "@/components/Ads/adPolicy";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  useAdminTenants,
  useAzerothcoreServers,
  useBulkUpdateTenants,
  useDatasets,
  useDeleteTenant,
  useSetTenantDataset,
  type TenantPatch,
} from "@/api/queries";
import { LOG_FORMAT_OPTIONS } from "@/config/serverCapabilities";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { Tenant } from "@/api/typesGenerated";
import { TenantForm } from "./TenantForm";
import { TenantProofGrants } from "./TenantProofGrants";
import {
  sortTenants,
  type TenantSortDirection,
  type TenantSortField,
} from "./tenantSorting";

const LINKING_METHODS = [
  { key: "zug-zug", label: "Zug Zug" },
  { key: "photo-proof", label: "Photo proof" },
] as const;

const PARSE_MODES = ["spec", "class", "disabled"] as const;

type BoolField = "discoverable" | "include_in_all" | "disable_client_upload" | "ads_enabled";

const BOOL_FIELDS: { key: BoolField; label: string }[] = [
  { key: "discoverable", label: "Discoverable" },
  { key: "include_in_all", label: "In root listing" },
  { key: "disable_client_upload", label: "Uploads disabled" },
  { key: "ads_enabled", label: "Ads enabled" },
];

/** "" leaves the value unchanged. */
type Tri = "" | "on" | "off";

type BulkChanges = {
  bools: Partial<Record<BoolField, Tri>>;
  linking: Partial<Record<string, Tri>>;
  /** "on" disables the ad group. */
  disabledAds: Partial<Record<string, Tri>>;
  parseMode: string;
  defaultFormat: string;
};

const EMPTY_CHANGES: BulkChanges = { bools: {}, linking: {}, disabledAds: {}, parseMode: "", defaultFormat: "" };

function linkingEnabled(tenant: Tenant, method: string): boolean {
  return tenant.external_linking?.methods?.[method]?.enabled ?? false;
}

/** Builds the minimal patch that applies `changes` to `tenant`, or null if
 * the tenant already matches. Nested JSON fields (linking, parse config) are
 * merged with the tenant's current value since the API replaces them whole. */
function buildPatch(tenant: Tenant, changes: BulkChanges): TenantPatch | null {
  const patch: Record<string, unknown> = {};

  for (const { key } of BOOL_FIELDS) {
    const tri = changes.bools[key];
    if (tri && tenant[key] !== (tri === "on")) patch[key] = tri === "on";
  }

  const methods = { ...tenant.external_linking?.methods };
  let linkingChanged = false;
  for (const { key } of LINKING_METHODS) {
    const tri = changes.linking[key];
    if (tri && linkingEnabled(tenant, key) !== (tri === "on")) {
      methods[key] = { ...methods[key], enabled: tri === "on" };
      linkingChanged = true;
    }
  }
  if (linkingChanged) patch.external_linking = { methods };

  const disabled = new Set(tenant.disabled_ads ?? []);
  let adsChanged = false;
  for (const { key } of TENANT_AD_DISABLE_OPTIONS) {
    const tri = changes.disabledAds[key];
    if (tri && disabled.has(key) !== (tri === "on")) {
      if (tri === "on") disabled.add(key);
      else disabled.delete(key);
      adsChanged = true;
    }
  }
  if (adsChanged) patch.disabled_ads = [...disabled];

  if (changes.parseMode && (tenant.parse_config?.cohort_mode || "spec") !== changes.parseMode) {
    patch.parse_config = { ...tenant.parse_config, cohort_mode: changes.parseMode };
  }

  if (changes.defaultFormat && tenant.default_format !== changes.defaultFormat) {
    patch.default_format = changes.defaultFormat;
  }

  if (Object.keys(patch).length === 0) return null;
  return { ...patch, id: tenant.id };
}

function TriSelect({ label, value, onChange, onLabel = "On", offLabel = "Off" }: {
  label: string;
  value: Tri | undefined;
  onChange: (v: Tri) => void;
  onLabel?: string;
  offLabel?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select
        className={`rounded-md border bg-background px-2 py-1 text-xs ${value ? "border-primary text-primary" : ""}`}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value as Tri)}
      >
        <option value="">No change</option>
        <option value="on">{onLabel}</option>
        <option value="off">{offLabel}</option>
      </select>
    </label>
  );
}

function BulkEditPanel({ selected, onClear }: { selected: Tenant[]; onClear: () => void }) {
  const bulkUpdate = useBulkUpdateTenants();
  const [changes, setChanges] = useState<BulkChanges>(EMPTY_CHANGES);

  const patches = useMemo(
    () => selected.map((t) => buildPatch(t, changes)).filter((p): p is TenantPatch => p !== null),
    [selected, changes],
  );

  const apply = () => {
    if (!window.confirm(`Update ${patches.length} tenant${patches.length === 1 ? "" : "s"}?`)) return;
    bulkUpdate.mutate(patches, { onSuccess: () => setChanges(EMPTY_CHANGES) });
  };

  return (
    <Card className="p-4 space-y-3 border-primary/40">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-semibold text-sm">Bulk edit {selected.length} selected</h3>
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground underline" onClick={onClear}>
          Clear selection
        </button>
      </div>
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Visibility</p>
          {BOOL_FIELDS.map(({ key, label }) => (
            <TriSelect
              key={key}
              label={label}
              value={changes.bools[key]}
              onChange={(v) => setChanges((c) => ({ ...c, bools: { ...c.bools, [key]: v } }))}
            />
          ))}
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Ad groups</p>
          {TENANT_AD_DISABLE_OPTIONS.map(({ key, label }) => (
            <TriSelect
              key={key}
              label={label}
              value={changes.disabledAds[key]}
              onLabel="Hide"
              offLabel="Show"
              onChange={(v) => setChanges((c) => ({ ...c, disabledAds: { ...c.disabledAds, [key]: v } }))}
            />
          ))}
          <p className="text-xs font-medium pt-2">Character linking</p>
          {LINKING_METHODS.map(({ key, label }) => (
            <TriSelect
              key={key}
              label={label}
              value={changes.linking[key]}
              onChange={(v) => setChanges((c) => ({ ...c, linking: { ...c.linking, [key]: v } }))}
            />
          ))}
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Parsing</p>
          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Parse mode</span>
            <select
              className={`rounded-md border bg-background px-2 py-1 text-xs ${changes.parseMode ? "border-primary text-primary" : ""}`}
              value={changes.parseMode}
              onChange={(e) => setChanges((c) => ({ ...c, parseMode: e.target.value }))}
            >
              <option value="">No change</option>
              {PARSE_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Default format</span>
            <select
              className={`rounded-md border bg-background px-2 py-1 text-xs max-w-40 ${changes.defaultFormat ? "border-primary text-primary" : ""}`}
              value={changes.defaultFormat}
              onChange={(e) => setChanges((c) => ({ ...c, defaultFormat: e.target.value }))}
            >
              <option value="">No change</option>
              {LOG_FORMAT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button size="sm" onClick={apply} disabled={patches.length === 0 || bulkUpdate.isPending}>
          {bulkUpdate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Apply to ${patches.length} tenant${patches.length === 1 ? "" : "s"}`}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setChanges(EMPTY_CHANGES)}>Reset</Button>
        {patches.length < selected.length && patches.length > 0 && (
          <span className="text-xs text-muted-foreground">{selected.length - patches.length} already match</span>
        )}
        {bulkUpdate.isError && <span className="text-xs text-destructive">{bulkUpdate.error.message}</span>}
        {bulkUpdate.isSuccess && patches.length === 0 && <span className="text-xs text-green-600">Saved</span>}
      </div>
    </Card>
  );
}

/** Dataset assignment for a tenant. Empty value clears the assignment so the
 * tenant falls back to the default dataset. */
function TenantDatasetSelect({ tenant }: { tenant: Tenant }) {
  const { data: datasets } = useDatasets();
  const setTenantDataset = useSetTenantDataset();

  return (
    <select
      className="rounded-md border bg-background px-2 py-1 text-xs"
      value={tenant.default_dataset_id ?? ""}
      onChange={(e) => {
        const datasetId = e.target.value || null;
        setTenantDataset.mutate({ tenantId: tenant.id, datasetId });
      }}
      disabled={setTenantDataset.isPending}
    >
      <option value="">Default dataset</option>
      {(datasets ?? []).map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  );
}

function Flag({ on, title }: { on: boolean; title?: string }) {
  return on ? (
    <span title={title} className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium bg-green-500/15 text-green-600 dark:text-green-400">On</span>
  ) : (
    <span title={title} className="text-muted-foreground/60">—</span>
  );
}

function SortableHeader({
  label,
  field,
  currentField,
  direction,
  onSort,
  className,
}: {
  label: string;
  field: TenantSortField;
  currentField: TenantSortField;
  direction: TenantSortDirection;
  onSort: (field: TenantSortField) => void;
  className: string;
}) {
  const isActive = currentField === field;
  const ariaSort = isActive ? (direction === "asc" ? "ascending" : "descending") : "none";

  return (
    <th className={className} aria-sort={ariaSort}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => onSort(field)}
      >
        {label}
        {isActive ? (
          direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

const FILTERS: { key: string; label: string; match: (t: Tenant) => boolean }[] = [
  { key: "", label: "All tenants", match: () => true },
  { key: "discoverable", label: "Discoverable", match: (t) => t.discoverable },
  { key: "hidden", label: "Not discoverable", match: (t) => !t.discoverable },
  { key: "ads-on", label: "Ads on", match: (t) => t.ads_enabled },
  { key: "ads-off", label: "Ads off", match: (t) => !t.ads_enabled },
  ...LINKING_METHODS.flatMap(({ key, label }) => [
    { key: `${key}-on`, label: `${label} on`, match: (t: Tenant) => linkingEnabled(t, key) },
    { key: `${key}-off`, label: `${label} off`, match: (t: Tenant) => !linkingEnabled(t, key) },
  ]),
];

export function TenantsPage() {
  const { data: tenants, isLoading } = useAdminTenants();
  const { data: servers } = useAzerothcoreServers();
  const { data: datasets } = useDatasets();
  const deleteTenant = useDeleteTenant();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [sortField, setSortField] = useState<TenantSortField>("tenant");
  const [sortDirection, setSortDirection] = useState<TenantSortDirection>("asc");
  const [selectedIDs, setSelectedIDs] = useState<Set<string>>(new Set());
  // null = closed, "new" = create, otherwise the tenant id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [showGrants, setShowGrants] = useState(false);

  const serverCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of servers ?? []) {
      if (s.tenant_id) counts.set(s.tenant_id, (counts.get(s.tenant_id) ?? 0) + 1);
    }
    return counts;
  }, [servers]);

  const datasetNames = useMemo(
    () => new Map((datasets ?? []).map((dataset) => [dataset.id, dataset.name])),
    [datasets],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = FILTERS.find((f) => f.key === filter)?.match ?? (() => true);
    const filtered = (tenants ?? []).filter(
      (t) => match(t) && (!q || t.name.toLowerCase().includes(q) || (t.slug ?? "").toLowerCase().includes(q)),
    );
    return sortTenants(filtered, sortField, sortDirection, serverCounts, datasetNames);
  }, [tenants, search, filter, sortField, sortDirection, serverCounts, datasetNames]);

  // Derive from the latest tenant data so bulk patches diff against fresh values.
  const selected = useMemo(() => (tenants ?? []).filter((t) => selectedIDs.has(t.id)), [tenants, selectedIDs]);
  const allVisibleSelected = visible.length > 0 && visible.every((t) => selectedIDs.has(t.id));
  const editingTenant = tenants?.find((t) => t.id === editing);

  const toggle = (id: string) =>
    setSelectedIDs((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllVisible = () =>
    setSelectedIDs((cur) => {
      const next = new Set(cur);
      for (const t of visible) {
        if (allVisibleSelected) next.delete(t.id);
        else next.add(t.id);
      }
      return next;
    });

  const toggleSort = (field: TenantSortField) => {
    if (sortField === field) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortField(field);
    setSortDirection("asc");
  };

  const closeSheet = () => {
    setEditing(null);
    setShowGrants(false);
  };

  const th = "px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";
  const td = "px-2 py-1.5 whitespace-nowrap";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">Tenants</h2>
        <span className="text-sm text-muted-foreground">{tenants?.length ?? 0} total</span>
        <Button size="sm" className="gap-1 ml-auto" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Add Tenant
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="rounded-md border bg-background px-3 py-1.5 text-sm w-64 max-w-full"
          placeholder="Search name or slug"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="rounded-md border bg-background px-2 py-1.5 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          {FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">
          {visible.length} shown{selectedIDs.size > 0 && ` · ${selectedIDs.size} selected`}
        </span>
      </div>

      {selected.length > 0 && <BulkEditPanel selected={selected} onClear={() => setSelectedIDs(new Set())} />}

      {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}

      {tenants && (
        <div className="overflow-x-auto styled-scrollbar rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className={th}>
                  <input type="checkbox" aria-label="Select all shown" checked={allVisibleSelected} onChange={toggleAllVisible} />
                </th>
                <SortableHeader label="Tenant" field="tenant" currentField={sortField} direction={sortDirection} onSort={toggleSort} className={th} />
                <SortableHeader label="Servers" field="servers" currentField={sortField} direction={sortDirection} onSort={toggleSort} className={th} />
                <SortableHeader label="Discoverable" field="discoverable" currentField={sortField} direction={sortDirection} onSort={toggleSort} className={th} />
                <SortableHeader label="Root" field="root" currentField={sortField} direction={sortDirection} onSort={toggleSort} className={th} />
                <SortableHeader label="Uploads" field="uploads" currentField={sortField} direction={sortDirection} onSort={toggleSort} className={th} />
                <SortableHeader label="Ads" field="ads" currentField={sortField} direction={sortDirection} onSort={toggleSort} className={th} />
                {LINKING_METHODS.map((m) => (
                  <SortableHeader
                    key={m.key}
                    label={m.label}
                    field={`linking:${m.key}`}
                    currentField={sortField}
                    direction={sortDirection}
                    onSort={toggleSort}
                    className={th}
                  />
                ))}
                <SortableHeader label="Parse mode" field="parse_mode" currentField={sortField} direction={sortDirection} onSort={toggleSort} className={th} />
                <SortableHeader label="Format" field="format" currentField={sortField} direction={sortDirection} onSort={toggleSort} className={th} />
                <SortableHeader label="Dataset" field="dataset" currentField={sortField} direction={sortDirection} onSort={toggleSort} className={th} />
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr
                  key={t.id}
                  className={`border-b last:border-0 hover:bg-muted/30 ${selectedIDs.has(t.id) ? "bg-primary/5" : ""}`}
                >
                  <td className={td}>
                    <input type="checkbox" aria-label={`Select ${t.name}`} checked={selectedIDs.has(t.id)} onChange={() => toggle(t.id)} />
                  </td>
                  <td className={td}>
                    <button type="button" className="text-left hover:underline" onClick={() => setEditing(t.id)}>
                      <span className="font-medium">{t.name}</span>
                      {t.slug && <span className="ml-1.5 text-xs font-mono text-muted-foreground">{t.slug}</span>}
                    </button>
                  </td>
                  <td className={`${td} text-xs text-muted-foreground`}>{serverCounts.get(t.id) ?? 0}</td>
                  <td className={td}><Flag on={t.discoverable} /></td>
                  <td className={td}><Flag on={t.include_in_all} /></td>
                  <td className={td}>
                    {t.disable_client_upload
                      ? <span className="text-[10px] font-medium text-destructive">Disabled</span>
                      : <span className="text-muted-foreground/60">—</span>}
                  </td>
                  <td className={td}>
                    <div className="flex items-center gap-1">
                      <Flag on={t.ads_enabled} />
                      {TENANT_AD_DISABLE_OPTIONS.filter(({ key }) => t.disabled_ads?.includes(key)).map(({ key, label }) => (
                        <span
                          key={key}
                          title={`${label} hidden`}
                          className={`rounded border px-1 text-[10px] line-through text-muted-foreground ${t.ads_enabled ? "" : "opacity-50"}`}
                        >
                          {key}
                        </span>
                      ))}
                    </div>
                  </td>
                  {LINKING_METHODS.map(({ key }) => {
                    const callout = t.external_linking?.methods?.[key]?.callout;
                    return (
                      <td key={key} className={td}>
                        <Flag on={linkingEnabled(t, key)} title={callout ? `Callout: ${callout}` : undefined} />
                        {callout && <span className="ml-1 text-[10px] text-muted-foreground" title={callout}>✎</span>}
                      </td>
                    );
                  })}
                  <td className={`${td} text-xs`}>{t.parse_config?.cohort_mode || "spec"}</td>
                  <td className={`${td} text-xs font-mono`}>
                    {t.default_format ?? <span className="text-muted-foreground/60">—</span>}
                  </td>
                  <td className={td}><TenantDatasetSelect tenant={t} /></td>
                  <td className={td}>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t.id)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        aria-label={`Delete ${t.name}`}
                        onClick={() => {
                          if (window.confirm(`Delete tenant "${t.name}"?`)) deleteTenant.mutate(t.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-2 py-6 text-center text-sm text-muted-foreground">
                    {tenants.length === 0 ? "No tenants. All servers appear on the root domain." : "No tenants match."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={editing !== null} onOpenChange={(open) => !open && closeSheet()}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto styled-scrollbar">
          <SheetHeader>
            <SheetTitle>{editingTenant ? `Edit ${editingTenant.name}` : "New tenant"}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6 space-y-3">
            {/* Keyed so switching tenants resets the form's local state. */}
            <TenantForm key={editing ?? ""} tenant={editingTenant} onDone={closeSheet} />
            {editingTenant && (
              <>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowGrants(!showGrants)}
                >
                  {showGrants ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Photo proof access
                </button>
                {showGrants && <TenantProofGrants tenantID={editingTenant.id} />}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
