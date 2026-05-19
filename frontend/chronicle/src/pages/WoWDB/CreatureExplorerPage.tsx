import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Loader2, Skull, X, ArrowUpDown, ArrowDown, ArrowUp } from "lucide-react";
import { useSearchCreatures } from "@/api/gamedata";
import { cn } from "@/lib/utils";
import type { CreatureSearchResult } from "@/api/typesGenerated";

// --- Label maps ---

const UNIT_CLASS_LABELS: Record<number, string> = {
  1: "Warrior",
  2: "Paladin",
  4: "Mage",
  8: "Rogue",
};

// --- Helpers ---

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatRange(min: number, max: number): string {
  if (min === max || max === 0) return formatNumber(min);
  return `${formatNumber(min)}–${formatNumber(max)}`;
}

// --- Components ---

const GRID_COLS = "grid-cols-[1fr_60px_100px_70px_70px_1fr]";

const selectClasses = "bg-gray-800 border border-gray-600 rounded px-2 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors";

function ExpandedStats({ creature }: { creature: CreatureSearchResult }) {
  return (
    <div className="border border-gray-700 rounded-lg bg-gray-900/95 p-4 mt-1 mb-2">
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Entry</span>
          <span className="text-white tabular-nums">{creature.entry}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Level</span>
          <span className="text-white tabular-nums">{formatRange(creature.level_min, creature.level_max)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Health</span>
          <span className="text-white tabular-nums">{formatRange(creature.health_min, creature.health_max)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Mana</span>
          <span className="text-white tabular-nums">{formatRange(creature.mana_min, creature.mana_max)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Armor</span>
          <span className="text-white tabular-nums">{formatNumber(creature.armor)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Damage</span>
          <span className="text-white tabular-nums">{formatRange(creature.dmg_min, creature.dmg_max)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Class</span>
          <span className="text-white">{UNIT_CLASS_LABELS[creature.unit_class] ?? `Unknown (${creature.unit_class})`}</span>
        </div>
        {creature.subname && (
          <div className="flex justify-between">
            <span className="text-gray-400">Title</span>
            <span className="text-yellow-400">{creature.subname}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultRow({
  creature,
  isExpanded,
  onToggle,
}: {
  creature: CreatureSearchResult;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const levelStr = formatRange(creature.level_min, creature.level_max);
  const healthStr = formatRange(creature.health_min, creature.health_max);
  const classLabel = UNIT_CLASS_LABELS[creature.unit_class] ?? "";
  const dmgStr = creature.dmg_max > 0 ? `${formatRange(creature.dmg_min, creature.dmg_max)} dmg` : "";
  const armorStr = creature.armor > 0 ? `${formatNumber(creature.armor)} armor` : "";
  const details = [dmgStr, armorStr].filter(Boolean).join(" · ");

  return (
    <>
      <button
        onClick={onToggle}
        className={cn(
          "w-full text-left grid gap-3 items-center px-3 py-1.5 rounded-md transition-colors",
          GRID_COLS,
          "hover:bg-gray-800/80",
          isExpanded && "bg-gray-800/60"
        )}
      >
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="font-medium text-white truncate">{creature.name}</span>
          {creature.subname && (
            <span className="text-yellow-600 text-xs truncate">&lt;{creature.subname}&gt;</span>
          )}
        </div>
        <span className="text-gray-400 text-xs text-right tabular-nums">{levelStr}</span>
        <span className="text-gray-400 text-xs text-right tabular-nums">{healthStr}</span>
        <span className="text-gray-500 text-xs text-right tabular-nums">
          {creature.armor > 0 ? formatNumber(creature.armor) : ""}
        </span>
        <span className="text-gray-500 text-xs truncate">{classLabel}</span>
        <span className="text-gray-600 text-xs truncate">{details}</span>
      </button>
      {isExpanded && <ExpandedStats creature={creature} />}
    </>
  );
}

export function CreatureExplorerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState(searchParams.get("q") ?? "");
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const q = searchParams.get("q") ?? "";
  const unitClass = searchParams.get("unit_class") ? Number(searchParams.get("unit_class")) : undefined;
  const sort = searchParams.get("sort") ?? undefined;

  const { data: results, isLoading, isFetching, error } = useSearchCreatures(
    q.length >= 2 ? { q, unit_class: unitClass, sort } : null
  );

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(updates)) {
          if (value === undefined || value === "" || value === "-1") {
            next.delete(key);
          } else {
            next.set(key, value);
          }
        }
        return next;
      });
      setExpandedEntry(null);
    },
    [setSearchParams]
  );

  // Cycle through sort states: unsorted → desc → asc → unsorted
  const toggleSort = useCallback(
    (field: string) => {
      const descKey = `${field}_desc`;
      const ascKey = `${field}_asc`;
      let next: string | undefined;
      if (sort === descKey) next = ascKey;
      else if (sort === ascKey) next = undefined;
      else next = descKey;
      updateParams({ sort: next });
    },
    [sort, updateParams]
  );

  function SortIcon({ field }: { field: string }) {
    if (sort === `${field}_desc`) return <ArrowDown className="h-3 w-3" />;
    if (sort === `${field}_asc`) return <ArrowUp className="h-3 w-3" />;
    return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  }

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParams({ q: inputValue || undefined });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue, updateParams]);

  return (
    <div className="space-y-6">
      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Search creatures by name..."
            className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            autoFocus
          />
          {inputValue && (
            <button
              onClick={() => {
                setInputValue("");
                updateParams({ q: undefined });
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={unitClass ?? -1}
            onChange={(e) => updateParams({ unit_class: e.target.value })}
            className={selectClasses}
          >
            <option value="-1">Any Class</option>
            {Object.entries(UNIT_CLASS_LABELS).map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Results */}
      <div className="space-y-1">
        {/* Column headers */}
        {results && results.length > 0 && (
          <div className="space-y-2 pb-2 border-b border-gray-700/50">
            <div className="flex items-center justify-between text-sm text-gray-400 px-3">
              <span>
                {results.length >= 25 ? "25+ results" : `${results.length} result${results.length !== 1 ? "s" : ""}`}
                {isFetching && <Loader2 className="inline h-3 w-3 animate-spin ml-2" />}
              </span>
              <span className="text-xs text-gray-500">Click to expand stats</span>
            </div>
            <div className={cn("grid gap-3 items-center px-3 text-xs text-gray-500 font-medium", GRID_COLS)}>
              <span>Name</span>
              <button
                onClick={() => toggleSort("level")}
                className="flex items-center justify-end gap-1 hover:text-gray-300 transition-colors"
              >
                Level <SortIcon field="level" />
              </button>
              <button
                onClick={() => toggleSort("health")}
                className="flex items-center justify-end gap-1 hover:text-gray-300 transition-colors"
              >
                Health <SortIcon field="health" />
              </button>
              <span className="text-right">Armor</span>
              <span>Class</span>
              <span>Details</span>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && q.length >= 2 && (
          <div className="flex items-center justify-center gap-2 text-gray-400 py-12">
            <Loader2 className="h-5 w-5 animate-spin" />
            Searching...
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-red-400 text-center py-8">
            {error instanceof Error ? error.message : "Failed to search creatures"}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && q.length >= 2 && results && results.length === 0 && (
          <div className="text-gray-500 text-center py-12">
            No creatures found matching &ldquo;{q}&rdquo;
          </div>
        )}

        {/* Prompt */}
        {q.length < 2 && (
          <div className="text-gray-500 text-center py-12 space-y-2">
            <Skull className="h-10 w-10 mx-auto text-gray-600" />
            <p>Type at least 2 characters to search</p>
            <div className="text-xs text-gray-600 space-x-3 pt-2">
              <span>Try:</span>
              {["Ragnaros", "Onyxia", "Hogger"].map((name) => (
                <button
                  key={name}
                  className="text-blue-400/70 hover:text-blue-400"
                  onClick={() => setInputValue(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results list */}
        {results && results.length > 0 && (
          <div className="space-y-0.5 pt-2">
            {results.map((creature) => (
              <ResultRow
                key={creature.entry}
                creature={creature}
                isExpanded={expandedEntry === creature.entry}
                onToggle={() =>
                  setExpandedEntry((prev) => (prev === creature.entry ? null : creature.entry))
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
