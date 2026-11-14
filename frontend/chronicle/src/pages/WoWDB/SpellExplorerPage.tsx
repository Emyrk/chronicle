import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router-dom";
import { Search, Loader2, BookOpen, ChevronDown, ChevronUp, LockKeyhole, SlidersHorizontal, X } from "lucide-react";
import { useSpellsByName } from "@/api/queries";
import { getEnglishText, getSpellIconUrl, formatCastTime, getResolvedDescription } from "@/api/wowdb";
import type { WoWSpell } from "@/api/wowdb";
import { SpellTooltip } from "./SpellTooltip";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip/tooltip";
import { SpellSchoolText } from "@/components/SpellSchoolBadge";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { useSupporterTier } from "@/hooks/useSupporterTier";
import { SearchError } from "@/pages/InstanceSearch/searchApi";
import { SpellSearchBlockEditor } from "./SpellSearchBlockEditor";
import {
  decodeSpellSearch,
  EMPTY_SPELL_SEARCH,
  encodeSpellSearch,
  prepareSpellSearch,
  type SpellSearchDraft,
} from "./spellSearchModel";
import { runSpellSearch, useSpellSearchLimit, type SpellSearchResult } from "./spellSearchApi";

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

function ResultRow({ spell }: { spell: WoWSpell }) {
  const name = getEnglishText(spell.name);
  const rank = getEnglishText(spell.subtext);
  const description = getResolvedDescription(spell);

  return (
    <HoverTooltip spell={spell}>
      <Link
        to={`/wowdb/spell/${spell.id}`}
        className={cn(
          "w-full text-left grid gap-3 items-center px-3 py-1.5 rounded-md transition-colors",
          GRID_COLS,
          "hover:bg-gray-800/80"
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
      </Link>
    </HoverTooltip>
  );
}

const SCHOOL_NAMES: [number, string][] = [
  [1, "Physical"],
  [2, "Holy"],
  [4, "Fire"],
  [8, "Nature"],
  [16, "Frost"],
  [32, "Shadow"],
  [64, "Arcane"],
];

function schoolName(mask: number): string {
  const names = SCHOOL_NAMES.filter(([bit]) => (mask & bit) !== 0).map(([, name]) => name);
  return names.join("/") || "Unknown";
}

function AdvancedResultRow({ spell }: { spell: SpellSearchResult }) {
  return (
    <Link
      to={`/wowdb/spell/${spell.id}`}
      className={cn(
        "grid w-full grid-cols-[36px_1fr_60px_100px_1fr] items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
        "hover:bg-gray-800/80",
      )}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-yellow-600/60 bg-gray-800">
        <BookOpen className="h-4 w-4 text-gray-500" />
      </div>
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className="truncate font-medium text-white">{spell.name}</span>
        {spell.subtext && <span className="truncate text-xs text-gray-500">{spell.subtext}</span>}
      </div>
      <span className="text-right text-xs tabular-nums text-gray-500">{spell.spell_level > 0 ? spell.spell_level : ""}</span>
      <span className="truncate text-xs text-gray-400">{schoolName(spell.school)}</span>
      <span className="truncate text-xs text-gray-600">{spell.description}</span>
    </Link>
  );
}

function AdvancedSearchError({ error }: { error: unknown }) {
  if (!(error instanceof SearchError)) {
    return <div className="py-8 text-center text-red-400">Failed to search spells.</div>;
  }
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-4 text-sm">
      <p className="font-medium text-red-300">{error.message}</p>
      {error.detail && <p className="mt-1 text-xs text-gray-400">{error.detail}</p>}
      {error.callToAction && <p className="mt-2 text-xs text-gray-300">{error.callToAction}</p>}
      {error.link && (
        <Link to={error.link} className="mt-2 inline-block text-xs font-medium text-blue-400 hover:text-blue-300">
          {error.linkText ?? "Learn more"}
        </Link>
      )}
      {error.retryAfterSeconds != null && <p className="mt-2 text-xs text-gray-500">Try again in about {error.retryAfterSeconds} seconds.</p>}
    </div>
  );
}

export function SpellExplorerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const submittedParam = searchParams.get("aq");
  const submittedAdvanced = useMemo(() => decodeSpellSearch(submittedParam), [submittedParam]);
  const [inputValue, setInputValue] = useState(searchParams.get("q") ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(submittedAdvanced !== undefined);
  const [editingAdvanced, setEditingAdvanced] = useState(submittedAdvanced === undefined);
  const [advancedDraft, setAdvancedDraft] = useState<SpellSearchDraft>(submittedAdvanced ?? EMPTY_SPELL_SEARCH);
  const q = searchParams.get("q") ?? "";
  const supporter = useSupporterTier();
  const advancedUnlocked = supporter.atLeast("revered");
  const advancedLimit = useSpellSearchLimit(advancedOpen && !supporter.isLoading);

  const { data: results, isLoading, isFetching, error } = useSpellsByName(
    !submittedAdvanced && q.length >= 2 ? q : ""
  );

  const advancedQuery = useInfiniteQuery({
    queryKey: ["spell-search", submittedParam],
    queryFn: ({ pageParam }) => runSpellSearch(submittedAdvanced!, pageParam),
    initialPageParam: undefined as { spell_id: number } | undefined,
    getNextPageParam: (last) => last.page.next,
    enabled: submittedAdvanced !== undefined && !supporter.isLoading && advancedUnlocked,
    retry: false,
    staleTime: Infinity,
  });
  const advancedResults = advancedQuery.data?.pages.flatMap((page) => page.page.results) ?? [];
  const latestAdvancedPage = advancedQuery.data?.pages.at(-1);

  function doSearch(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set("q", value);
      } else {
        next.delete("q");
      }
      next.delete("aq");
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSearch(inputValue);
  }

  function submitAdvanced() {
    const prepared = prepareSpellSearch(advancedDraft);
    if (!prepared || !advancedUnlocked) return;
    setAdvancedDraft(prepared);
    setEditingAdvanced(false);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("q");
      next.set("aq", encodeSpellSearch(prepared));
      return next;
    });
  }

  function clearAdvanced() {
    setAdvancedDraft(EMPTY_SPELL_SEARCH);
    setEditingAdvanced(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("aq");
      return next;
    });
  }

  const hasQuery = !submittedAdvanced && q.length >= 2;
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-yellow-600/80">Only exact case-sensitive matches are supported right now.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              setAdvancedOpen((open) => !open);
              if (!advancedOpen && submittedAdvanced) setEditingAdvanced(false);
            }}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Advanced Search
            {advancedOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </form>

      {advancedOpen && (
        <section className="space-y-4 rounded-xl border border-gray-700/70 bg-gray-900/35 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                Advanced spell search
                {!supporter.isLoading && !advancedUnlocked && <LockKeyhole className="h-4 w-4 text-amber-400" />}
              </h2>
              <p className="mt-1 text-xs text-gray-400">Combine spell properties with same-row effect and power-cost conditions.</p>
            </div>
            {submittedAdvanced && !editingAdvanced && (
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingAdvanced(true)}>Edit query</Button>
            )}
          </div>

          {!supporter.isLoading && !advancedUnlocked && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
              <p className="font-medium text-amber-200">Advanced spell search is a Revered supporter perk.</p>
              <p className="mt-1 text-xs text-gray-400">Preview the query builder here, then upgrade to use it.</p>
              <Link to="/supporter" className="mt-2 inline-block text-xs font-medium text-blue-400 hover:text-blue-300">View supporter perks</Link>
            </div>
          )}

          {(editingAdvanced || !submittedAdvanced) && (
            <>
              <SpellSearchBlockEditor draft={advancedDraft} onChange={setAdvancedDraft} disabled={!supporter.isLoading && !advancedUnlocked} />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-700/60 pt-4">
                <div className="text-xs text-gray-500">
                  {advancedLimit.data && (
                    <span>{Math.floor(advancedLimit.data.remaining)} of {Math.floor(advancedLimit.data.limit)} shared search tokens available</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {(submittedAdvanced || prepareSpellSearch(advancedDraft)) && <Button type="button" variant="ghost" size="sm" onClick={clearAdvanced}>Clear</Button>}
                  <Button type="button" size="sm" onClick={submitAdvanced} disabled={supporter.isLoading || !advancedUnlocked || !prepareSpellSearch(advancedDraft)}>
                    Search spells
                  </Button>
                </div>
              </div>
            </>
          )}

          {submittedAdvanced && !editingAdvanced && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-700/60 bg-black/10 px-4 py-3 text-xs text-gray-400">
              <span>Query loaded from this shareable URL.</span>
              <span>
                {latestAdvancedPage?.cost != null && `${latestAdvancedPage.cost} query tokens`}
                {latestAdvancedPage?.runtimeCost != null && ` + ${latestAdvancedPage.runtimeCost} runtime`}
              </span>
            </div>
          )}
        </section>
      )}

      {/* Results */}
      <div className="space-y-1">
        {submittedAdvanced && advancedUnlocked && (
          <>
            {advancedQuery.isLoading && (
              <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                Searching spells...
              </div>
            )}
            {advancedQuery.error && <AdvancedSearchError error={advancedQuery.error} />}
            {!advancedQuery.isLoading && !advancedQuery.error && advancedResults.length === 0 && (
              <div className="py-12 text-center text-gray-500">No spells matched this advanced query.</div>
            )}
            {advancedResults.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-gray-700/50 px-3 pb-2 text-sm text-gray-400">
                  <span>
                    {advancedResults.length} result{advancedResults.length !== 1 ? "s" : ""}
                    {advancedQuery.isFetching && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
                  </span>
                  <span className="text-xs text-gray-500">Click a spell to view details</span>
                </div>
                <div className="grid grid-cols-[36px_1fr_60px_100px_1fr] items-center gap-3 px-3 text-xs font-medium text-gray-500">
                  <span />
                  <span>Name</span>
                  <span className="text-right">Level</span>
                  <span>School</span>
                  <span>Description</span>
                </div>
                <div className="space-y-0.5">
                  {advancedResults.map((spell) => <AdvancedResultRow key={spell.id} spell={spell} />)}
                </div>
                {advancedQuery.hasNextPage && (
                  <div className="flex justify-center pt-4">
                    <Button type="button" variant="outline" size="sm" disabled={advancedQuery.isFetchingNextPage} onClick={() => advancedQuery.fetchNextPage()}>
                      {advancedQuery.isFetchingNextPage && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      Load more
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Column headers */}
        {resultList.length > 0 && (
          <div className="space-y-2 pb-2 border-b border-gray-700/50">
            <div className="flex items-center justify-between text-sm text-gray-400 px-3">
              <span>
                {resultList.length} result{resultList.length !== 1 ? "s" : ""}
                {isFetching && <Loader2 className="inline h-3 w-3 animate-spin ml-2" />}
              </span>
              <span className="text-xs text-gray-500">Hover for tooltip · click to view</span>
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
        {!submittedAdvanced && !hasQuery && (
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
              <ResultRow key={spell.id} spell={spell} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
