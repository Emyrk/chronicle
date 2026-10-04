import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, Search, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip/SpellIdTooltip";
import { useDatasetId } from "@/hooks/useDatasetId";

interface ClassBuffEffect {
  effect_index: number;
  aura_effect: number;
  aura_name: string;
  implicit_targets: number[];
}

interface ClassBuffSpell {
  id: number;
  name: string;
  name_subtext: string;
  targeting: "friendly" | "group";
  effects: ClassBuffEffect[];
}

type ClassBuffsData = Record<string, ClassBuffSpell[]>;

function useClassBuffs() {
  const datasetId = useDatasetId();
  return useQuery({
    queryKey: ["wowdb", "class-buffs", datasetId ?? "default"],
    queryFn: async () => {
      const params = datasetId ? `?dataset_id=${encodeURIComponent(datasetId)}` : "";
      const response = await fetch(`/api/v1/wowdb/class-buffs${params}`);
      if (response.status === 404) return {};
      if (!response.ok) throw new Error("Failed to fetch class buffs");
      return response.json() as Promise<ClassBuffsData>;
    },
    staleTime: 24 * 60 * 60 * 1000,
  });
}

const TARGETING_LABELS: Record<ClassBuffSpell["targeting"], string> = {
  friendly: "Friendly player",
  group: "Party / raid",
};

export function ClassBuffsPage() {
  const { data, isLoading, error } = useClassBuffs();
  const [selectedClass, setSelectedClass] = useState("");
  const [search, setSearch] = useState("");
  const [targeting, setTargeting] = useState<"all" | ClassBuffSpell["targeting"]>("all");

  const classNames = useMemo(() => Object.keys(data ?? {}).sort(), [data]);
  const activeClass = selectedClass || classNames[0] || "";
  const spells = useMemo(() => data?.[activeClass] ?? [], [activeClass, data]);
  const filteredSpells = useMemo(() => {
    const query = search.trim().toLowerCase();
    return spells.filter((spell) => {
      if (targeting !== "all" && spell.targeting !== targeting) return false;
      if (!query) return true;
      return (
        spell.name.toLowerCase().includes(query) ||
        spell.name_subtext.toLowerCase().includes(query) ||
        spell.id.toString().includes(query)
      );
    });
  }, [search, spells, targeting]);
  const totalSpells = useMemo(
    () => Object.values(data ?? {}).reduce((total, entries) => total + entries.length, 0),
    [data],
  );

  return (
    <div className="container mx-auto max-w-4xl px-4 py-4">
      <Link
        to="/technical"
        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back
      </Link>

      <div className="mb-1 flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-5 w-5" />
        <h1 className="text-xl font-bold">Friendly Class Buffs</h1>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {totalSpells.toLocaleString()} spell ranks
        </span>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Generated from the current tenant&apos;s spell dataset during spell import. Includes
        non-passive player-class spells with an aura effect targeting a friendly player,
        party, or raid. Every rank remains listed for combat-log matching.
      </p>

      <div className="mb-3 flex flex-wrap gap-3">
        <select
          value={activeClass}
          onChange={(event) => {
            setSelectedClass(event.target.value);
            setSearch("");
          }}
          className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {classNames.map((className) => (
            <option key={className} value={className}>
              {className} ({data?.[className]?.length ?? 0})
            </option>
          ))}
        </select>
        <select
          value={targeting}
          onChange={(event) => setTargeting(event.target.value as typeof targeting)}
          className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="all">All targets</option>
          <option value="group">Party / raid</option>
          <option value="friendly">Friendly player</option>
        </select>
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search buff, rank, or ID..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-md border bg-background py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <Card className="max-h-[75vh] divide-y divide-border/30 overflow-auto styled-scrollbar">
        <div className="sticky top-0 z-10 grid grid-cols-[72px_minmax(0,1fr)_130px_80px] bg-muted/80 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
          <span>Spell ID</span>
          <span>Buff</span>
          <span>Target</span>
          <span className="text-right">Auras</span>
        </div>
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="p-4 text-center text-sm text-destructive">
            Failed to load class buff data.
          </div>
        ) : classNames.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No class buff data generated for this dataset yet. Re-import Spell.dbc.
          </div>
        ) : filteredSpells.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No class buffs match these filters.
          </div>
        ) : (
          filteredSpells.map((spell) => (
            <Link
              key={spell.id}
              to={`/wowdb/spell/${spell.id}`}
              className="group grid grid-cols-[72px_minmax(0,1fr)_130px_80px] items-center px-3 py-2 hover:bg-muted/50"
            >
              <span className="font-mono text-xs text-muted-foreground">{spell.id}</span>
              <div className="flex min-w-0 items-center gap-2">
                <SpellIdTooltip
                  spellId={spell.id}
                  name={spell.name}
                  size={16}
                  className="truncate text-sm"
                />
                {spell.name_subtext && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {spell.name_subtext}
                  </span>
                )}
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <span className="text-xs text-muted-foreground">
                {TARGETING_LABELS[spell.targeting]}
              </span>
              <span
                className="truncate text-right text-xs text-muted-foreground"
                title={spell.effects
                  .map((effect) => `${effect.aura_name} (${effect.aura_effect})`)
                  .join(", ")}
              >
                {spell.effects.map((effect) => effect.aura_name).join(", ")}
              </span>
            </Link>
          ))
        )}
      </Card>
    </div>
  );
}
