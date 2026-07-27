import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, Clock, ExternalLink, Search } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip/SpellIdTooltip";
import { useDatasetId } from "@/hooks/useDatasetId";

type ViewMode = "by-spell" | "by-modifier";

type DurationModifierRef = {
  spellId: number;
  name: string;
  percent: number;
  flat: number;
  deprecated: boolean;
};

type AffectedSpell = {
  id: number;
  name: string;
  spellClassSet: number;
  baseDurationMs: number;
  maxDurationMs: number;
  deprecated: boolean;
  modifiers: DurationModifierRef[];
};

type AffectedAuraDurationResponse = {
  spell_id: number;
  name: string;
  spell_class_set: number;
  base_duration_ms: number;
  max_duration_ms: number;
  deprecated: boolean;
  modifiers: {
    spell_id: number;
    name: string;
    percent: number;
    flat: number;
    deprecated: boolean;
  }[];
};

function useAffectedAuraDurations() {
  const datasetId = useDatasetId();
  return useQuery({
    queryKey: ["wowdb", "aura-duration-modifiers", datasetId ?? "default"],
    queryFn: async () => {
      const params = datasetId ? `?dataset_id=${encodeURIComponent(datasetId)}` : "";
      const response = await fetch(`/api/v1/wowdb/aura-duration-modifiers${params}`);
      if (!response.ok) throw new Error("Failed to fetch aura duration modifiers");
      const data = (await response.json()) as AffectedAuraDurationResponse[];
      return data.map<AffectedSpell>((spell) => ({
        id: spell.spell_id,
        name: spell.name,
        spellClassSet: spell.spell_class_set,
        baseDurationMs: spell.base_duration_ms,
        maxDurationMs: spell.max_duration_ms,
        deprecated: spell.deprecated,
        modifiers: spell.modifiers.map((modifier) => ({
          spellId: modifier.spell_id,
          name: modifier.name,
          percent: modifier.percent,
          flat: modifier.flat,
          deprecated: modifier.deprecated,
        })),
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

const CLASS_NAMES: Record<number, string> = {
  0: "Generic",
  3: "Mage",
  4: "Warrior",
  5: "Warlock",
  6: "Priest",
  7: "Druid",
  8: "Rogue",
  9: "Hunter",
  10: "Paladin",
  11: "Shaman",
  15: "Death Knight",
};

function formatDuration(ms: number): string {
  if (ms < 0) return "permanent";
  if (ms === 0) return "instant";
  const secs = ms / 1000;
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  if (rem === 0) return `${mins}m`;
  return `${mins}m ${rem}s`;
}

function modLabel(mod: DurationModifierRef): string {
  if (mod.percent !== 0) return `${mod.percent > 0 ? "+" : ""}${mod.percent}%`;
  if (mod.flat !== 0) return `${mod.flat > 0 ? "+" : ""}${formatDuration(mod.flat)}`;
  return "0";
}

function modClassName(mod: DurationModifierRef): string {
  const val = mod.percent || mod.flat;
  if (val > 0) return "text-green-400";
  if (val < 0) return "text-red-400";
  return "text-muted-foreground";
}

// Inverted view: modifier -> affected spells
type ModifierWithTargets = DurationModifierRef & {
  targets: { id: number; name: string; spellClassSet: number; baseDurationMs: number }[];
};

function useModifierView(spells: AffectedSpell[]) {
  return useMemo(() => {
    const map = new Map<number, ModifierWithTargets>();
    for (const spell of spells) {
      for (const mod of spell.modifiers) {
        let entry = map.get(mod.spellId);
        if (!entry) {
          entry = { ...mod, targets: [] };
          map.set(mod.spellId, entry);
        }
        entry.targets.push({ id: spell.id, name: spell.name, spellClassSet: spell.spellClassSet, baseDurationMs: spell.baseDurationMs });
      }
    }
    // Sort targets within each modifier
    for (const entry of map.values()) {
      entry.targets.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name) || a.spellId - b.spellId);
  }, [spells]);
}

export function AuraDurationModifiersPage() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("by-spell");
  const [expandedModifier, setExpandedModifier] = useState<number | null>(null);
  const [classFilter, setClassFilter] = useState<number | null>(null);
  const { data, isLoading, error } = useAffectedAuraDurations();

  // By-spell data
  const spells = useMemo(() => data ?? [], [data]);

  const filteredSpells = useMemo(() => {
    let result = spells;
    if (classFilter !== null) {
      result = result.filter((s) => s.spellClassSet === classFilter);
    }
    if (search.trim()) {
      const lower = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(lower) ||
          s.id.toString().includes(search) ||
          s.modifiers.some((m) => m.name.toLowerCase().includes(lower) || m.spellId.toString().includes(search))
      );
    }
    return result;
  }, [spells, search, classFilter]);

  const sortedSpells = useMemo(() => {
    return [...filteredSpells].sort((a, b) => {
      const nameCompare = a.name.localeCompare(b.name);
      if (nameCompare !== 0) return nameCompare;
      return a.id - b.id;
    });
  }, [filteredSpells]);

  // By-modifier data
  const modifiers = useModifierView(spells);

  const filteredModifiers = useMemo(() => {
    let result = modifiers;
    if (classFilter !== null) {
      result = result.filter((m) => m.targets.some((t) => t.spellClassSet === classFilter));
    }
    if (search.trim()) {
      const lower = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(lower) ||
          m.spellId.toString().includes(search) ||
          m.targets.some((t) => t.name.toLowerCase().includes(lower) || t.id.toString().includes(search))
      );
    }
    return result;
  }, [modifiers, search, classFilter]);

  // Collect distinct classes present in the data.
  const availableClasses = useMemo(() => {
    const classIds = new Set(spells.map((s) => s.spellClassSet));
    return [...classIds].sort((a, b) => a - b);
  }, [spells]);

  const itemCount = view === "by-spell" ? spells.length : modifiers.length;
  const filteredCount = view === "by-spell" ? filteredSpells.length : filteredModifiers.length;

  return (
    <div className="container mx-auto px-4 py-4 max-w-4xl">
      <Link
        to="/technical"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
      >
        <ArrowLeft className="h-3 w-3" />
        Back
      </Link>

      <div className="flex items-center gap-2 mb-1">
        <Clock className="h-5 w-5" />
        <h1 className="text-xl font-bold">Aura Duration Modifiers</h1>
        <span className="text-sm text-muted-foreground">({itemCount.toLocaleString()})</span>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        Generated from the current tenant&apos;s spell and spell-duration dataset. {view === "by-spell"
          ? "Shows each affected spell, its base and theoretical maximum duration, and every applicable modifier."
          : "Shows passive duration modifiers and the spells they affect."}
      </p>

      <div className="flex gap-3 mb-3">
        <div className="inline-flex rounded-md border text-xs">
          <button
            onClick={() => { setView("by-spell"); setSearch(""); }}
            className={`px-2.5 py-1 rounded-l-md transition-colors ${view === "by-spell" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            By Spell
          </button>
          <button
            onClick={() => { setView("by-modifier"); setSearch(""); setExpandedModifier(null); }}
            className={`px-2.5 py-1 rounded-r-md transition-colors ${view === "by-modifier" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            By Modifier
          </button>
        </div>
        <select
          value={classFilter ?? ""}
          onChange={(e) => setClassFilter(e.target.value === "" ? null : Number(e.target.value))}
          className="rounded-md border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All Classes</option>
          {availableClasses.map((id) => (
            <option key={id} value={id}>{CLASS_NAMES[id] ?? `Class ${id}`}</option>
          ))}
        </select>
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder={view === "by-spell" ? "Search by spell name, ID, or modifier name..." : "Search by modifier name, ID, or affected spell..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-md border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {search && (
          <span className="text-xs text-muted-foreground self-center">{filteredCount} results</span>
        )}
      </div>

      <Card className="divide-y divide-border/30 max-h-[75vh] overflow-auto styled-scrollbar">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading aura duration modifiers...</div>
        ) : error ? (
          <div className="p-4 text-center text-sm text-destructive">Failed to load aura duration modifiers.</div>
        ) : view === "by-spell" ? (
          sortedSpells.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {search || classFilter !== null
                ? "No spells match your filters."
                : "No affected aura durations are available for this dataset."}
            </div>
          ) : (
            sortedSpells.map((spell) => (
              <div key={spell.id} className={`px-3 py-2 hover:bg-muted/50 transition-colors ${spell.deprecated ? "opacity-40" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground w-14 shrink-0">{spell.id}</span>
                  <SpellIdTooltip spellId={spell.id} name={spell.name} size={16} className="text-sm font-medium" />
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                    {formatDuration(spell.baseDurationMs)}
                  </span>
                  {spell.maxDurationMs !== spell.baseDurationMs && (
                    <>
                      <span className="text-[10px] text-muted-foreground">→</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 shrink-0">
                        {formatDuration(spell.maxDurationMs)}
                      </span>
                    </>
                  )}
                  <a href={`/wowdb/spell/${spell.id}`} className="ml-auto shrink-0">
                    <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity" />
                  </a>
                </div>
                <div className="ml-16 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  {spell.modifiers.map((mod) => (
                    <span key={mod.spellId} className={`inline-flex items-center gap-1 text-[11px] ${mod.deprecated ? "opacity-40 line-through" : ""}`}>
                      <span className={modClassName(mod)}>{modLabel(mod)}</span>
                      <a
                        href={`/wowdb/spell/${mod.spellId}`}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {mod.name}
                        <span className="text-[10px] ml-0.5 opacity-60">#{mod.spellId}</span>
                      </a>
                    </span>
                  ))}
                </div>
              </div>
            ))
          )
        ) : (
          filteredModifiers.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {search || classFilter !== null
                ? "No modifiers match your filters."
                : "No aura duration modifiers are available for this dataset."}
            </div>
          ) : (
            filteredModifiers.map((mod) => {
              const isExpanded = expandedModifier === mod.spellId;
              return (
                <div key={mod.spellId} className={mod.deprecated ? "opacity-40" : ""}>
                  <button
                    onClick={() => setExpandedModifier(isExpanded ? null : mod.spellId)}
                    className="w-full px-3 py-2 hover:bg-muted/50 transition-colors text-left flex items-center gap-2"
                  >
                    <span className="text-[10px] select-none opacity-50 w-4 shrink-0">{isExpanded ? "▼" : "▶"}</span>
                    <span className="font-mono text-xs text-muted-foreground w-14 shrink-0">{mod.spellId}</span>
                    <SpellIdTooltip spellId={mod.spellId} name={mod.name} size={16} className="text-sm font-medium" />
                    <span className={`text-xs font-medium shrink-0 ${modClassName(mod)}`}>{modLabel(mod)}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0 ml-auto">
                      {mod.targets.length} spell{mod.targets.length !== 1 ? "s" : ""}
                    </span>
                    <a
                      href={`/wowdb/spell/${mod.spellId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
                      title="View spell details"
                    >
                      <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </a>
                  </button>
                  {isExpanded && (
                    <div className="bg-muted/30 border-t border-border/20 divide-y divide-border/10">
                      {mod.targets.map((target) => (
                        <a
                          key={target.id}
                          href={`/wowdb/spell/${target.id}`}
                          className="flex items-center gap-2 pl-10 pr-3 py-1.5 hover:bg-muted/50 transition-colors group"
                        >
                          <span className="font-mono text-xs text-muted-foreground w-14 shrink-0">{target.id}</span>
                          <SpellIdTooltip spellId={target.id} name={target.name} size={14} className="text-xs" />
                          <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                            {formatDuration(target.baseDurationMs)}
                          </span>
                          <ExternalLink className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-auto" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )
        )}
      </Card>
    </div>
  );
}
