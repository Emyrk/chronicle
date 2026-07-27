import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, FlaskConical, Search, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip/SpellIdTooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { iconUrl } from "@/config/iconUrl";
import { useDatasetId, useIconBaseUrl } from "@/hooks/useDatasetId";

interface ConsumableBuff {
  id: number;
  name: string;
}

interface ConsumableEntry {
  item_id: number;
  item_name: string;
  item_quality: number;
  item_icon: string;
  item_spell_ids: number[];
  buffs: ConsumableBuff[];
}

const QUALITY_COLORS: Record<number, string> = {
  0: "text-quality-poor",
  1: "text-quality-common",
  2: "text-quality-uncommon",
  3: "text-quality-rare",
  4: "text-quality-epic",
  5: "text-quality-legendary",
  6: "text-quality-artifact",
};

function useConsumables() {
  const datasetId = useDatasetId();
  return useQuery({
    queryKey: ["wowdb", "consumables", datasetId ?? "default"],
    queryFn: async () => {
      const params = datasetId ? `?dataset_id=${encodeURIComponent(datasetId)}` : "";
      const response = await fetch(`/api/v1/wowdb/consumables${params}`);
      if (!response.ok) throw new Error("Failed to fetch consumables");
      return response.json() as Promise<ConsumableEntry[]>;
    },
    staleTime: 5 * 60 * 1000,
  });
}

type ViewMode = "item" | "buff" | "spellcast";

interface BuffGroup extends ConsumableBuff {
  items: ConsumableEntry[];
}

interface SpellcastGroup {
  spellId: number;
  items: ConsumableEntry[];
}

function matchesItem(consumable: ConsumableEntry, query: string): boolean {
  return (
    consumable.item_name.toLowerCase().includes(query) ||
    consumable.item_id.toString().includes(query) ||
    consumable.item_spell_ids.some((id) => id.toString().includes(query)) ||
    consumable.buffs.some(
      (buff) => buff.name.toLowerCase().includes(query) || buff.id.toString().includes(query),
    )
  );
}

function ItemReference({
  consumable,
  iconBaseUrl,
  compact = false,
}: {
  consumable: ConsumableEntry;
  iconBaseUrl?: string;
  compact?: boolean;
}) {
  return (
    <Link
      to={`/wowdb/item?id=${consumable.item_id}`}
      className={`group flex min-w-0 items-center gap-2 ${compact ? "rounded-md border border-border/60 bg-muted/30 px-2 py-1" : ""}`}
    >
      {consumable.item_icon ? (
        <img
          src={iconUrl(consumable.item_icon, iconBaseUrl)}
          alt=""
          className={`${compact ? "h-6 w-6" : "h-8 w-8"} rounded border border-border/70 bg-black/30`}
          loading="lazy"
        />
      ) : (
        <div
          className={`flex ${compact ? "h-6 w-6" : "h-8 w-8"} items-center justify-center rounded border border-border/70 bg-muted`}
        >
          <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0">
        <div
          className={`truncate font-medium ${compact ? "text-xs" : "text-sm"} ${QUALITY_COLORS[consumable.item_quality] ?? ""}`}
        >
          {consumable.item_name}
        </div>
        <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
          {consumable.item_id}
          <ExternalLink className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>
    </Link>
  );
}

function SpellReference({ spellId, name }: { spellId: number; name?: string }) {
  return (
    <Link
      to={`/wowdb/spell/${spellId}`}
      className="inline-flex rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-muted-foreground hover:text-foreground"
    >
      <SpellIdTooltip
        spellId={spellId}
        name={name ?? spellId.toString()}
        size={14}
        className={name ? "text-xs" : "font-mono text-[11px]"}
      />
    </Link>
  );
}

export function ConsumablesPage() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("item");
  const iconBaseUrl = useIconBaseUrl();
  const { data, isLoading, error } = useConsumables();
  const consumables = useMemo(() => data ?? [], [data]);

  const buffGroups = useMemo<BuffGroup[]>(() => {
    const byBuff = new Map<number, BuffGroup>();
    for (const item of consumables) {
      for (const buff of item.buffs) {
        const group = byBuff.get(buff.id);
        if (group) {
          group.items.push(item);
        } else {
          byBuff.set(buff.id, { ...buff, items: [item] });
        }
      }
    }
    return [...byBuff.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  }, [consumables]);

  const spellcastGroups = useMemo<SpellcastGroup[]>(() => {
    const bySpellcast = new Map<number, SpellcastGroup>();
    for (const item of consumables) {
      for (const spellId of item.item_spell_ids) {
        const group = bySpellcast.get(spellId);
        if (group) {
          group.items.push(item);
        } else {
          bySpellcast.set(spellId, { spellId, items: [item] });
        }
      }
    }
    return [...bySpellcast.values()].sort((a, b) => a.spellId - b.spellId);
  }, [consumables]);

  const query = search.trim().toLowerCase();
  const filteredItems = useMemo(
    () => (query ? consumables.filter((item) => matchesItem(item, query)) : consumables),
    [consumables, query],
  );
  const filteredBuffs = useMemo(
    () =>
      query
        ? buffGroups.filter(
            (buff) =>
              buff.name.toLowerCase().includes(query) ||
              buff.id.toString().includes(query) ||
              buff.items.some((item) => matchesItem(item, query)),
          )
        : buffGroups,
    [buffGroups, query],
  );
  const filteredSpellcasts = useMemo(
    () =>
      query
        ? spellcastGroups.filter(
            (spellcast) =>
              spellcast.spellId.toString().includes(query) ||
              spellcast.items.some((item) => matchesItem(item, query)),
          )
        : spellcastGroups,
    [query, spellcastGroups],
  );

  const visibleCount =
    view === "item"
      ? filteredItems.length
      : view === "buff"
        ? filteredBuffs.length
        : filteredSpellcasts.length;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-4">
      <Link
        to="/technical"
        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back
      </Link>

      <div className="mb-1 flex flex-wrap items-center gap-2">
        <FlaskConical className="h-5 w-5" />
        <h1 className="text-xl font-bold">Consumables</h1>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {consumables.length.toLocaleString()} items
        </span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
          {buffGroups.length.toLocaleString()} unique buffs
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {spellcastGroups.length.toLocaleString()} item spells
        </span>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        Generated from the current tenant&apos;s item and spell dataset. Item spells are the root
        spells attached to an item and are candidates for cast evidence; their trigger chains are
        followed to find applied buffs. A combat-log item ID remains stronger evidence than the
        spell alone.
      </p>

      <Tabs value={view} onValueChange={(value) => setView(value as ViewMode)}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <TabsList>
            <TabsTrigger value="item">By Item</TabsTrigger>
            <TabsTrigger value="buff">By Buff</TabsTrigger>
            <TabsTrigger value="spellcast">By Spellcast</TabsTrigger>
          </TabsList>
          <div className="relative min-w-64 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search item, buff, or spell ID..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-md border bg-background py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          {search && (
            <span className="text-xs text-muted-foreground">{visibleCount} results</span>
          )}
        </div>

        {view === "item" && (
          <Card className="max-h-[75vh] divide-y divide-border/30 overflow-auto styled-scrollbar">
            <div className="sticky top-0 z-10 grid grid-cols-[72px_minmax(220px,1fr)_minmax(180px,0.8fr)_minmax(260px,1.2fr)] bg-muted/70 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
              <span>Item ID</span>
              <span>Consumable</span>
              <span>Item spellcasts</span>
              <span>Applied buffs</span>
            </div>
            {renderState(isLoading, error, filteredItems.length, "items", () =>
              filteredItems.map((item) => (
                <div
                  key={item.item_id}
                  className="grid grid-cols-[72px_minmax(220px,1fr)_minmax(180px,0.8fr)_minmax(260px,1.2fr)] items-start px-3 py-2.5 hover:bg-muted/35"
                >
                  <span className="pt-1 font-mono text-xs text-muted-foreground">{item.item_id}</span>
                  <ItemReference consumable={item} iconBaseUrl={iconBaseUrl} />
                  <div className="flex flex-wrap gap-1 pr-3">
                    {item.item_spell_ids.map((spellId) => (
                      <SpellReference key={spellId} spellId={spellId} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.buffs.length === 0 ? (
                      <span className="pt-1 text-xs text-muted-foreground">No applied aura found</span>
                    ) : (
                      item.buffs.map((buff) => (
                        <SpellReference key={buff.id} spellId={buff.id} name={buff.name} />
                      ))
                    )}
                  </div>
                </div>
              )),
            )}
          </Card>
        )}

        {view === "buff" && (
          <Card className="max-h-[75vh] divide-y divide-border/30 overflow-auto styled-scrollbar">
            <div className="sticky top-0 z-10 grid grid-cols-[80px_minmax(240px,0.8fr)_minmax(0,1.8fr)] bg-muted/70 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
              <span>Buff ID</span>
              <span>Applied buff</span>
              <span>Consumable items</span>
            </div>
            {renderState(isLoading, error, filteredBuffs.length, "buffs", () =>
              filteredBuffs.map((buff) => (
                <div
                  key={buff.id}
                  className="grid grid-cols-[80px_minmax(240px,0.8fr)_minmax(0,1.8fr)] items-start px-3 py-2.5 hover:bg-muted/35"
                >
                  <span className="pt-1 font-mono text-xs text-muted-foreground">{buff.id}</span>
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <SpellReference spellId={buff.id} name={buff.name} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {buff.items.map((item) => (
                      <ItemReference
                        key={item.item_id}
                        consumable={item}
                        iconBaseUrl={iconBaseUrl}
                        compact
                      />
                    ))}
                  </div>
                </div>
              )),
            )}
          </Card>
        )}

        {view === "spellcast" && (
          <Card className="max-h-[75vh] divide-y divide-border/30 overflow-auto styled-scrollbar">
            <div className="sticky top-0 z-10 grid grid-cols-[80px_minmax(220px,0.8fr)_minmax(0,1.3fr)_minmax(240px,1fr)] bg-muted/70 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
              <span>Spell ID</span>
              <span>Item spell</span>
              <span>Consumable items</span>
              <span>Applied buffs</span>
            </div>
            {renderState(isLoading, error, filteredSpellcasts.length, "spellcasts", () =>
              filteredSpellcasts.map((spellcast) => {
                const buffs = Array.from(
                  new Map(
                    spellcast.items.flatMap((item) => item.buffs).map((buff) => [buff.id, buff]),
                  ).values(),
                ).sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
                return (
                  <div
                    key={spellcast.spellId}
                    className="grid grid-cols-[80px_minmax(220px,0.8fr)_minmax(0,1.3fr)_minmax(240px,1fr)] items-start px-3 py-2.5 hover:bg-muted/35"
                  >
                    <span className="pt-1 font-mono text-xs text-muted-foreground">
                      {spellcast.spellId}
                    </span>
                    <SpellReference spellId={spellcast.spellId} />
                    <div className="flex flex-wrap gap-1.5 pr-3">
                      {spellcast.items.map((item) => (
                        <ItemReference
                          key={item.item_id}
                          consumable={item}
                          iconBaseUrl={iconBaseUrl}
                          compact
                        />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {buffs.length === 0 ? (
                        <span className="pt-1 text-xs text-muted-foreground">No applied aura found</span>
                      ) : (
                        buffs.map((buff) => (
                          <SpellReference key={buff.id} spellId={buff.id} name={buff.name} />
                        ))
                      )}
                    </div>
                  </div>
                );
              }),
            )}
          </Card>
        )}
      </Tabs>
    </div>
  );
}

function renderState(
  isLoading: boolean,
  error: Error | null,
  rowCount: number,
  noun: string,
  renderRows: () => React.ReactNode,
): React.ReactNode {
  if (isLoading) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Loading consumables…</div>;
  }
  if (error) {
    return (
      <div className="p-6 text-center text-sm text-destructive">
        Failed to load the tenant&apos;s consumable data.
      </div>
    );
  }
  if (rowCount === 0) {
    return (
      <div className="p-8 text-center">
        <FlaskConical className="mx-auto mb-2 h-7 w-7 text-muted-foreground/60" />
        <p className="text-sm font-medium">No {noun} found</p>
        <p className="mx-auto mt-1 max-w-lg text-xs text-muted-foreground">
          Re-upload the tenant dataset&apos;s Item WDB or Spell DBC to rebuild these mappings.
        </p>
      </div>
    );
  }
  return renderRows();
}
