import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { iconUrl, talentBackgroundUrl } from "@/config/iconUrl";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import type { WoWSpell } from "@emyrk/wow-tooltip-renderer";
import { resolveSpellDescription, getEnglishText } from "@emyrk/wow-tooltip-renderer";
import {
  type ClassTalentData,
  type TalentEntry,
  type TalentPrereqArrow,
  type TalentRanks,
  type TalentRankDescriptionPart,
  type TalentTabData,
  type TalentTooltipPosition,
  TALENT_BUILD_PARAM,
  TALENT_CELL_HEIGHT,
  TALENT_CELL_WIDTH,
  TALENT_GRID_COLUMNS,
  TALENT_GRID_GAP,
  TALENT_GRID_WIDTH,
  TALENT_TOOLTIP_CLASS_NAME,
  TALENT_TOOLTIP_SSR_CLASS_NAME,
  canUseTalent,
  calculateRequiredPlayerLevel,
  copyTalentBuildUrl,
  decodeTalentBuild,
  isTalentBackgroundVisible,
  lockedTalentReasons,
  mergeTalentRankDescriptions,
  normalizeTalentRanks,
  prerequisiteArrowPathData,
  prerequisiteArrowPolylinePoints,
  prerequisiteArrows,
  rankDescriptionsForTooltip,
  resetTalentTabRanks,
  searchParamsWithTalentBuild,
  talentDescription,
  talentGridHeight,
  talentGridRows,
  talentRankTexts,
  talentTooltipPosition,
  talentVisualState,
  totalTalentPoints,
  updateTalentRank,
} from "./talentLogic";
import { useTalentTrees } from "./useTalentTrees";

// ─── Public interfaces ────────────────────────────────────────────

/** Backward-compatible allocation for Armory / Technical pages. */
export interface TalentAllocation {
  /** Tab name (e.g., "Arms") */
  tabName: string;
  /** Total points spent in this tab */
  pointsSpent: number;
  /** One digit per talent in tab-index order: rank per talent */
  rankDigits: string;
}

export interface TalentTreeViewerProps {
  data: ClassTalentData;
  /** Pre-set talent allocations (from combat log). Converted to TalentRanks. */
  allocations?: TalentAllocation[];
  /** Maximum talent points allowed (default: 51). */
  maxTalentPoints?: number;
  /** Maximum player level (default: 60). */
  maxLevel?: number;
  /** When true, hides interactive controls (default: false). */
  readOnly?: boolean;
  className?: string;
}

// ─── Class data lookups ───────────────────────────────────────────

const CLASS_NAMES: Record<number, string> = {
  1: "Warrior",
  2: "Paladin",
  3: "Hunter",
  4: "Rogue",
  5: "Priest",
  6: "Death Knight",
  7: "Shaman",
  8: "Mage",
  9: "Warlock",
  11: "Druid",
};

// ─── Tooltip internals ────────────────────────────────────────────

function TalentRankDescription({ parts }: { parts: TalentRankDescriptionPart[] }) {
  return (
    <span className="mt-2 block leading-5 text-zinc-300">
      {parts.map((part, partIndex) => {
        if (part.type === "text") return <Fragment key={partIndex}>{part.text}</Fragment>;
        return (
          <span key={partIndex} className="whitespace-nowrap text-zinc-300">
            [
            {part.values.map((value, valueIndex) => (
              <Fragment key={`${value}-${valueIndex}`}>
                {valueIndex > 0 && <span className="text-zinc-500">/</span>}
                {valueIndex === part.activeIndex ? <strong className="rank-ladder-value-active text-amber-100">{value}</strong> : <span className="text-zinc-500">{value}</span>}
              </Fragment>
            ))}
            ]
          </span>
        );
      })}
    </span>
  );
}

function TalentTooltipCard({
  talent,
  rank,
  locked,
  description,
  rankDescriptionParts,
  currentRankText,
  nextRankText,
  loadingSpellDetails,
  lockReasons,
  id,
  className: tooltipClassName,
  position,
}: {
  talent: TalentEntry;
  rank: number;
  locked: boolean;
  description: string;
  rankDescriptionParts?: TalentRankDescriptionPart[] | null;
  currentRankText?: string;
  nextRankText?: string;
  loadingSpellDetails?: boolean;
  lockReasons: string[];
  id: string;
  className: string;
  position?: TalentTooltipPosition;
}) {
  const hasRankSpecificDescription = Boolean(rankDescriptionParts || currentRankText || nextRankText);

  return (
    <span
      id={id}
      role="tooltip"
      className={tooltipClassName}
      style={position ? { left: `${position.left}px`, top: `${position.top}px` } : undefined}
    >
      <strong className="block text-sm text-white">{talent.name}</strong>
      <span className="mt-1 block font-semibold text-amber-200">Rank {rank}/{talent.maxRank}{locked ? " · Locked" : ""}</span>
      {!hasRankSpecificDescription && <span className="mt-2 block text-zinc-300">{description}</span>}
      {loadingSpellDetails && <span className="mt-2 block animate-pulse text-muted-foreground">Loading spell details…</span>}
      {rankDescriptionParts ? <TalentRankDescription parts={rankDescriptionParts} /> : (
        <>
          {currentRankText && <span className="mt-2 block text-emerald-200">Current rank: {currentRankText}</span>}
          {nextRankText && <span className="mt-1 block text-sky-200">Next rank: {nextRankText}</span>}
        </>
      )}
      {locked && (
        <span className="mt-2 block space-y-1 text-red-200">
          <span className="block font-semibold">Locked</span>
          {lockReasons.map((reason) => <span key={reason} className="block">{reason}</span>)}
        </span>
      )}
    </span>
  );
}

// ─── Prerequisite arrows SVG ──────────────────────────────────────

function TalentPrereqArrows({ arrows, ranks, height, talents }: { arrows: TalentPrereqArrow[]; ranks: TalentRanks; height: number; talents: TalentEntry[] }) {
  if (arrows.length === 0) return null;

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-visible"
      viewBox={`0 0 ${TALENT_GRID_WIDTH} ${height}`}
      width={TALENT_GRID_WIDTH}
      height={height}
      preserveAspectRatio="none"
    >
      <defs>
        <marker id="talent-prereq-arrow-active" viewBox="0 0 6 6" refX="4.8" refY="3" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
          <path d="M0.5 0.75 L5.5 3 L0.5 5.25 Z" className="fill-[#d8b35f] drop-shadow-[0_0_3px_rgba(216,179,95,0.45)]" />
        </marker>
        <marker id="talent-prereq-arrow-inactive" viewBox="0 0 6 6" refX="4.8" refY="3" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
          <path d="M0.5 0.75 L5.5 3 L0.5 5.25 Z" className="fill-[#8b744f]/70" />
        </marker>
      </defs>
      {arrows.map(({ from, to, requiredRank }) => {
        const active = (ranks[from.id] ?? 0) >= requiredRank;
        const strokeClass = active ? "stroke-[#d8b35f]/85 drop-shadow-[0_0_4px_rgba(216,179,95,0.35)]" : "stroke-[#6d5a3f]/45";
        const marker = active ? "url(#talent-prereq-arrow-active)" : "url(#talent-prereq-arrow-inactive)";
        const points = prerequisiteArrowPolylinePoints(from, to, talents);
        const pathData = prerequisiteArrowPathData(points);

        return (
          <g key={`${from.id}-${to.id}`} className="transition">
            <path
              d={pathData}
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-[#2b241a]/80"
            />
            <path
              d={pathData}
              fill="none"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              markerEnd={marker}
              className={strokeClass}
            />
          </g>
        );
      })}
    </svg>
  );
}

// ─── Talent button ────────────────────────────────────────────────

function TalentButton({ talent, rank, locked, talents, ranks, onChange, readOnly }: {
  talent: TalentEntry;
  rank: number;
  locked: boolean;
  talents: TalentEntry[];
  ranks: TalentRanks;
  onChange: (rank: number) => void;
  readOnly: boolean;
}) {
  const maxed = rank >= talent.maxRank;
  const visualState = talentVisualState(rank, talent.maxRank, locked);
  const tooltipId = `talent-tooltip-${talent.id}`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TalentTooltipPosition | undefined>();
  const rankTexts = talentRankTexts(talent);

  const queryClient = useQueryClient();

  // Fetch ALL rank spells
  const rankSpellQueries = useQueries({
    queries: talent.spellRanks.map((spellId) => ({
      queryKey: ["wowdb", "spell", String(spellId)],
      queryFn: async () => {
        const res = await fetch(`/api/v1/wowdb/spell/${spellId}`);
        if (!res.ok) throw new Error("Spell not found");
        return res.json() as Promise<WoWSpell>;
      },
      enabled: Boolean(tooltipPosition && spellId),
      staleTime: Infinity,
      gcTime: 30 * 60 * 1000,
      retry: false,
    })),
  });

  // Resolve description text for each rank spell
  const fetchedRankTexts = rankSpellQueries.map((q) => {
    if (!q.data) return "";
    const desc = resolveSpellDescription(q.data, getEnglishText(q.data.description));
    if (desc) return desc;
    return resolveSpellDescription(q.data, getEnglishText(q.data.aura_description)) ?? "";
  });

  // Determine which spell IDs to query
  const currentSpellId = rank > 0 ? talent.spellRanks[rank - 1] : undefined;

  // Use fetched description for primary spell too
  const primarySpell = currentSpellId
    ? rankSpellQueries[rank - 1]?.data
    : rankSpellQueries[rank]?.data ?? rankSpellQueries[0]?.data;
  const description = (primarySpell
    ? resolveSpellDescription(primarySpell, getEnglishText(primarySpell.description))
      || resolveSpellDescription(primarySpell, getEnglishText(primarySpell.aura_description))
    : undefined) ?? talentDescription(talent);

  // Override current/next rank text from fetched data
  const currentRankText = rank > 0
    ? (fetchedRankTexts[rank - 1] || rankTexts[rank - 1])
    : undefined;
  const nextRankText = rank < talent.maxRank
    ? (fetchedRankTexts[rank] || rankTexts[rank] || rankTexts[rank === 0 ? 0 : rank])
    : undefined;

  // Feed ALL fetched rank texts into the merge pipeline
  const rankDescriptionParts = mergeTalentRankDescriptions(
    rankDescriptionsForTooltip(rankTexts, rank, currentRankText, nextRankText, fetchedRankTexts),
    rank,
  );

  const loadingSpellDetails = Boolean(
    tooltipPosition && talent.spellRanks.length > 0 && rankSpellQueries.some((q) => q.isPending)
  );
  const lockReasons = locked ? lockedTalentReasons(talent, talents, ranks) : [];
  const title = locked ? `${talent.name} locked. ${lockReasons.join(" ")}` : `${talent.name} (${rank}/${talent.maxRank})`;

  const showTooltip = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setTooltipPosition(talentTooltipPosition(rect));
    // Prefetch all rank spells
    for (const spellId of talent.spellRanks) {
      if (!spellId) continue;
      void queryClient.prefetchQuery({
        queryKey: ["wowdb", "spell", String(spellId)],
        queryFn: async () => {
          const res = await fetch(`/api/v1/wowdb/spell/${spellId}`);
          if (!res.ok) throw new Error("Spell not found");
          return res.json();
        },
        staleTime: Infinity,
      });
    }
  };
  const hideTooltip = () => setTooltipPosition(undefined);

  useEffect(() => {
    if (!tooltipPosition || typeof document === "undefined") return undefined;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (buttonRef.current?.contains(target)) return;
      hideTooltip();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") hideTooltip();
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [tooltipPosition]);

  const tooltip = (
    <TalentTooltipCard
      id={tooltipId}
      talent={talent}
      rank={rank}
      locked={locked}
      description={description}
      rankDescriptionParts={rankDescriptionParts}
      currentRankText={currentRankText}
      nextRankText={nextRankText}
      loadingSpellDetails={loadingSpellDetails}
      lockReasons={lockReasons}
      className={TALENT_TOOLTIP_CLASS_NAME}
      position={tooltipPosition}
    />
  );

  return (
    <button
      ref={buttonRef}
      type="button"
      title={title}
      aria-disabled={locked || readOnly}
      aria-describedby={tooltipId}
      data-talent-tooltip-trigger="true"
      data-state={visualState}
      data-talent-id={talent.id}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      onClick={(event) => {
        if (readOnly) return;
        showTooltip();
        if (event.shiftKey || event.metaKey) onChange(Math.max(0, rank - 1));
        else onChange(Math.min(talent.maxRank, rank + 1));
      }}
      onContextMenu={(event) => {
        if (readOnly) return;
        event.preventDefault();
        onChange(Math.max(0, rank - 1));
      }}
      className={cn(
        "group relative h-11 w-11 rounded-sm border bg-zinc-950 shadow-lg transition before:absolute before:-inset-0.5 before:rounded-sm before:content-['']",
        visualState === "locked" && "talent-state-locked cursor-not-allowed border-zinc-700 opacity-75 before:bg-black/10",
        visualState === "available" && "talent-state-available border-primary/70 shadow-primary/20 before:border before:border-primary/35 hover:scale-105 hover:border-primary hover:shadow-primary/30",
        visualState === "selected" && "talent-state-selected border-emerald-300/80 shadow-emerald-500/20 ring-1 ring-emerald-300/45 before:border before:border-emerald-300/35 hover:scale-105 hover:border-emerald-200",
        visualState === "maxed" && "talent-state-maxed border-amber-300 shadow-amber-400/25 ring-2 ring-amber-300/55 before:border before:border-amber-200/50 before:shadow-[0_0_14px_rgba(251,191,36,0.28)] hover:scale-105 hover:border-amber-200",
      )}
    >
      <img src={iconUrl(talent.iconTexture)} alt="" className={cn("h-full w-full rounded object-cover", locked && "talent-locked-icon-readable grayscale opacity-70 contrast-110")} />
      {locked && <span className="talent-locked-icon-veil absolute inset-0 rounded bg-black/25" />}
      {maxed && <span className="pointer-events-none absolute inset-0 rounded bg-amber-300/10 shadow-[inset_0_0_12px_rgba(251,191,36,0.38)]" />}
      {visualState === "available" && <span className="pointer-events-none absolute inset-0 rounded bg-primary/10 shadow-[inset_0_0_10px_rgba(20,184,166,0.22)]" />}
      {visualState === "selected" && <span className="pointer-events-none absolute inset-0 rounded bg-emerald-300/10 shadow-[inset_0_0_10px_rgba(16,185,129,0.28)]" />}
      <span className={cn(
        "absolute -bottom-1 -right-1 rounded border px-1 text-[10px] font-bold shadow-sm",
        visualState === "maxed" ? "border-amber-100/70 bg-amber-300 text-black" : visualState === "selected" ? "border-emerald-100/50 bg-emerald-500 text-black" : visualState === "available" ? "border-primary/60 bg-primary/85 text-black" : "border-zinc-500/70 bg-zinc-900 text-zinc-100",
      )}>
        {rank}/{talent.maxRank}
      </span>
      {typeof document === "undefined" ? (
        <TalentTooltipCard
          id={tooltipId}
          talent={talent}
          rank={rank}
          locked={locked}
          description={description}
          rankDescriptionParts={rankDescriptionParts}
          currentRankText={currentRankText}
          nextRankText={nextRankText}
          loadingSpellDetails={loadingSpellDetails}
          lockReasons={lockReasons}
          className={TALENT_TOOLTIP_SSR_CLASS_NAME}
        />
      ) : tooltipPosition ? createPortal(tooltip, document.body) : null}
    </button>
  );
}

// ─── Talent tab (single tree) ─────────────────────────────────────

function TalentTab({
  tab,
  ranks,
  readOnly,
  onRankChange,
  onReset,
}: {
  tab: TalentTabData;
  ranks: TalentRanks;
  readOnly: boolean;
  onRankChange: (talent: TalentEntry, rank: number) => void;
  onReset: () => void;
}) {
  const points = useMemo(() => tab.talents.reduce((sum, talent) => sum + (ranks[talent.id] ?? 0), 0), [tab.talents, ranks]);
  const arrows = useMemo(() => prerequisiteArrows(tab.talents), [tab.talents]);
  const rows = useMemo(() => talentGridRows(tab.talents), [tab.talents]);
  const height = talentGridHeight(rows);
  const backgroundUrl = talentBackgroundUrl(tab.backgroundFile);
  const [failedBackgroundUrl, setFailedBackgroundUrl] = useState<string | null>(null);
  const showBackground = isTalentBackgroundVisible(backgroundUrl, failedBackgroundUrl);

  return (
    <section className="talent-tree-card relative max-w-full self-start overflow-hidden rounded-lg border border-amber-400/20 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.14),transparent_32%),linear-gradient(180deg,rgba(120,83,38,0.16),rgba(9,9,11,0.58))] p-4 shadow-2xl shadow-black/30" aria-label={`${tab.name} talent tree`}>
      {showBackground && backgroundUrl && (
        <img
          src={backgroundUrl}
          alt=""
          aria-hidden="true"
          data-talent-background-image="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35 mix-blend-screen"
          loading="lazy"
          onError={() => setFailedBackgroundUrl(backgroundUrl)}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-black/45" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/40 to-transparent" aria-hidden="true" />
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/30 p-2 shadow-inner shadow-black/30">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-lg border border-amber-300/35 bg-black/45 p-1 shadow-lg shadow-black/35">
            <img src={iconUrl(tab.iconTexture)} alt="" className="h-10 w-10 rounded border border-primary/25 object-cover" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-xl font-bold text-white">{tab.name}</h3>
            <p className="text-sm font-semibold text-amber-100/85">{points} points spent</p>
          </div>
        </div>
        {!readOnly && (
          <button
            type="button"
            aria-label={`Reset ${tab.name} tree`}
            className="shrink-0 rounded-md border border-amber-300/30 bg-zinc-950/60 px-2.5 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-amber-100/80 transition hover:border-amber-200/60 hover:bg-amber-300/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
            disabled={points === 0}
            onClick={onReset}
          >
            Reset tree
          </button>
        )}
      </div>
      <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 pb-3 touch-pan-x sm:mx-0 sm:px-0" aria-label="Scrollable talent tree grid">
        <div
          className="relative mx-auto min-w-max rounded-lg border border-white/5 bg-black/25 p-3"
          style={{ width: `${TALENT_GRID_WIDTH + TALENT_GRID_GAP * 2}px` }}
        >
          <div className="relative" style={{ width: `${TALENT_GRID_WIDTH}px`, height: `${height}px` }}>
            <TalentPrereqArrows arrows={arrows} ranks={ranks} height={height} talents={tab.talents} />
            <div
              className="relative z-10 grid justify-items-center"
              style={{
                width: `${TALENT_GRID_WIDTH}px`,
                gridTemplateColumns: `repeat(${TALENT_GRID_COLUMNS}, ${TALENT_CELL_WIDTH}px)`,
                gridAutoRows: `${TALENT_CELL_HEIGHT}px`,
                gap: `${TALENT_GRID_GAP}px`,
              }}
            >
              {Array.from({ length: rows }).map((_, tier) =>
                Array.from({ length: TALENT_GRID_COLUMNS }).map((__, col) => {
                  const t = tab.talents.find((candidate) => candidate.tierID === tier && candidate.columnIndex === col);
                  return (
                    <div key={`${tier}-${col}`} className="flex h-[58px] w-[52px] items-start justify-center">
                      {t && (
                        <TalentButton
                          talent={t}
                          rank={ranks[t.id] ?? 0}
                          locked={(ranks[t.id] ?? 0) === 0 && !canUseTalent(t, tab.talents, ranks)}
                          talents={tab.talents}
                          ranks={ranks}
                          readOnly={readOnly}
                          onChange={(rank) => onRankChange(t, rank)}
                        />
                      )}
                    </div>
                  );
                }),
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Allocations → TalentRanks conversion ─────────────────────────

function allocationsToRanks(tabs: TalentTabData[], allocations: TalentAllocation[]): TalentRanks {
  const ranks: TalentRanks = {};
  const hasTabNames = allocations.some((a) => a.tabName !== "");

  for (let tabIdx = 0; tabIdx < tabs.length; tabIdx++) {
    const tab = tabs[tabIdx];
    // Match allocation by name or index
    const alloc = hasTabNames
      ? allocations.find((a) => a.tabName.toLowerCase() === tab.name.toLowerCase())
      : allocations[tabIdx];
    if (!alloc?.rankDigits) continue;

    // Sort talents by tabIndex to match rankDigits order
    const sorted = [...tab.talents].sort((a, b) => a.tabIndex - b.tabIndex);
    for (let i = 0; i < alloc.rankDigits.length && i < sorted.length; i++) {
      const r = parseInt(alloc.rankDigits[i], 10) || 0;
      if (r > 0) ranks[sorted[i].id] = r;
    }
  }
  return ranks;
}

// ─── Main component ───────────────────────────────────────────────

export function TalentTreeViewer({
  data,
  allocations,
  maxTalentPoints = 51,
  maxLevel = 60,
  readOnly = false,
  className,
}: TalentTreeViewerProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabTalentLists = useMemo(() => data.tabs.map((tab) => tab.talents), [data.tabs]);
  const deepestTabRows = useMemo(() => Math.max(...data.tabs.map((tab) => talentGridRows(tab.talents)), 0), [data.tabs]);
  const tabGridClassName = deepestTabRows > 7 ? "grid min-w-0 gap-4 xl:grid-cols-2 2xl:grid-cols-3" : "grid min-w-0 gap-4 xl:grid-cols-3";
  const maxPoints = maxTalentPoints;
  const flavor = useMemo(() => ({ maxLevel, maxTalentPoints }), [maxLevel, maxTalentPoints]);

  // Compute initial ranks from allocations or URL
  const initialRanks = useMemo(() => {
    if (allocations && allocations.length > 0) {
      return normalizeTalentRanks(tabTalentLists, allocationsToRanks(data.tabs, allocations), maxPoints);
    }
    return normalizeTalentRanks(tabTalentLists, decodeTalentBuild(searchParams.get(TALENT_BUILD_PARAM)), maxPoints);
  }, [allocations, data.tabs, maxPoints, searchParams, tabTalentLists]);

  const [ranks, setRanks] = useState<TalentRanks>(initialRanks);
  const total = useMemo(() => totalTalentPoints(ranks), [ranks]);
  const requiredLevel = useMemo(() => calculateRequiredPlayerLevel(total, flavor), [flavor, total]);

  // Sync ranks when external inputs (data, URL params, allocations) change.
  // This is a legitimate prop→state synchronization — ranks are also updated
  // by user clicks via commitRanks(), so we can't simply derive them.
  useEffect(() => {
    if (allocations && allocations.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate prop→state sync; ranks are also mutated by user clicks
      setRanks(normalizeTalentRanks(tabTalentLists, allocationsToRanks(data.tabs, allocations), maxPoints));
    } else {
      setRanks(normalizeTalentRanks(tabTalentLists, decodeTalentBuild(searchParams.get(TALENT_BUILD_PARAM)), maxPoints));
    }
  }, [data.id, maxPoints, searchParams, tabTalentLists, allocations, data.tabs]);

  function commitRanks(nextRanks: TalentRanks) {
    setRanks(nextRanks);
    if (!readOnly && !allocations) {
      setSearchParams(searchParamsWithTalentBuild(searchParams, nextRanks), { replace: true });
    }
  }

  async function copyBuildLink() {
    if (typeof window === "undefined") return;
    await copyTalentBuildUrl(navigator.clipboard, window.location.href, ranks);
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Summary bar — hidden in readOnly mode with allocations */}
      {!(readOnly && allocations) && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-bold text-white">{data.name} talents</h2>
            {!readOnly && (
              <p className="text-sm text-muted-foreground">Click to add a point. Right-click, shift-click, or command-click to remove one. Shareable builds are stored in the URL.</p>
            )}
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm font-bold text-white">
              Requires level {requiredLevel}
            </div>
            {!readOnly && (
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <button type="button" className="rounded-lg border border-primary/50 bg-primary/15 px-3 py-2 text-sm font-bold text-white hover:bg-primary/25" onClick={() => void copyBuildLink()} title="Share your current talents">
                  Copy build link
                </button>
                <button type="button" className="rounded-lg border border-border/60 bg-black/40 px-3 py-2 text-sm text-muted-foreground hover:text-white" onClick={() => commitRanks({})}>Reset {total}/{maxPoints} points</button>
              </div>
            )}
          </div>
        </div>
      )}
      <div className={tabGridClassName}>
        {data.tabs.map((tab) => (
          <TalentTab
            key={tab.id}
            tab={tab}
            ranks={ranks}
            readOnly={readOnly}
            onRankChange={(talent, rank) => commitRanks(updateTalentRank(talent, rank, tab.talents, ranks, { maxPoints }))}
            onReset={() => commitRanks(resetTalentTabRanks(tabTalentLists, ranks, tab.talents, maxPoints))}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Legacy wrapper ───────────────────────────────────────────────

export interface TalentTreeViewerLegacyProps {
  classId: number;
  allocations?: TalentAllocation[];
  datasetId?: string;
  className?: string;
}

/**
 * Backward-compatible wrapper that preserves the old
 * `{ classId, allocations?, datasetId?, className? }` API.
 * Fetches data internally via useTalentTrees and renders TalentTreeViewer
 * with readOnly={true}.
 */
export function TalentTreeViewerLegacy({
  classId,
  allocations,
  datasetId,
  className,
}: TalentTreeViewerLegacyProps) {
  const { data, isLoading, error } = useTalentTrees(datasetId);

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-8 text-zinc-500 text-sm", className)}>
        Loading talent trees…
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("flex items-center justify-center py-8 text-red-400 text-sm", className)}>
        Failed to load talent data
      </div>
    );
  }

  if (!data) {
    return (
      <div className={cn("flex items-center justify-center py-8 text-zinc-500 text-sm", className)}>
        Talent data is not available for this dataset yet.
      </div>
    );
  }

  const classData = data.classes[String(classId)];
  if (!classData) {
    return (
      <div className={cn("flex items-center justify-center py-8 text-zinc-500 text-sm", className)}>
        No talent data for class {CLASS_NAMES[classId] ?? classId}
      </div>
    );
  }

  return (
    <TalentTreeViewer
      data={classData}
      allocations={allocations}
      readOnly
      className={className}
    />
  );
}

export default TalentTreeViewer;
