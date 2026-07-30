import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, Search, TimerReset } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip/SpellIdTooltip";
import { useDatasetId } from "@/hooks/useDatasetId";

interface CooldownSpellEntry {
  id: number;
  name: string;
  name_subtext: string;
  cooldown_ms: number;
  recovery_time_ms: number;
  category_recovery_time_ms: number;
}

type CooldownSpellsData = Record<string, CooldownSpellEntry[]>;

function useCooldownSpells() {
  const datasetId = useDatasetId();
  return useQuery({
    queryKey: ["wowdb", "cooldown-spells", datasetId ?? "default"],
    queryFn: async () => {
      const params = datasetId ? `?dataset_id=${encodeURIComponent(datasetId)}` : "";
      const response = await fetch(`/api/v1/wowdb/cooldown-spells${params}`);
      if (!response.ok) throw new Error("Failed to fetch cooldown spells");
      return response.json() as Promise<CooldownSpellsData>;
    },
    staleTime: 24 * 60 * 60 * 1000,
  });
}

function formatCooldown(milliseconds: number): string {
  const totalSeconds = Math.round(milliseconds / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}

export function CooldownSpellsPage() {
  const { data, isLoading, error } = useCooldownSpells();
  const [selectedClass, setSelectedClass] = useState("");
  const [search, setSearch] = useState("");

  const classNames = useMemo(() => Object.keys(data ?? {}).sort(), [data]);
  const activeClass = selectedClass || classNames[0] || "";
  const spells = useMemo(() => data?.[activeClass] ?? [], [activeClass, data]);
  const filteredSpells = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return spells;
    return spells.filter(
      (spell) =>
        spell.name.toLowerCase().includes(query) ||
        spell.name_subtext.toLowerCase().includes(query) ||
        spell.id.toString().includes(query),
    );
  }, [search, spells]);
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
        <TimerReset className="h-5 w-5" />
        <h1 className="text-xl font-bold">Cooldowns</h1>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {totalSpells.toLocaleString()} spells
        </span>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Generated from the current tenant&apos;s spell dataset. Includes active player-class spells
        with an individual or shared cooldown. Every rank remains listed so combat-log spell IDs
        can be matched directly.
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
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search spell, rank, or ID..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-md border bg-background py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {search && (
          <span className="self-center text-xs text-muted-foreground">
            {filteredSpells.length} results
          </span>
        )}
      </div>

      <Card className="max-h-[75vh] divide-y divide-border/30 overflow-auto styled-scrollbar">
        <div className="sticky top-0 z-10 grid grid-cols-[72px_minmax(0,1fr)_110px] bg-muted/80 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
          <span>Spell ID</span>
          <span>Ability</span>
          <span className="text-right">Cooldown</span>
        </div>
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="p-4 text-center text-sm text-destructive">
            Failed to load cooldown data.
          </div>
        ) : classNames.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No cooldown data generated for this dataset yet. Re-import Spell.dbc.
          </div>
        ) : filteredSpells.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No cooldowns match your search.
          </div>
        ) : (
          filteredSpells.map((spell) => (
            <Link
              key={spell.id}
              to={`/wowdb/spell/${spell.id}`}
              className="group grid grid-cols-[72px_minmax(0,1fr)_110px] items-center px-3 py-2 hover:bg-muted/50"
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
              <div className="text-right">
                <div className="font-mono text-sm font-medium">
                  {formatCooldown(spell.cooldown_ms)}
                </div>
                {spell.category_recovery_time_ms > spell.recovery_time_ms && (
                  <div className="text-[10px] text-muted-foreground">shared</div>
                )}
              </div>
            </Link>
          ))
        )}
      </Card>
    </div>
  );
}
