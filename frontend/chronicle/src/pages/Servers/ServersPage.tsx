import { useState } from "react";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import {
  useAzerothcoreServers,
  useCreateAzerothcoreServer,
  useUpdateAzerothcoreServer,
  useDeleteAzerothcoreServer,
  useAzerothcoreRealms,
  useCreateAzerothcoreRealm,
  useUpdateAzerothcoreRealm,
  useDeleteAzerothcoreRealm,
  useAdminTenants,
  useSetServerTenant,
  useDatasets,
  useSetServerDataset,
} from "@/api/queries";
import { Loader2, Trash2, Plus, ChevronDown, ChevronRight, ExternalLink, Building2 } from "lucide-react";
import type { PricingAuctionHouse, WoWServer, WoWServerRealm, Tenant } from "@/api/typesGenerated";

function RealmPricingEditor({ realm }: { realm: WoWServerRealm }) {
  const updateRealm = useUpdateAzerothcoreRealm();
  const [routeName, setRouteName] = useState(realm.pricing_route_name ?? "");
  const [auctionHouse, setAuctionHouse] = useState<PricingAuctionHouse | "">(realm.pricing_auction_house ?? "");

  const save = () => {
    const enabled = routeName.trim() !== "" && auctionHouse !== "";
    updateRealm.mutate({
      realmId: realm.id,
      name: realm.name,
      description: realm.description,
      url: realm.url,
      pricing_route_name: enabled ? routeName.trim() : undefined,
      pricing_auction_house: enabled ? auctionHouse : undefined,
    });
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        className="h-8 w-40 rounded-md border bg-background px-2 text-xs"
        placeholder="Pricing route name"
        value={routeName}
        onChange={(event) => setRouteName(event.target.value)}
      />
      <select
        className="h-8 rounded-md border bg-background px-2 text-xs"
        value={auctionHouse}
        onChange={(event) => setAuctionHouse(event.target.value as PricingAuctionHouse | "")}
      >
        <option value="">Pricing disabled</option>
        <option value="merged">Merged AH</option>
        <option value="split">Split AH</option>
      </select>
      <Button type="button" variant="outline" size="sm" onClick={save} disabled={updateRealm.isPending}>
        {updateRealm.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save pricing"}
      </Button>
      {updateRealm.isError && <span className="text-xs text-destructive">{updateRealm.error.message}</span>}
    </div>
  );
}

function ServerPricingProvider({ server }: { server: WoWServer }) {
  const updateServer = useUpdateAzerothcoreServer();
  return (
    <select
      className="h-8 rounded-md border bg-background px-2 text-xs"
      value={server.pricing_provider ?? ""}
      disabled={updateServer.isPending}
      onChange={(event) => updateServer.mutate({
        serverId: server.id,
        name: server.name,
        description: server.description,
        url: server.url,
        pricing_provider: event.target.value === "wowauctions" ? "wowauctions" : undefined,
      })}
    >
      <option value="">No pricing provider</option>
      <option value="wowauctions">WoWAuctions</option>
    </select>
  );
}

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
        <div key={realm.id} className="rounded-md border px-3 py-2 text-sm">
          <div className="flex items-center justify-between">
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
          {server.pricing_provider && <RealmPricingEditor realm={realm} />}
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
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Pricing:</span>
              <ServerPricingProvider server={server} />
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
