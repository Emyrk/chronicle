import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Loader2, BookOpen, X } from "lucide-react";
import { useSpellsByName } from "@/api/queries";
import { getEnglishText, getSpellIconUrl, formatCastTime, getResolvedDescription } from "@/api/wowdb";
import type { WoWSpell } from "@/api/wowdb";
import { SpellTooltip } from "./SpellTooltip";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip/tooltip";
import { SpellSchoolText } from "@/components/SpellSchoolBadge";
import { cn } from "@/lib/utils";

const GRID_COLS = "grid-cols-[36px_1fr_50px_80px_90px_1fr]";

function SpellIcon({ spell }: { spell: WoWSpell }) {
  const url = getSpellIconUrl(spell.spell_icon);

  if (!url) {
    return (
      <div className="rounded border border-yellow-600/60 bg-gray-800 flex items-center justify-center shrink-0 w-7 h-7">
        <BookOpen className="h-4 w-4 text-gray-500" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      className="rounded border border-yellow-600/60 shrink-0"
      style={{ width: 28, height: 28 }}
      loading="lazy"
    />
  );
}

function HoverTooltip({ spell, children }: { spell: WoWSpell; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" align="start" sideOffset={4} hideArrow className="p-0 bg-transparent border-0 shadow-none max-w-none">
        <SpellTooltip spell={spell} />
      </TooltipContent>
    </Tooltip>
  );
}

function ResultRow({
  spell,
  isExpanded,
  onToggle,
}: {
  spell: WoWSpell;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const name = getEnglishText(spell.name);
  const rank = getEnglishText(spell.subtext);
  const description = getResolvedDescription(spell);

  return (
    <>
      <HoverTooltip spell={spell}>
        <button
          onClick={onToggle}
          className={cn(
            "w-full text-left grid gap-3 items-center px-3 py-1.5 rounded-md transition-colors",
            GRID_COLS,
            "hover:bg-gray-800/80",
            isExpanded && "bg-gray-800/60"
          )}
        >
          <SpellIcon spell={spell} />
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="font-medium text-white truncate">{name}</span>
            {rank && <span className="text-gray-500 text-xs truncate">{rank}</span>}
          </div>
          <span className="text-gray-500 text-xs text-right tabular-nums">
            {spell.spell_level > 0 ? spell.spell_level : ""}
          </span>
          <SpellSchoolText school={spell.school.string} className="text-xs" />
          <span className="text-gray-500 text-xs truncate">{formatCastTime(spell)}</span>
          <span className="text-gray-600 text-xs truncate">{description}</span>
        </button>
      </HoverTooltip>
      {isExpanded && (
        <div className="border border-gray-700 rounded-lg bg-gray-900/95 p-4 mt-1 mb-2">
          <div className="flex justify-end mb-2">
            <button
              onClick={onToggle}
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <SpellTooltip spell={spell} detailed />
        </div>
      )}
    </>
  );
}

export function SpellExplorerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState(searchParams.get("q") ?? "");
  const [expandedSpell, setExpandedSpell] = useState<number | null>(null);

  const q = searchParams.get("q") ?? "";

  const { data: results, isLoading, isFetching, error } = useSpellsByName(
    q.length >= 2 ? q : ""
  );

  function doSearch(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set("q", value);
      } else {
        next.delete("q");
      }
      return next;
    });
    setExpandedSpell(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSearch(inputValue);
  }

  const hasQuery = q.length >= 2;
  const resultList = hasQuery ? results ?? [] : [];

  return (
    <div className="space-y-6">
      {/* Search */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Search spells by name (press Enter)..."
            className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            autoFocus
          />
          {inputValue && (
            <button
              type="button"
              onClick={() => {
                setInputValue("");
                doSearch("");
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>

      {/* Results */}
      <div className="space-y-1">
        {/* Column headers */}
        {resultList.length > 0 && (
          <div className="space-y-2 pb-2 border-b border-gray-700/50">
            <div className="flex items-center justify-between text-sm text-gray-400 px-3">
              <span>
                {resultList.length} result{resultList.length !== 1 ? "s" : ""}
                {isFetching && <Loader2 className="inline h-3 w-3 animate-spin ml-2" />}
              </span>
              <span className="text-xs text-gray-500">Hover for tooltip · click to expand</span>
            </div>
            <div className={cn("grid gap-3 items-center px-3 text-xs text-gray-500 font-medium", GRID_COLS)}>
              <span />
              <span>Name</span>
              <span className="text-right">Level</span>
              <span>School</span>
              <span>Cast Time</span>
              <span>Description</span>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && hasQuery && (
          <div className="flex items-center justify-center gap-2 text-gray-400 py-12">
            <Loader2 className="h-5 w-5 animate-spin" />
            Searching...
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-red-400 text-center py-8">
            {error instanceof Error ? error.message : "Failed to search spells"}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && hasQuery && resultList.length === 0 && (
          <div className="text-gray-500 text-center py-12">
            No spells found matching &ldquo;{q}&rdquo;
          </div>
        )}

        {/* Prompt */}
        {!hasQuery && (
          <div className="text-gray-500 text-center py-12 space-y-2">
            <BookOpen className="h-10 w-10 mx-auto text-gray-600" />
            <p>Type a spell name and press Enter to search</p>
            <div className="text-xs text-gray-600 space-x-3 pt-2">
              <span>Try:</span>
              {["Fireball", "Renew", "Mortal Strike"].map((name) => (
                <button
                  key={name}
                  className="text-blue-400/70 hover:text-blue-400"
                  onClick={() => {
                    setInputValue(name);
                    doSearch(name);
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results list */}
        {resultList.length > 0 && (
          <div className="space-y-0.5 pt-2">
            {resultList.map((spell) => (
              <ResultRow
                key={spell.id}
                spell={spell}
                isExpanded={expandedSpell === spell.id}
                onToggle={() =>
                  setExpandedSpell((prev) => (prev === spell.id ? null : spell.id))
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
