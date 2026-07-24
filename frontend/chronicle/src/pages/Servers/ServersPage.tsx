import { useState } from "react";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import {
  useAzerothcoreServers,
  useCreateAzerothcoreServer,
  useDeleteAzerothcoreServer,
  useAzerothcoreRealms,
  useCreateAzerothcoreRealm,
  useDeleteAzerothcoreRealm,
  useAdminTenants,
  useUpsertTenant,
  useDeleteTenant,
  useSetServerTenant,
  useDatasets,
  useSetServerDataset,
  useSetTenantDataset,
} from "@/api/queries";
import { LOG_FORMAT_OPTIONS } from "@/config/serverCapabilities";
import { Loader2, Trash2, Plus, ChevronDown, ChevronRight, ExternalLink, Building2, Pencil } from "lucide-react";
import type { WoWServer, Tenant } from "@/api/typesGenerated";
import { ThemeEditor } from "@/components/ThemeEditor/ThemeEditor";

function RealmsList({ server }: { server: WoWServer }) {
  const { data: realms, isLoading } = useAzerothcoreRealms(server.id);
  const createRealm = useCreateAzerothcoreRealm();
  const deleteRealm = useDeleteAzerothcoreRealm();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createRealm.mutate(
      { serverId: server.id, name, description, url: url || undefined },
      {
        onSuccess: () => {
          setName("");
          setDescription("");
          setUrl("");
          setShowAdd(false);
        },
      },
    );
  };

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  return (
    <div className="space-y-2">
      {realms?.map((realm) => (
        <div key={realm.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
          <div>
            <span className="font-medium">{realm.name}</span>
            {realm.description && <span className="text-muted-foreground ml-2">— {realm.description}</span>}
            {realm.url && (
              <a href={realm.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-blue-500 hover:underline">
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive"
            onClick={() => {
              if (window.confirm(`Delete realm "${realm.name}"?`)) {
                deleteRealm.mutate(realm.id);
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      {showAdd ? (
        <form onSubmit={handleCreate} className="space-y-2 rounded-md border p-3">
          <input
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            placeholder="Realm name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <textarea
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm resize-y min-h-[60px]"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
          <input
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            placeholder="URL (optional)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={createRealm.isPending}>
              {createRealm.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </div>
          {createRealm.isError && <p className="text-sm text-destructive">{createRealm.error.message}</p>}
        </form>
      ) : (
        <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5" /> Add Realm
        </Button>
      )}
    </div>
  );
}

function TenantForm({ tenant, onDone }: { tenant?: Tenant; onDone: () => void }) {
  const upsertTenant = useUpsertTenant();
  const [name, setName] = useState(tenant?.name ?? "");
  const [slug, setSlug] = useState(tenant?.slug ?? "");
  const [includeInAll, setIncludeInAll] = useState(tenant?.include_in_all ?? true);
  const [disableUpload, setDisableUpload] = useState(tenant?.disable_client_upload ?? false);
  const [discoverable, setDiscoverable] = useState(tenant?.discoverable ?? false);

  // Parse mode (spec / class / disabled)
  const [parseMode, setParseMode] = useState(tenant?.parse_config?.cohort_mode || "spec");

  // Parse-axis defaults
  const [defaultFormat, setDefaultFormat] = useState(tenant?.default_format ?? "");
  const [availableFormats, setAvailableFormats] = useState<string[]>([...(tenant?.available_formats ?? [])]);

  // Branding fields
  const [squareLogo, setSquareLogo] = useState(tenant?.branding?.square_logo ?? "");
  const [logoWide, setLogoWide] = useState(tenant?.branding?.logo_wide ?? "");
  const [favicon, setFavicon] = useState(tenant?.branding?.favicon ?? "");
  const [displayName, setDisplayName] = useState(tenant?.branding?.display_name ?? "");
  const [tagline, setTagline] = useState(tenant?.branding?.tagline ?? "");
  const [description, setDescription] = useState(tenant?.branding?.description ?? "");
  const [backgroundBanner, setBackgroundBanner] = useState(tenant?.branding?.background_banner ?? "");
  const [tags, setTags] = useState<string[]>(tenant?.branding?.tags ? [...tenant.branding.tags] : []);
  const [theme, setTheme] = useState<Record<string, string>>(tenant?.branding?.theme ?? {});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const hasTheme = Object.keys(theme).length > 0;
    const hasBranding = squareLogo || logoWide || favicon || displayName || tagline || description || backgroundBanner || tags.length > 0 || hasTheme;
    upsertTenant.mutate(
      {
        id: tenant?.id ?? "",
        name,
        slug: slug || null,
        include_in_all: includeInAll,
        disable_client_upload: disableUpload,
        discoverable,
        branding: hasBranding
          ? {
              square_logo: squareLogo || undefined,
              logo_wide: logoWide || undefined,
              favicon: favicon || undefined,
              display_name: displayName || undefined,
              tagline: tagline || undefined,
              description: description || undefined,
              background_banner: backgroundBanner || undefined,
              tags: tags.length > 0 ? tags : undefined,
              theme: Object.keys(theme).length > 0 ? theme : undefined,
            }
          : null,
        parse_config: { cohort_mode: parseMode || undefined },
        default_format: defaultFormat || null,
        available_formats: availableFormats,
      },
      { onSuccess: onDone },
    );
  };

  const inputClass = "w-full rounded-md border bg-background px-3 py-1.5 text-sm";

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-md border p-3">
      <input className={inputClass} placeholder="Tenant name" value={name} onChange={(e) => setName(e.target.value)} required />
      <input
        className={inputClass}
        placeholder="Slug (optional, e.g. epoch)"
        value={slug}
        onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={includeInAll} onChange={(e) => setIncludeInAll(e.target.checked)} />
        Include in root domain listing
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={disableUpload} onChange={(e) => setDisableUpload(e.target.checked)} />
        Disable client uploads
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={discoverable} onChange={(e) => setDiscoverable(e.target.checked)} />
        Discoverable (appear on chronicleclassic.com)
      </label>
      <div className="pt-2 border-t space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Parses</p>
        <div className="space-y-1.5">
          <label className="block text-xs text-muted-foreground">Parse mode</label>
          <select
            value={parseMode}
            onChange={(e) => setParseMode(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value="spec">By spec (default)</option>
            <option value="class">By class</option>
            <option value="disabled">Disabled</option>
          </select>
          <p className="text-[10px] text-muted-foreground">
            {parseMode === "spec" && "Players are ranked against others of the same class+spec."}
            {parseMode === "class" && "Players are ranked against others of the same class (any spec)."}
            {parseMode === "disabled" && "Parse scoring is turned off — no snapshots will be created."}
          </p>
        </div>
      </div>
      <div className="pt-2 border-t space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Parse Defaults</p>
        <div className="space-y-1.5">
          <label className="block text-xs text-muted-foreground">Default format</label>
          <select
            value={defaultFormat}
            onChange={(e) => setDefaultFormat(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">None (server default)</option>
            {LOG_FORMAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs text-muted-foreground">Available formats</label>
          <div className="flex flex-wrap gap-1.5">
            {LOG_FORMAT_OPTIONS.map((opt) => {
              const checked = availableFormats.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-mono cursor-pointer select-none ${
                    checked ? "bg-primary/10 border-primary text-primary" : "border-input text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() =>
                      setAvailableFormats(checked ? availableFormats.filter((f) => f !== opt.value) : [...availableFormats, opt.value])
                    }
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
          {availableFormats.length === 0 && (
            <p className="text-[10px] text-muted-foreground">None selected — all formats available.</p>
          )}
        </div>
      </div>
      <div className="pt-2 border-t space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Branding</p>
        <input className={inputClass} placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <input className={inputClass} placeholder="Tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} />
        <input className={inputClass} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <input className={inputClass} placeholder="Square logo URL" value={squareLogo} onChange={(e) => setSquareLogo(e.target.value)} />
        <input className={inputClass} placeholder="Wide logo URL" value={logoWide} onChange={(e) => setLogoWide(e.target.value)} />
        <input className={inputClass} placeholder="Favicon URL" value={favicon} onChange={(e) => setFavicon(e.target.value)} />
        <input className={inputClass} placeholder="Background banner URL" value={backgroundBanner} onChange={(e) => setBackgroundBanner(e.target.value)} />
        <ThemeEditor value={theme} onChange={setTheme} />
        <TagPicker tags={tags} onChange={setTags} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={upsertTenant.isPending}>
          {upsertTenant.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : tenant ? "Save" : "Create"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {upsertTenant.isError && <p className="text-sm text-destructive">{upsertTenant.error.message}</p>}
    </form>
  );
}

const BRANDING_TAGS = [
  { category: "Client", values: ["1.12", "2.4.3", "2.5.3", "3.3.5a"] },
  { category: "Version", values: ["Vanilla", "TBC", "Wrath"] },
  { category: "Style", values: ["Progression", "PvP"] },
  { category: "Extra", values: ["Custom Content"] },
  { category: "Core", values: ["Azeroth Core"] },
  { category: "Logging", values: ["Client Side", "Server Side"] },
];

function TagPicker({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const toggle = (tag: string) => {
    onChange(tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]);
  };
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Tags</p>
      {BRANDING_TAGS.map((group) => (
        <div key={group.category} className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground w-14 shrink-0">{group.category}</span>
          {group.values.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => toggle(v)}
              className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                tags.includes(v)
                  ? "border-primary/50 bg-primary/15 text-primary font-medium"
                  : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function TenantSection() {
  const { data: tenants, isLoading } = useAdminTenants();
  const deleteTenant = useDeleteTenant();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-semibold">Tenants</h2>
        <Button size="sm" className="gap-1" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-4 w-4" /> Add Tenant
        </Button>
      </div>

      {showAdd && (
        <Card className="p-4">
          <TenantForm onDone={() => setShowAdd(false)} />
        </Card>
      )}

      {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}

      {tenants?.length === 0 && !showAdd && (
        <p className="text-muted-foreground text-sm">No tenants. All servers appear on the root domain.</p>
      )}

      {tenants?.map((tenant) => (
        <Card key={tenant.id} className={`p-4 space-y-2 ${tenant.discoverable ? "border-green-500" : ""}`}>
          {editingId === tenant.id ? (
            <TenantForm tenant={tenant} onDone={() => setEditingId(null)} />
          ) : (
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-semibold text-base">{tenant.name}</h3>
                  {tenant.slug && (
                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                      {tenant.slug}
                    </span>
                  )}
                </div>
                <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                  {tenant.include_in_all && <span>✓ Included in root</span>}
                  {tenant.disable_client_upload && <span>⊘ Uploads disabled</span>}
                </div>
                {tenant.default_format && (
                  <span className="mt-1 inline-block rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-mono font-medium">
                    {tenant.default_format}
                  </span>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-muted-foreground">Dataset:</span>
                  <TenantDatasetSelect tenant={tenant} />
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(tenant.id)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => {
                    if (window.confirm(`Delete tenant "${tenant.name}"?`)) {
                      deleteTenant.mutate(tenant.id);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function TenantSelect({ server, tenants }: { server: WoWServer; tenants: Tenant[] }) {
  const setServerTenant = useSetServerTenant();

  return (
    <select
      className="rounded-md border bg-background px-2 py-1 text-xs"
      value={server.tenant_id ?? ""}
      onChange={(e) => {
        const tenantId = e.target.value || null;
        setServerTenant.mutate({ serverId: server.id, tenantId });
      }}
      disabled={setServerTenant.isPending}
    >
      <option value="">No tenant</option>
      {tenants.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

/** Dataset assignment for a server. Empty value clears the assignment so the
 * server inherits its tenant's dataset (or the default dataset). */
function ServerDatasetSelect({ server }: { server: WoWServer }) {
  const { data: datasets } = useDatasets();
  const setServerDataset = useSetServerDataset();

  return (
    <select
      className="rounded-md border bg-background px-2 py-1 text-xs"
      value={server.default_dataset_id ?? ""}
      onChange={(e) => {
        const datasetId = e.target.value || null;
        setServerDataset.mutate({ serverId: server.id, datasetId });
      }}
      disabled={setServerDataset.isPending}
    >
      <option value="">Inherit (tenant / default)</option>
      {(datasets ?? []).map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
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

function ServerCard({ server, tenants }: { server: WoWServer; tenants: Tenant[] }) {
  const deleteServer = useDeleteAzerothcoreServer();
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-base">{server.name}</h3>
          {server.description && <p className="text-sm text-muted-foreground">{server.description}</p>}
          {server.url && (
            <a href={server.url} target="_blank" rel="noreferrer" className="text-sm text-blue-500 hover:underline inline-flex items-center gap-1">
              {server.url} <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Tenant:</span>
              <TenantSelect server={server} tenants={tenants} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Dataset:</span>
              <ServerDatasetSelect server={server} />
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive"
          onClick={() => {
            if (window.confirm(`Delete server "${server.name}" and all its realms?`)) {
              deleteServer.mutate(server.id);
            }
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <button
        type="button"
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Realms
      </button>

      {expanded && <RealmsList server={server} />}
    </Card>
  );
}

/** Groups servers by tenant, rendering each tenant's servers inside a soft background box. */
function ServersByTenant({ servers, tenants }: { servers: WoWServer[]; tenants: Tenant[] }) {
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));

  // Group servers: key = tenant id or "unassigned"
  const groups = new Map<string, { tenant: Tenant | null; servers: WoWServer[] }>();
  for (const server of servers) {
    const key = server.tenant_id ?? "unassigned";
    if (!groups.has(key)) {
      groups.set(key, { tenant: server.tenant_id ? tenantMap.get(server.tenant_id) ?? null : null, servers: [] });
    }
    groups.get(key)!.servers.push(server);
  }

  // Sort: tenant groups first (alphabetical), unassigned last
  const sorted = [...groups.entries()].sort(([aKey, a], [bKey, b]) => {
    if (aKey === "unassigned") return 1;
    if (bKey === "unassigned") return -1;
    return (a.tenant?.name ?? "").localeCompare(b.tenant?.name ?? "");
  });

  return (
    <div className="space-y-6">
      {sorted.map(([key, group]) => (
        <div key={key} className={group.tenant
          ? "rounded-lg border border-primary/20 bg-primary/[0.03] p-4 space-y-3"
          : "space-y-3"
        }>
          {group.tenant ? (
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-4 w-4 text-primary/60" />
              <h3 className="text-sm font-semibold text-primary/80">{group.tenant.name}</h3>
              {group.tenant.slug && (
                <span className="text-xs font-mono text-primary/50 bg-primary/10 px-1.5 py-0.5 rounded">
                  {group.tenant.slug}
                </span>
              )}
            </div>
          ) : groups.size > 1 ? (
            <h3 className="text-sm font-semibold text-muted-foreground mb-1">Unassigned</h3>
          ) : null}
          {group.servers.map((server) => (
            <ServerCard key={server.id} server={server} tenants={tenants} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ServersPage() {
  const { data: servers, isLoading } = useAzerothcoreServers();
  const { data: tenants } = useAdminTenants();
  const createServer = useCreateAzerothcoreServer();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createServer.mutate(
      { name, description, url: url || undefined },
      {
        onSuccess: () => {
          setName("");
          setDescription("");
          setUrl("");
          setShowAdd(false);
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <TenantSection />

      <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-semibold">Servers & Realms</h2>
        <Button size="sm" className="gap-1" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-4 w-4" /> Add Server
        </Button>
      </div>

      {showAdd && (
        <Card className="p-4">
          <form onSubmit={handleCreate} className="space-y-2">
            <input
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              placeholder="Server name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <textarea
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm resize-y min-h-[60px]"
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
            <input
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              placeholder="URL (optional)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={createServer.isPending}>
                {createServer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create Server"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
            </div>
            {createServer.isError && <p className="text-sm text-destructive">{createServer.error.message}</p>}
          </form>
        </Card>
      )}

      {servers?.length === 0 && (
        <p className="text-muted-foreground text-sm">No servers yet. Create one to get started.</p>
      )}

      {servers && servers.length > 0 && (
        <ServersByTenant servers={servers} tenants={tenants ?? []} />
      )}
      </div>
    </div>
  );
}
