import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, Search, Swords } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip/SpellIdTooltip";

interface ExtraAttackSpellEntry {
  id: number;
  name: string;
  numExtraAttacks: number;
}

function useExtraAttackSpells() {
  return useQuery({
    queryKey: ["wowdb", "extra-attack-spells"],
    queryFn: async () => {
      const res = await fetch("/api/v1/wowdb/extra-attack-spells");
      if (!res.ok) throw new Error("Failed to fetch extra attack spells");
      return res.json() as Promise<ExtraAttackSpellEntry[]>;
    },
    staleTime: 24 * 60 * 60 * 1000, // 24h — static data
  });
}

export function ExtraAttackSpellsPage() {
  const [search, setSearch] = useState("");
  const { data: spellsData, isLoading } = useExtraAttackSpells();

  const spells = useMemo(() => spellsData ?? [], [spellsData]);

  const filteredSpells = useMemo(() => {
    if (!search.trim()) return spells;

    const lowerSearch = search.toLowerCase();
    return spells.filter(
      (spell) =>
        spell.name.toLowerCase().includes(lowerSearch) || spell.id.toString().includes(search)
    );
  }, [spells, search]);

  const sortedSpells = useMemo(() => {
    return [...filteredSpells].sort((a, b) => {
      const nameCompare = a.name.localeCompare(b.name);
      if (nameCompare !== 0) return nameCompare;
      return a.id - b.id;
    });
  }, [filteredSpells]);

  return (
    <div className="container mx-auto px-4 py-4 max-w-4xl">
      <Link
        to="/technical"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
      >
        <ArrowLeft className="h-3 w-3" />
        Back
      </Link>

      <div className="flex items-center gap-2 mb-3">
        <Swords className="h-5 w-5" />
        <h1 className="text-xl font-bold">Extra Attack Spells</h1>
        <span className="text-sm text-muted-foreground">({spells.length.toLocaleString()})</span>
      </div>

      <div className="flex gap-3 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-md border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {search && (
          <span className="text-xs text-muted-foreground self-center">
            {filteredSpells.length} results
          </span>
        )}
      </div>

      <Card className="divide-y divide-border/30 max-h-[75vh] overflow-auto styled-scrollbar">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>
        ) : sortedSpells.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">No spells match your search.</div>
        ) : (
          sortedSpells.map((spell) => (
            <a
              key={spell.id}
              href={`/wowdb/spell/${spell.id}`}
              className="flex items-center justify-between px-2 py-1.5 hover:bg-muted/50 transition-colors group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-xs text-muted-foreground w-14 shrink-0">{spell.id}</span>
                <SpellIdTooltip
                  spellId={spell.id}
                  name={spell.name}
                  size={16}
                  className="text-sm truncate"
                />
                <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                  +{spell.numExtraAttacks} atk
                </span>
              </div>
              <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
            </a>
          ))
        )}
      </Card>
    </div>
  );
}
