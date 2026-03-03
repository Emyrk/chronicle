import { useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { User, Bell, Shield, Palette, HardDrive, Clock, LayoutTemplate, Download, Upload, Plus, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useInstance, useMyStorage } from "@/api/queries";
import type { DataGrant, InstancePlayer, InstanceUnit, WoWEncounterWithHostiles } from "@/api/typesGenerated";
import { GridLayoutEditor, type GridEditorItem } from "@/components/layout/GridLayoutEditor";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InstanceEventsProvider } from "@/hooks/instanceEvents";
import { EventsPanel, type EventsPanelType } from "@/pages/Instance/EventsPanels";
import { PANELS } from "@/pages/Instance/EventsPanels/EventsPanel";
import type { PanelContext } from "@/pages/Instance/EventsPanels/types";
import type { Instance } from "@/pages/Instance/InstancePage";
import { PanelTimingProvider } from "@/pages/Instance/EventsPanels/PanelTimingContext";
import { DEFAULT_INSTANCE_LAYOUT_ITEMS, DEFAULT_INSTANCE_PANEL_TYPES } from "@/pages/Instance/viewDefaults";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatExpirationDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return "Expired";
  if (diffDays === 0) return "Expires today";
  if (diffDays === 1) return "Expires tomorrow";
  if (diffDays <= 7) return `Expires in ${diffDays} days`;
  if (diffDays <= 30) return `Expires in ${Math.ceil(diffDays / 7)} weeks`;
  
  return `Expires ${date.toLocaleDateString()}`;
}

type Tab = {
  path: string;
  label: string;
  icon: LucideIcon;
};

const tabs: Tab[] = [
  { path: "/account/settings", label: "Profile", icon: User },
  { path: "/account/storage", label: "Storage", icon: HardDrive },
  { path: "/account/notifications", label: "Notifications", icon: Bell },
  { path: "/account/privacy", label: "Privacy", icon: Shield },
  { path: "/account/appearance", label: "Appearance", icon: Palette },
  { path: "/account/layout-lab", label: "Layout Lab", icon: LayoutTemplate },
];

export function AccountLayout() {
  const location = useLocation();

  return (
    <div className="flex min-h-[calc(100vh-8rem)]">
      {/* Sidebar */}
      <nav className="w-64 border-r p-4">
        <h1 className="text-lg font-semibold mb-4">Settings</h1>
        <ul className="space-y-1">
          {tabs.map((tab) => (
            <li key={tab.path}>
              <Link
                to={tab.path}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  location.pathname === tab.path
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Content */}
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}

export function ProfileSettings() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Profile Settings</h2>
      <p className="text-muted-foreground">Manage your profile information.</p>
    </div>
  );
}

export function NotificationSettings() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Notification Preferences</h2>
      <p className="text-muted-foreground">Configure how you receive notifications.</p>
    </div>
  );
}

export function PrivacySettings() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Privacy Settings</h2>
      <p className="text-muted-foreground">Control your privacy and data.</p>
    </div>
  );
}

export function AppearanceSettings() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Appearance</h2>
      <p className="text-muted-foreground">Customize the look and feel.</p>
    </div>
  );
}

interface LayoutLabExportV1 {
  version: 1;
  items: GridEditorItem[];
  panelTypesById: Record<string, EventsPanelType>;
}

function serializeLayoutLab(items: GridEditorItem[], panelTypesById: Record<string, EventsPanelType>): string {
  const payload: LayoutLabExportV1 = {
    version: 1,
    items,
    panelTypesById,
  };
  return JSON.stringify(payload, null, 2);
}

function parseLayoutLab(raw: string): LayoutLabExportV1 {
  const parsed = JSON.parse(raw) as Partial<LayoutLabExportV1>;
  if (parsed.version !== 1) {
    throw new Error("Unsupported layout version");
  }
  if (!Array.isArray(parsed.items) || !parsed.panelTypesById || typeof parsed.panelTypesById !== "object") {
    throw new Error("Invalid layout payload");
  }
  return {
    version: 1,
    items: parsed.items,
    panelTypesById: parsed.panelTypesById as Record<string, EventsPanelType>,
  };
}

function normalizeInstanceReference(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  if (trimmed.startsWith("/instances/")) {
    return `${window.location.origin}${trimmed}`;
  }

  const instanceIdMatch = trimmed.match(/^[a-zA-Z0-9_-]+$/);
  if (instanceIdMatch) {
    return `${window.location.origin}/instances/${trimmed}`;
  }

  return "";
}

function extractInstanceId(reference: string): string | null {
  try {
    const parsed = new URL(reference);
    const match = parsed.pathname.match(/^\/instances\/([^/?#]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function getUnitName(guidStr: string, units: Record<string, InstanceUnit>): string {
  const unit = units[guidStr];
  if (unit) return unit.name;
  return `Enemy ${guidStr}`;
}

function transformToInstance(
  apiInstance: {
    id: string;
    name: string;
    realm_name?: string;
    guild?: { name: string };
    encounters: readonly WoWEncounterWithHostiles[];
    players: Record<string, InstancePlayer>;
    units: Record<string, InstanceUnit>;
  },
): Instance {
  const { players, units } = apiInstance;

  const encounters = apiInstance.encounters.map((enc) => ({
    id: enc.id,
    name: enc.name,
    boss: enc.boss,
    kill_type: enc.kill_type,
    start_time: enc.start_time,
    end_time: enc.end_time,
    enemies: enc.hostiles.map((hostile) => ({
      id: String(hostile.id),
      name: getUnitName(String(hostile.id), units),
      boss: hostile.boss,
      damageTaken: 0,
      damageDone: 0,
      periods: hostile.periods,
    })),
    remaining: enc.remaining as string[] | undefined,
  }));

  const sortedEncounters = [...apiInstance.encounters].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );

  return {
    id: apiInstance.id,
    name: apiInstance.name,
    realm: apiInstance.realm_name,
    guild: apiInstance.guild,
    startTime: sortedEncounters[0]?.start_time || new Date().toISOString(),
    endTime: sortedEncounters[sortedEncounters.length - 1]?.end_time,
    encounters,
    players,
    units,
  };
}

function LivePanelTile({
  item,
  panelType,
  context,
  durationMs,
  onPanelTypeChange,
}: {
  item: GridEditorItem;
  panelType: EventsPanelType;
  context: PanelContext;
  durationMs: number;
  onPanelTypeChange: (next: EventsPanelType) => void;
}) {
  return (
    <EventsPanel
      panelType={panelType}
      onPanelTypeChange={onPanelTypeChange}
      durationMs={durationMs}
      context={context}
      panelIndex={Number(item.id.replace("panel-", "")) - 1}
      showHints={false}
    />
  );
}

export function LayoutLabSettings() {
  const [items, setItems] = useState<GridEditorItem[]>(DEFAULT_INSTANCE_LAYOUT_ITEMS);
  const [panelTypesById, setPanelTypesById] = useState<Record<string, EventsPanelType>>(DEFAULT_INSTANCE_PANEL_TYPES);
  const [instanceReferenceInput, setInstanceReferenceInput] = useState("");
  const [instanceReference, setInstanceReference] = useState("");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const normalizedReference = useMemo(
    () => normalizeInstanceReference(instanceReferenceInput),
    [instanceReferenceInput],
  );

  const instanceId = useMemo(() => extractInstanceId(instanceReference), [instanceReference]);

  const { data: apiInstance, isLoading, error } = useInstance(instanceId ?? "", {
    enabled: !!instanceId,
  });

  const instance = useMemo(() => {
    if (!apiInstance) return null;
    return transformToInstance(apiInstance);
  }, [apiInstance]);

  const selectedEncounterIds = useMemo(() => {
    if (!instance) return [];
    return instance.encounters.map((encounter) => encounter.id);
  }, [instance]);

  const durationMs = useMemo(() => {
    if (!instance) return 1;
    return Math.max(
      1,
      instance.encounters.reduce((total, encounter) => {
        const start = new Date(encounter.start_time).getTime();
        const end = new Date(encounter.end_time).getTime();
        return total + Math.max(0, end - start);
      }, 0),
    );
  }, [instance]);

  const context = useMemo<PanelContext | null>(() => {
    if (!instance) return null;
    return {
      renderMode: "layout_lab",
      instance,
      selectedEncounterIds,
      entitySelection: {
        enemyIds: new Set(),
        playerIds: new Set(),
      },
    };
  }, [instance, selectedEncounterIds]);

  const handlePanelTypeChange = (itemId: string, nextType: EventsPanelType) => {
    setPanelTypesById((prev) => ({ ...prev, [itemId]: nextType }));
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              title: PANELS[nextType]?.label ?? item.title,
            }
          : item,
      ),
    );
  };

  const handleRemovePanel = (itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
    setPanelTypesById((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const handleAddPanel = () => {
    const nextIndex = items.reduce((max, item) => {
      const match = item.id.match(/^panel-(\d+)$/);
      const n = match ? Number(match[1]) : 0;
      return Math.max(max, n);
    }, 0) + 1;

    const maxY = items.reduce((max, item) => Math.max(max, item.y + item.h), 0);
    const newId = `panel-${nextIndex}`;
    const newType: EventsPanelType = "damage_done";

    setItems((prev) => [
      ...prev,
      {
        id: newId,
        title: PANELS[newType].label,
        x: 0,
        y: maxY,
        w: 6,
        h: 4,
        minW: 4,
      },
    ]);
    setPanelTypesById((prev) => ({ ...prev, [newId]: newType }));
  };

  const handleExport = async () => {
    const serialized = serializeLayoutLab(items, panelTypesById);
    await navigator.clipboard.writeText(serialized);
    toast.success("Layout copied to clipboard");
  };

  const handleImport = () => {
    try {
      const parsed = parseLayoutLab(importText);
      setItems(parsed.items);
      setPanelTypesById(parsed.panelTypesById);
      setImportError(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Invalid layout JSON");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Layout Lab</h2>
        <p className="text-muted-foreground">
          Prototype custom panel layouts with a 12-column grid (minimum panel width: 4 columns) and render
          live EventsPanels directly in each tile.
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <label htmlFor="instance-reference" className="text-sm font-medium">
          Reference instance URL or ID
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="instance-reference"
            className="min-w-[280px] flex-1"
            placeholder="https://chronicleclassic.com/instances/abc123 or abc123"
            value={instanceReferenceInput}
            onChange={(event) => setInstanceReferenceInput(event.target.value)}
          />
          <Button
            type="button"
            onClick={() => setInstanceReference(normalizedReference)}
            disabled={!normalizedReference}
          >
            Apply reference
          </Button>
          <Button type="button" variant="outline" onClick={handleAddPanel} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add panel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setItems(DEFAULT_INSTANCE_LAYOUT_ITEMS);
              setPanelTypesById(DEFAULT_INSTANCE_PANEL_TYPES);
            }}
          >
            Reset layout
          </Button>
          <Button type="button" variant="outline" onClick={handleExport} className="gap-1.5">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>

        <details className="rounded-md border border-border/70 bg-muted/20">
          <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium hover:bg-muted/40">
            <span className="inline-flex items-center gap-1.5">
              <Upload className="h-4 w-4" />
              Import layout JSON
            </span>
          </summary>
          <div className="space-y-2 border-t border-border/70 p-3">
            <textarea
              id="layout-import"
              className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
              placeholder='{"version":1,"items":[],"panelTypesById":{}}'
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
            />
            <div className="flex items-center gap-2">
              <Button type="button" onClick={handleImport} className="gap-1.5">
                <Upload className="h-4 w-4" />
                Import
              </Button>
              {importError && <span className="text-sm text-destructive">{importError}</span>}
            </div>
          </div>
        </details>
      </div>

      <div className="rounded-lg border p-3">
        {!instanceId ? (
          <div className="p-6 text-sm text-muted-foreground">Add an instance URL above to load live panel data.</div>
        ) : isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading instance data…</div>
        ) : error || !instance || !context ? (
          <div className="p-6 text-sm text-destructive">Failed to load the referenced instance.</div>
        ) : (
          <InstanceEventsProvider instanceId={instance.id}>
            <PanelTimingProvider panelCount={items.length}>
              <GridLayoutEditor
                cols={12}
                rowHeight={96}
                items={items}
                onItemsChange={setItems}
                showItemHeader={false}
                renderItem={(item) => {
                  const panelType = panelTypesById[item.id] ?? "damage_done";
                  return (
                    <div className="group relative h-full">
                      <LivePanelTile
                        item={item}
                        panelType={panelType}
                        context={context}
                        durationMs={durationMs}
                        onPanelTypeChange={(next) => handlePanelTypeChange(item.id, next)}
                      />

                      <div className="pointer-events-none absolute inset-0 z-20 rounded-md bg-background/35 opacity-0 transition-opacity group-hover:opacity-100" />
                      <div className="pointer-events-none absolute right-2 top-2 z-30 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="pointer-events-auto h-8 px-2"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleRemovePanel(item.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                }}
              />
            </PanelTimingProvider>
          </InstanceEventsProvider>
        )}
      </div>
    </div>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  base: "Base Allocation",
  support: "Supporter Bonus",
  "alpha-tester": "Alpha Tester Reward",
  "beta-tester": "Beta Tester Reward",
  promotion: "Promotional Bonus",
};

function formatSource(source: string): string {
  return SOURCE_LABELS[source] || source.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StorageSettings() {
  const { data: storage, isLoading } = useMyStorage();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Storage</h2>
        <p className="text-muted-foreground">Loading storage information...</p>
      </div>
    );
  }

  if (!storage) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Storage</h2>
        <p className="text-muted-foreground">Unable to load storage information.</p>
      </div>
    );
  }

  const usagePercent = storage.max_storage_bytes > 0
    ? (storage.consumed_storage_bytes / storage.max_storage_bytes) * 100
    : 0;

  const getProgressColor = () => {
    if (usagePercent >= 95) return "bg-red-500";
    if (usagePercent >= 80) return "bg-yellow-500";
    return "bg-primary";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Storage</h2>
        <p className="text-muted-foreground">View your storage usage and grants.</p>
      </div>

      {/* Storage Usage Bar */}
      <div className="rounded-lg border p-6 space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Storage Used</span>
          <span className="text-sm text-muted-foreground">
            {formatBytes(storage.consumed_storage_bytes)} of {formatBytes(storage.max_storage_bytes)}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div 
            className={`h-full transition-all ${getProgressColor()}`}
            style={{ width: `${Math.min(usagePercent, 100)}%` }}
          />
        </div>
        {usagePercent >= 80 && (
          <p className={`text-sm ${usagePercent >= 95 ? "text-red-500" : "text-yellow-500"}`}>
            {usagePercent >= 95
              ? "You've nearly reached your storage limit. Delete some logs to free up space."
              : "You're approaching your storage limit."}
          </p>
        )}
      </div>

      {/* Storage Grants */}
      <div className="rounded-lg border">
        <div className="p-4 border-b">
          <h3 className="font-medium">Storage Grants</h3>
          <p className="text-sm text-muted-foreground">
            Your total storage is the sum of all active grants below.
          </p>
        </div>
        <div className="divide-y">
          {storage.grants.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No storage grants found.</div>
          ) : (
            storage.grants.map((grant: DataGrant) => {
              const isExpired = grant.expires_at && new Date(grant.expires_at) < new Date();
              const isExpiringSoon = grant.expires_at && !isExpired && 
                new Date(grant.expires_at).getTime() - new Date().getTime() < 7 * 24 * 60 * 60 * 1000;
              
              return (
                <div key={grant.id} className={`p-4 flex justify-between items-center ${isExpired ? "opacity-50" : ""}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatSource(grant.source)}</span>
                      {grant.expires_at && (
                        <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${
                          isExpired 
                            ? "bg-destructive/15 text-destructive" 
                            : isExpiringSoon 
                              ? "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400"
                              : "bg-muted text-muted-foreground"
                        }`}>
                          <Clock className="h-3 w-3" />
                          {formatExpirationDate(grant.expires_at)}
                        </span>
                      )}
                    </div>
                    {grant.description && (
                      <div className="text-sm text-muted-foreground">{grant.description}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatBytes(grant.storage_bytes)}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(grant.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
