import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, FlaskConical, Search, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip/SpellIdTooltip";
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

export function ConsumablesPage() {
  const [search, setSearch] = useState("");
  const iconBaseUrl = useIconBaseUrl();
  const { data, isLoading, error } = useConsumables();
  const consumables = useMemo(() => data ?? [], [data]);

  const buffCount = useMemo(
    () => consumables.reduce((total, consumable) => total + consumable.buffs.length, 0),
    [consumables],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return consumables;
    return consumables.filter((consumable) =>
      consumable.item_name.toLowerCase().includes(query) ||
      consumable.item_id.toString().includes(query) ||
      consumable.item_spell_ids.some((id) => id.toString().includes(query)) ||
      consumable.buffs.some(
        (buff) => buff.name.toLowerCase().includes(query) || buff.id.toString().includes(query),
      ),
    );
  }, [consumables, search]);

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
          {buffCount.toLocaleString()} linked buffs
        </span>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        Generated from the current tenant&apos;s item and spell dataset. Item spells are the root
        spells attached to the item; their trigger chains are followed to find applied buffs.
      </p>

      <div className="mb-3 flex gap-3">
        <div className="relative flex-1">
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
          <span className="self-center text-xs text-muted-foreground">
            {filtered.length} results
          </span>
        )}
      </div>

      <Card className="max-h-[75vh] divide-y divide-border/30 overflow-auto styled-scrollbar">
        <div className="sticky top-0 z-10 grid grid-cols-[72px_minmax(220px,1fr)_minmax(180px,0.8fr)_minmax(260px,1.2fr)] bg-muted/70 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
          <span>Item ID</span>
          <span>Consumable</span>
          <span>Item spells</span>
          <span>Applied buffs</span>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Loading consumables…</div>
        ) : error ? (
          <div className="p-6 text-center text-sm text-destructive">
            Failed to load the tenant&apos;s consumable data.
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <FlaskConical className="mx-auto mb-2 h-7 w-7 text-muted-foreground/60" />
            <p className="text-sm font-medium">No generated consumables found</p>
            <p className="mx-auto mt-1 max-w-lg text-xs text-muted-foreground">
              Re-upload the tenant dataset&apos;s Item WDB or Spell DBC to rebuild this table. The
              upload performed second links consumable items to their applied buffs.
            </p>
          </div>
        ) : (
          filtered.map((consumable) => (
            <div
              key={consumable.item_id}
              className="grid grid-cols-[72px_minmax(220px,1fr)_minmax(180px,0.8fr)_minmax(260px,1.2fr)] items-start px-3 py-2.5 hover:bg-muted/35"
            >
              <span className="pt-1 font-mono text-xs text-muted-foreground">
                {consumable.item_id}
              </span>

              <Link
                to={`/wowdb/item?id=${consumable.item_id}`}
                className="group flex min-w-0 items-center gap-2"
              >
                {consumable.item_icon ? (
                  <img
                    src={iconUrl(consumable.item_icon, iconBaseUrl)}
                    alt=""
                    className="h-8 w-8 rounded border border-border/70 bg-black/30"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded border border-border/70 bg-muted">
                    <FlaskConical className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className={`truncate text-sm font-medium ${QUALITY_COLORS[consumable.item_quality] ?? ""}`}>
                    {consumable.item_name}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    Open item
                    <ExternalLink className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </div>
              </Link>

              <div className="flex flex-wrap gap-1 pr-3">
                {consumable.item_spell_ids.map((spellId) => (
                  <Link
                    key={spellId}
                    to={`/wowdb/spell/${spellId}`}
                    className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <SpellIdTooltip
                      spellId={spellId}
                      name={spellId.toString()}
                      size={14}
                      className="font-mono text-[11px]"
                    />
                  </Link>
                ))}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {consumable.buffs.length === 0 ? (
                  <span className="pt-1 text-xs text-muted-foreground">No applied aura found</span>
                ) : (
                  consumable.buffs.map((buff) => (
                    <div
                      key={buff.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2 py-1"
                    >
                      <Sparkles className="h-3 w-3 text-primary" />
                      <SpellIdTooltip
                        spellId={buff.id}
                        name={buff.name}
                        size={14}
                        className="text-xs"
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
