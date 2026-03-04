import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { User, Bell, Shield, Palette, HardDrive, Clock, LayoutTemplate, Download, Upload, Plus, Trash2, BookOpenText, Save, Pencil, Trash, Share2, ChevronLeft, ChevronRight } from "lucide-react";
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
import {
  DEFAULT_INSTANCE_LAYOUT_ITEMS,
  ALTERNATE_INSTANCE_LAYOUT_ITEMS,
  DEFAULT_INSTANCE_PANEL_TYPES,
} from "@/pages/Instance/viewDefaults";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { getSpellIconUrl } from "@/api/wowdb";
import type { WoWSpell } from "@/api/wowdb";
import { SpellTooltip } from "@/pages/WoWDB/SpellTooltip";
import { useLayoutBookStore } from "@/features/layoutBook/layoutBookStore";

const ICON_PAGE_SIZE = 24;

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
  { path: "/account/layout-book", label: "Layout Book", icon: BookOpenText },
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

function buildLayoutSpellTooltip(layout: {
  title: string;
  description: string;
  icon: string;
  layout: "standard" | "alternate";
  items: { id: string }[];
  updatedAt: string;
}): WoWSpell {
  return {
    id: 0,
    name: { "0": layout.title },
    subtext: { "0": "Layout Spell" },
    description: {
      "0": `${layout.description || "No description"}\n\n${layout.layout} layout\n${layout.items.length} panels\nUpdated ${new Date(layout.updatedAt).toLocaleString()}`,
    },
    aura_description: { "0": "" },
    spell_icon: { ID: 1, TextureFilename: layout.icon || "INV_Misc_Book_09" },
    active_icon: { ID: 1, TextureFilename: layout.icon || "INV_Misc_Book_09" },
    spell_level: 1,
    base_level: 1,
    max_level: 60,
    category: { ID: 0, Flags: 0, UsesPerWeek: 0, Name: "", MaxCharges: 0, ChargeRecoveryTime: 0, TypeMask: 0 },
    school: { value: 1, string: "Arcane" },
    spell_class_set: { value: 0, string: "General" },
    spell_class_mask: 0,
    power_type: { value: 0, string: "Mana" },
    mana_cost: 0,
    mana_cost_pct: 0,
    mana_cost_per_level: 0,
    mana_per_second: 0,
    reagent: [],
    reagent_count: [],
    casting_time: { ID: 0, Base: 0, PerLevel: 0, Minimum: 0 },
    range: { ID: 0, RangeMin: 0, RangeMax: 0, Flags: 0, Name: "Self" },
    duration: { ID: 0, Duration: 0, DurationPerLevel: 0, MaxDuration: 0 },
    recovery_time: 0,
    start_recovery_time: 0,
    start_recovery_category: 0,
    category_recovery_time: 0,
    mechanic: { value: 0, string: "None" },
    dispel_type: { value: 0, string: "None" },
    prevention_type: { value: 0, string: "None" },
    defense_type: { value: 0, string: "None" },
    caster_aura_state: { value: 0, string: "None" },
    target_aura_state: { value: 0, string: "None" },
    interrupt_flags: { mask: 0, string: "" },
    aura_interrupt_flags: { mask: 0, string: "" },
    effect: [],
    effect_aura: [],
    effect_base_points: [],
    effect_die_sides: [],
    effect_base_dice: [],
    effect_dice_per_level: [],
    effect_real_points_per_level: [],
    effect_aura_period: [],
    effect_amplitude: [],
    effect_chain_amplitude: [],
    effect_chain_targets: [],
    effect_trigger_spell: [],
    effect_item_type: [],
    effect_misc_value: [],
    effect_mechanic: [],
    effect_points_per_combo: [],
    effect_radius: [],
    implicit_target_a: [],
    implicit_target_b: [],
    proc_chance: 0,
    proc_charges: 0,
    proc_type_mask: { mask: 0, string: "" },
    proc_flags: { mask: 0, string: "" },
    targets: { mask: 0, string: "" },
    max_targets: 0,
    max_target_level: 0,
    target_creature_type: { mask: 0, string: "" },
    attributes: { blocks: [], string: "" },
    equipped_item_class: { value: 0, string: "None" },
    equipped_item_subclass: 0,
    equipped_item_inv_types: { mask: 0, string: "" },
    speed: 0,
    spell_priority: 0,
    stance_bar_order: 0,
    cumulative_aura: 0,
    modal_next_spell: 0,
    requires_spell_focus: { ID: 0, Name: "" },
    totems_id: 0,
    totem: [],
    cast_ui: 0,
    required_aura_vision: 0,
    min_faction_id: 0,
    min_reputation: 0,
    spell_visual_id: [],
    damage_type: 0,
  };
}

export function LayoutBookSettings() {
  const navigate = useNavigate();
  const { layouts, createLayout, deleteLayout } = useLayoutBookStore();
  const [name, setName] = useState("");
  const [layoutType, setLayoutType] = useState<"standard" | "alternate">("standard");

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Layout name required");
      return;
    }

    const items = layoutType === "alternate" ? ALTERNATE_INSTANCE_LAYOUT_ITEMS : DEFAULT_INSTANCE_LAYOUT_ITEMS;
    const orderedItems = [...items].sort((a, b) => (a.y - b.y) || (a.x - b.x) || a.id.localeCompare(b.id));
    const panels = orderedItems.map((item) => DEFAULT_INSTANCE_PANEL_TYPES[item.id] ?? "empty");

    createLayout({
      name: trimmed,
      title: trimmed,
      description: "",
      icon: "INV_Misc_Book_09",
      layout: layoutType,
      items: orderedItems,
      panels,
    });

    setName("");
    toast.success("Layout created", { description: trimmed });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Layout Book</h2>
        <p className="text-muted-foreground">
          Manage your saved layouts here. This currently uses a frontend stub datastore while Postgres APIs are being wired.
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="font-medium flex items-center gap-2"><Save className="h-4 w-4" />Create layout</h3>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Layout name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-w-[240px] max-w-sm"
          />
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={layoutType}
            onChange={(event) => setLayoutType(event.target.value as "standard" | "alternate")}
          >
            <option value="standard">Standard</option>
            <option value="alternate">Alternate</option>
          </select>
          <Button onClick={handleCreate}>Create</Button>
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="p-4 border-b">
          <h3 className="font-medium">Saved layouts ({layouts.length})</h3>
        </div>
        <div className="divide-y">
          {layouts.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No saved layouts yet.</div>
          ) : (
            layouts.map((layout) => (
              <div key={layout.id} className="p-3 sm:p-4">
                <div className="group inline-flex items-start gap-3 text-left rounded-md px-1.5 py-1 hover:bg-muted/30 transition-colors">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="shrink-0">
                        <div className="h-12 w-12 rounded-sm border-2 border-amber-900/70 bg-amber-950/40 shadow-inner overflow-hidden">
                          <img
                            src={getSpellIconUrl(buildLayoutSpellTooltip(layout).spell_icon)}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="p-0 bg-transparent border-0" hideArrow>
                      <SpellTooltip spell={buildLayoutSpellTooltip(layout)} />
                    </TooltipContent>
                  </Tooltip>

                  <div className="min-w-0">
                    <div className="text-lg leading-none font-medium text-amber-100 tracking-tight [text-shadow:0_1px_0_rgba(0,0,0,0.65)]">
                      {layout.title || layout.name}
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <Button
                        variant="destructive"
                        size="icon"
                        className="h-7 w-7"
                        title="Delete layout"
                        onClick={() => {
                          const confirmed = window.confirm(`Delete layout "${layout.name}"? This cannot be undone.`);
                          if (!confirmed) return;
                          deleteLayout(layout.id);
                          toast.success("Layout deleted", { description: layout.title || layout.name });
                        }}
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        title="Share layout"
                        onClick={() => {
                          toast.message("Share coming soon", { description: layout.title || layout.name });
                        }}
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        title="Edit layout"
                        onClick={() => {
                          navigate(`/account/layout-lab?layoutId=${layout.id}`);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
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

function buildPanelTypesById(items: GridEditorItem[], panels: EventsPanelType[]): Record<string, EventsPanelType> {
  const next: Record<string, EventsPanelType> = {};
  items.forEach((item, idx) => {
    const type = panels[idx] ?? "empty";
    next[item.id] = type in PANELS ? type : "empty";
  });
  return next;
}

export function LayoutLabSettings() {
  const [searchParams] = useSearchParams();
  const editingLayoutID = searchParams.get("layoutId");
  const { layouts, updateLayout } = useLayoutBookStore();
  const editingLayout = useMemo(
    () => layouts.find((layout) => layout.id === editingLayoutID) ?? null,
    [layouts, editingLayoutID],
  );

  const [metaTitle, setMetaTitle] = useState("Layout");
  const [metaDescription, setMetaDescription] = useState("");
  const [iconSearch, setIconSearch] = useState("");
  const [iconPage, setIconPage] = useState(0);
  const [metaIcon, setMetaIcon] = useState("INV_Misc_Book_09");
  const [iconOptions, setIconOptions] = useState<string[]>([]);

  const [items, setItems] = useState<GridEditorItem[]>(DEFAULT_INSTANCE_LAYOUT_ITEMS);
  const [panelTypesById, setPanelTypesById] = useState<Record<string, EventsPanelType>>(DEFAULT_INSTANCE_PANEL_TYPES);
  const [instanceReferenceInput, setInstanceReferenceInput] = useState("");
  const [instanceReference, setInstanceReference] = useState("");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const filteredIcons = useMemo(() => {
    const source = iconOptions.length > 0 ? iconOptions : [metaIcon];
    const q = iconSearch.trim().toLowerCase();
    if (!q) return source;
    return source.filter((icon) => icon.toLowerCase().includes(q));
  }, [iconOptions, metaIcon, iconSearch]);

  const iconPageCount = Math.max(1, Math.ceil(filteredIcons.length / ICON_PAGE_SIZE));

  const pagedIcons = useMemo(() => {
    const start = iconPage * ICON_PAGE_SIZE;
    return filteredIcons.slice(start, start + ICON_PAGE_SIZE);
  }, [filteredIcons, iconPage]);

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

  useEffect(() => {
    void fetch("https://icons.chronicleclassic.com/icon-list.json")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setIconOptions(data.filter((v): v is string => typeof v === "string"));
          return;
        }
        if (data && typeof data === "object" && "names" in data) {
          const names = (data as { names?: unknown }).names;
          if (Array.isArray(names)) {
            setIconOptions(names.filter((v): v is string => typeof v === "string"));
            return;
          }
        }
        setIconOptions([]);
      })
      .catch(() => setIconOptions([]));
  }, []);

  useEffect(() => {
    if (!editingLayout) return;
    setItems(editingLayout.items);
    setPanelTypesById(buildPanelTypesById(editingLayout.items, editingLayout.panels));
    setMetaTitle(editingLayout.title || editingLayout.name);
    setMetaDescription(editingLayout.description ?? "");
    setMetaIcon(editingLayout.icon || "INV_Misc_Book_09");
  }, [editingLayout]);

  const handleSaveMetadata = () => {
    if (!editingLayout) {
      toast.error("Open a layout from Layout Book to edit metadata.");
      return;
    }

    updateLayout(editingLayout.id, {
      name: metaTitle.trim() || editingLayout.name,
      title: metaTitle.trim() || editingLayout.title,
      description: metaDescription,
      icon: metaIcon,
      items,
      panels: items.map((item) => panelTypesById[item.id] ?? "empty"),
    });
    toast.success("Layout updated", { description: metaTitle.trim() || editingLayout.title });
  };

  useEffect(() => {
    setIconPage(0);
  }, [iconSearch]);

  useEffect(() => {
    if (iconPage > iconPageCount - 1) {
      setIconPage(Math.max(0, iconPageCount - 1));
    }
  }, [iconPage, iconPageCount]);

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
        minH: 4,
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
        <h3 className="text-sm font-medium">Metadata</h3>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Title</label>
          <div className="flex items-center gap-2">
            <img
              src={getSpellIconUrl({ ID: 1, TextureFilename: metaIcon || "INV_Misc_Book_09" })}
              alt=""
              className="h-8 w-8 rounded border border-border"
            />
            <Input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder="Layout title" />
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2 items-start">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Description</label>
            <textarea
              className="min-h-[223px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              placeholder="Describe what this layout is for"
            />

            <div className="flex items-center gap-2 pt-1">
              <Button type="button" onClick={handleSaveMetadata} className="gap-1.5">
                <Save className="h-4 w-4" />
                Save Metadata
              </Button>
              {editingLayout ? (
                <span className="text-xs text-muted-foreground">Editing: {editingLayout.title || editingLayout.name}</span>
              ) : (
                <span className="text-xs text-muted-foreground">Open from Layout Book → Edit to modify a saved layout.</span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Icon</label>
            <div className="space-y-2 rounded-md border border-border/70 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={iconSearch}
                  onChange={(e) => setIconSearch(e.target.value)}
                  placeholder="Search icons (e.g. INV_Misc_Book_09)"
                  className="min-w-[260px] flex-1"
                />
                <div className="text-xs text-muted-foreground">
                  {filteredIcons.length} icons • Page {iconPage + 1}/{iconPageCount}
                </div>
              </div>

              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
                {pagedIcons.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    title={icon}
                    onClick={() => setMetaIcon(icon)}
                    className={`h-9 w-9 rounded border p-0.5 ${metaIcon === icon ? "border-primary bg-primary/10" : "border-border hover:border-primary/60"}`}
                  >
                    <img src={getSpellIconUrl({ ID: 1, TextureFilename: icon })} alt="" className="h-full w-full rounded object-cover" />
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIconPage((p) => Math.max(0, p - 1))}
                  disabled={iconPage === 0}
                  className="gap-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </Button>
                <span className="text-xs text-muted-foreground">Selected: {metaIcon}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIconPage((p) => Math.min(iconPageCount - 1, p + 1))}
                  disabled={iconPage >= iconPageCount - 1}
                  className="gap-1"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {!instanceId ? (
            <>
              <Input
                id="instance-reference"
                className="min-w-[280px] flex-1"
                placeholder="Reference instance URL or ID"
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
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Using reference: {instanceId}</div>
          )}

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
