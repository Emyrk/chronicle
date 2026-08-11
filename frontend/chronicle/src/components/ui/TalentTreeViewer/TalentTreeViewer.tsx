import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { ImageDown, Lock, LockOpen, Share2 } from "lucide-react";
import { toCanvas } from "html-to-image";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/Checkbox/Checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import { iconUrl, talentBackgroundUrl } from "@/config/iconUrl";
import { useIconBaseUrl } from "@/hooks/useDatasetId";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import type { WoWSpell } from "@emyrk/wow-tooltip-renderer";
import { resolveSpellDescription, getEnglishText, extractReferencedSpellIds } from "@emyrk/wow-tooltip-renderer";
import {
  type ClassTalentData,
  type TalentDiff,
  type TalentEntry,
  type TalentPopularity,
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
  formatPopularityAvg,
  isTalentBackgroundVisible,
  isTalentBuildLocked,
  lockedTalentReasons,
  mergeTalentRankDescriptions,
  normalizeTalentRanks,
  prerequisiteArrowPathData,
  prerequisiteArrowPolylinePoints,
  prerequisiteArrows,
  populatedTalentTabs,
  rankDescriptionsForTooltip,
  resetTalentTabRanks,
  searchParamsWithTalentBuild,
  searchParamsWithTalentLock,
  talentBuildExportName,
  talentDescription,
  talentGridHeight,
  talentGridRows,
  talentRankTexts,
  talentTabPoints,
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
  /** When false, hides the player-level summary for non-player talent trees. */
  showRequiredLevel?: boolean;
  /** When true, hides interactive controls (default: false). */
  readOnly?: boolean;
  /** When true, renders a more compact layout suitable for panels with limited space. */
  compact?: boolean;
  /** Extra controls pinned to the right of the summary bar (e.g. "My Builds"). */
  extraActions?: React.ReactNode;
  /** Mobile: page header content (title/back) composed into the summary card. */
  mobileHeader?: React.ReactNode;
  /** Per-talent popularity badges (Top Builds "Show all" overlay). */
  popularity?: Record<number, TalentPopularity> | null;
  /** Per-talent diff badges (compare overlay). Mutually exclusive with popularity. */
  diff?: Record<number, TalentDiff> | null;
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
  popularity,
  diff,
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
  popularity?: TalentPopularity;
  diff?: TalentDiff;
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
      {popularity && (
        <span className="mt-2 block border-t border-amber-300/20 pt-2 text-amber-100/90">
          {popularity.pct}% of the top {popularity.sample} take this · avg {formatPopularityAvg(popularity.avg)} of {talent.maxRank} pts
        </span>
      )}
      {diff && (
        <span className="mt-2 block border-t border-amber-300/20 pt-2 text-amber-100/90">
          Yours {diff.yours}/{talent.maxRank} · Theirs {diff.theirs}/{talent.maxRank}
        </span>
      )}
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

function TalentPrereqArrows({ arrows, ranks, height, talents, buttonSize }: { arrows: TalentPrereqArrow[]; ranks: TalentRanks; height: number; talents: TalentEntry[]; buttonSize: number }) {
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
        <marker id="talent-prereq-arrow-active" viewBox="0 0 6 6" refX="4.8" refY="3" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0.5 0.75 L5.5 3 L0.5 5.25 Z" className="fill-[#d8b35f] drop-shadow-[0_0_3px_rgba(216,179,95,0.45)]" />
        </marker>
        <marker id="talent-prereq-arrow-inactive" viewBox="0 0 6 6" refX="4.8" refY="3" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0.5 0.75 L5.5 3 L0.5 5.25 Z" className="fill-[#8b744f]/70" />
        </marker>
      </defs>
      {arrows.map(({ from, to, requiredRank }) => {
        const active = (ranks[from.id] ?? 0) >= requiredRank;
        const strokeClass = active ? "stroke-[#d8b35f]/85 drop-shadow-[0_0_4px_rgba(216,179,95,0.35)]" : "stroke-[#6d5a3f]/45";
        const marker = active ? "url(#talent-prereq-arrow-active)" : "url(#talent-prereq-arrow-inactive)";
        const points = prerequisiteArrowPolylinePoints(from, to, talents, buttonSize);
        const pathData = prerequisiteArrowPathData(points);

        return (
          <g key={`${from.id}-${to.id}`} className="transition">
            <path
              d={pathData}
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-[#2b241a]/80"
            />
            <path
              d={pathData}
              fill="none"
              strokeWidth="3"
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

function TalentButton({ talent, rank, locked, pointsExhausted, talents, ranks, onChange, readOnly, debug, mobile, quickActive, onActivate, popularity, diff }: {
  talent: TalentEntry;
  rank: number;
  locked: boolean;
  /** True when no more points can be spent (max reached or build locked). */
  pointsExhausted?: boolean;
  talents: TalentEntry[];
  ranks: TalentRanks;
  onChange: (rank: number) => void;
  readOnly: boolean;
  debug?: boolean;
  /** Touch layout: show -/+ quick buttons while the talent is active. */
  mobile?: boolean;
  /** Mobile: this talent is the last one tapped — keep its -/+ visible. */
  quickActive?: boolean;
  /** Mobile: mark this talent as the active one. */
  onActivate?: () => void;
  /** Popularity badge for the Top Builds "Show all" overlay. */
  popularity?: TalentPopularity;
  /** Diff badge for the compare overlay. */
  diff?: TalentDiff;
}) {
  const iconBaseUrl = useIconBaseUrl();
  const maxed = rank >= talent.maxRank;
  const visualState = talentVisualState(rank, talent.maxRank, locked, readOnly);
  const tooltipId = `talent-tooltip-${talent.id}`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
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

  // Extract spell IDs referenced in description templates (e.g. ${57518}s1)
  const referencedIds = useMemo(() => {
    const ids = new Set<number>();
    for (const q of rankSpellQueries) {
      if (!q.data) continue;
      for (const template of [getEnglishText(q.data.description), getEnglishText(q.data.aura_description)]) {
        if (template) extractReferencedSpellIds(template).forEach((id) => ids.add(id));
      }
    }
    return Array.from(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-derive when any rank spell loads
  }, [rankSpellQueries.map((q) => q.dataUpdatedAt).join(",")]);

  // Fetch referenced spells
  const refQueries = useQueries({
    queries: referencedIds.map((id) => ({
      queryKey: ["wowdb", "spell", String(id)],
      queryFn: async () => {
        const res = await fetch(`/api/v1/wowdb/spell/${id}`);
        if (!res.ok) return null;
        return res.json() as Promise<WoWSpell>;
      },
      staleTime: Infinity,
      retry: false,
    })),
  });

  const referencedSpells = useMemo(() => {
    const map = new Map<number, WoWSpell>();
    referencedIds.forEach((id, i) => {
      const data = refQueries[i]?.data;
      if (data) map.set(id, data);
    });
    return map;
  }, [referencedIds, refQueries]);

  // Resolve description text for each rank spell.
  // Wait until all referenced spells are loaded so templates like ${57518}s1
  // fully resolve — otherwise partially-resolved text breaks the rank ladder merge.
  const refsReady = referencedIds.length === 0 || refQueries.every((q) => !q.isPending);
  const fetchedRankTexts = rankSpellQueries.map((q) => {
    if (!q.data || !refsReady) return "";
    const desc = resolveSpellDescription(q.data, getEnglishText(q.data.description), referencedSpells);
    if (desc) return desc;
    return resolveSpellDescription(q.data, getEnglishText(q.data.aura_description), referencedSpells) ?? "";
  });

  // Determine which spell IDs to query
  const currentSpellId = rank > 0 ? talent.spellRanks[rank - 1] : undefined;

  // Use fetched description for primary spell too
  const primarySpell = currentSpellId
    ? rankSpellQueries[rank - 1]?.data
    : rankSpellQueries[rank]?.data ?? rankSpellQueries[0]?.data;
  const description = (primarySpell
    ? resolveSpellDescription(primarySpell, getEnglishText(primarySpell.description), referencedSpells)
      || resolveSpellDescription(primarySpell, getEnglishText(primarySpell.aura_description), referencedSpells)
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
    tooltipPosition && talent.spellRanks.length > 0 && (rankSpellQueries.some((q) => q.isPending) || refQueries.some((q) => q.isPending))
  );
  const lockReasons = locked ? lockedTalentReasons(talent, talents, ranks, pointsExhausted) : [];


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
  const tooltipPinned = useRef(false);
  const hideTooltip = () => {
    if (tooltipPinned.current) return;
    setTooltipPosition(undefined);
  };
  const unpinAndHide = () => {
    tooltipPinned.current = false;
    setTooltipPosition(undefined);
  };

  useEffect(() => {
    if (!tooltipPosition || typeof document === "undefined") return undefined;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (buttonRef.current?.contains(target)) return;
      // On mobile the -/+ quick buttons live in the wrapper next to the
      // talent; taps on them must not dismiss the active state.
      if (wrapperRef.current?.contains(target)) return;
      unpinAndHide();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") unpinAndHide();
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
      popularity={popularity}
      diff={diff}
      className={TALENT_TOOLTIP_CLASS_NAME}
      position={tooltipPosition}
    />
  );

  // Mobile quick actions: pinned to the last talent tapped (not tied to the
  // tooltip, which comes and goes with focus/blur and would flicker).
  const showQuickButtons = Boolean(mobile && !readOnly && quickActive);
  const quickButtonClass = "pointer-events-auto flex h-6 w-9 items-center justify-center text-sm font-bold transition disabled:opacity-35";
  // The tooltip prefers to open below the talent — the pill's default spot.
  // When it does, flip the pill above the talent so it stays visible.
  const tooltipIsBelow = Boolean(
    tooltipPosition &&
    buttonRef.current &&
    tooltipPosition.top >= buttonRef.current.getBoundingClientRect().bottom,
  );

  const talentButton = (
    <button
      ref={buttonRef}
      type="button"
      title=""
      aria-disabled={locked || readOnly}
      aria-describedby={tooltipId}
      data-talent-tooltip-trigger="true"
      data-state={visualState}
      data-talent-id={talent.id}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={(event) => {
        // Keep the tooltip open when focus moves to the -/+ quick buttons.
        if (event.relatedTarget instanceof Node && wrapperRef.current?.contains(event.relatedTarget)) return;
        hideTooltip();
      }}
      onClick={(event) => {
        if (readOnly) return;
        showTooltip();
        onActivate?.();
        if (event.shiftKey || event.metaKey) onChange(Math.max(0, rank - 1));
        else if (event.ctrlKey) onChange(talent.maxRank);
        else onChange(Math.min(talent.maxRank, rank + 1));
      }}
      onContextMenu={(event) => {
        if (readOnly) return;
        event.preventDefault();
        // Ctrl+right-click removes all points from the talent.
        if (event.ctrlKey) onChange(0);
        else onChange(Math.max(0, rank - 1));
      }}
      onAuxClick={(event) => {
        if (!debug || event.button !== 1) return;
        event.preventDefault();
        tooltipPinned.current = true;
        showTooltip();
        const spellId = talent.spellRanks[Math.max(0, rank - 1)] ?? talent.spellRanks[0];
        if (spellId != null) void navigator.clipboard.writeText(String(spellId));
      }}
      className={cn(
        "group relative rounded-sm border bg-zinc-950 shadow-lg transition before:absolute before:-inset-0.5 before:rounded-sm before:content-['']",
        mobile ? "h-11 w-11" : "h-12 w-12",
        visualState === "locked" && "talent-state-locked cursor-not-allowed border-zinc-700 opacity-75 before:bg-black/10",
        visualState === "available" && "talent-state-available border-primary/70 shadow-primary/20 before:border before:border-primary/35 hover:scale-105 hover:border-primary hover:shadow-primary/30",
        visualState === "selected" && "talent-state-selected border-emerald-300/80 shadow-emerald-500/20 ring-1 ring-emerald-300/45 before:border before:border-emerald-300/35 hover:scale-105 hover:border-emerald-200",
        visualState === "maxed" && "talent-state-maxed border-amber-300 shadow-amber-400/25 ring-2 ring-amber-300/55 before:border before:border-amber-200/50 before:shadow-[0_0_14px_rgba(251,191,36,0.28)] hover:scale-105 hover:border-amber-200",
      )}
    >
      <img src={iconUrl(talent.iconTexture, iconBaseUrl)} alt="" className={cn("h-full w-full rounded object-cover", visualState === "locked" && "talent-locked-icon-readable grayscale opacity-70 contrast-110")} />
      {visualState === "locked" && <span className="talent-locked-icon-veil absolute inset-0 rounded bg-black/25" />}
      {maxed && <span className="pointer-events-none absolute inset-0 rounded bg-amber-300/10 shadow-[inset_0_0_12px_rgba(251,191,36,0.38)]" />}
      {visualState === "available" && <span className="pointer-events-none absolute inset-0 rounded bg-primary/10 shadow-[inset_0_0_10px_rgba(20,184,166,0.22)]" />}
      {visualState === "selected" && <span className="pointer-events-none absolute inset-0 rounded bg-emerald-300/10 shadow-[inset_0_0_10px_rgba(16,185,129,0.28)]" />}
      <span className={cn(
        "absolute -bottom-1 -right-1 rounded border px-1 text-[10px] font-bold shadow-sm",
        visualState === "maxed" ? "border-amber-100/70 bg-amber-300 text-black" : visualState === "selected" ? "border-emerald-100/50 bg-emerald-500 text-black" : visualState === "available" ? "border-primary/60 bg-primary/85 text-black" : "border-zinc-500/70 bg-zinc-900 text-zinc-100",
      )}>
        {rank}/{talent.maxRank}
      </span>
      {diff && (
        <span className={cn(
          // Same slot as the popularity badge (mutually exclusive overlays).
          "absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded border px-1 text-[9px] font-bold leading-[13px] shadow-sm",
          diff.delta > 0
            ? "border-emerald-300/60 bg-emerald-900/95 text-emerald-200"
            : "border-red-300/60 bg-red-950/95 text-red-200",
        )}>
          {diff.delta > 0 ? `+${diff.delta}` : diff.delta}
        </span>
      )}
      {popularity && (
        <>
          <span className={cn(
            // Centered above the square (in the row gap) so it never covers
            // the icon or wraps.
            "absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded border px-1 text-[9px] font-bold leading-[13px] shadow-sm",
            popularity.pct >= 80
              ? "border-amber-200/70 bg-amber-300 text-black"
              : popularity.pct >= 40
                ? "border-sky-300/60 bg-sky-900/95 text-sky-100"
                : "border-zinc-500/70 bg-zinc-900/95 text-zinc-300",
          )}>
            {popularity.pct}%
          </span>
          {/* Average-rank bars under the square: filled = avg points taken.
              Always spans the full square width regardless of maxRank.
              Amber when takers average a full fill, blue otherwise. */}
          {/* Fixed-height container with h-full pips so every talent's bar
              row renders at exactly the same height regardless of maxRank. */}
          <span aria-hidden="true" className="absolute -bottom-2 inset-x-0 z-10 flex h-1 items-stretch gap-0.5">
            {Array.from({ length: talent.maxRank }).map((_, index) => (
              <span
                key={index}
                className={cn(
                  "h-full flex-1 rounded-[1px]",
                  index >= Math.round(popularity.avg)
                    ? "bg-zinc-700"
                    : popularity.avg >= talent.maxRank ? "bg-amber-300" : "bg-sky-400",
                )}
              />
            ))}
          </span>
        </>
      )}
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
          popularity={popularity}
          diff={diff}
          className={TALENT_TOOLTIP_SSR_CLASS_NAME}
        />
      ) : tooltipPosition ? createPortal(tooltip, document.body) : null}
    </button>
  );

  if (!mobile) return talentButton;

  return (
    <div ref={wrapperRef} data-talent-quick-zone="true" className="relative">
      {talentButton}
      {showQuickButtons && (
        <div className={cn(
          "absolute left-1/2 z-20 flex -translate-x-1/2 divide-x divide-zinc-700 overflow-hidden rounded-md border border-zinc-600 bg-zinc-950/95 shadow-lg",
          tooltipIsBelow ? "-top-7" : "-bottom-7",
        )}>
          <button
            type="button"
            aria-label={`Remove point from ${talent.name}`}
            disabled={rank === 0}
            className={cn(quickButtonClass, "text-red-300 active:bg-red-400/20")}
            onClick={(event) => {
              event.stopPropagation();
              showTooltip();
              onChange(Math.max(0, rank - 1));
            }}
          >
            −
          </button>
          <button
            type="button"
            aria-label={`Add point to ${talent.name}`}
            disabled={maxed || locked}
            className={cn(quickButtonClass, "text-emerald-300 active:bg-emerald-400/20")}
            onClick={(event) => {
              event.stopPropagation();
              showTooltip();
              onChange(Math.min(talent.maxRank, rank + 1));
            }}
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Talent tab (single tree) ─────────────────────────────────────

function TalentTab({
  tab,
  ranks,
  readOnly,
  onRankChange,
  onReset,
  debug,
  compact,
  pointsExhausted,
  buildLocked,
  mobile,
  quickActiveTalentId,
  onQuickActivate,
  popularity,
  diff,
}: {
  tab: TalentTabData;
  ranks: TalentRanks;
  readOnly: boolean;
  onRankChange: (talent: TalentEntry, rank: number) => void;
  onReset: () => void;
  debug?: boolean;
  compact?: boolean;
  /** True when no more points can be spent (max reached or build locked). */
  pointsExhausted?: boolean;
  /** True when the build is manually locked — all changes (add/remove) are blocked. */
  buildLocked?: boolean;
  /** Touch layout: full-bleed card with an upscaled grid. */
  mobile?: boolean;
  /** Mobile: id of the last talent tapped anywhere in the viewer. */
  quickActiveTalentId?: number | null;
  /** Mobile: mark a talent as the active one. */
  onQuickActivate?: (talentId: number) => void;
  /** Per-talent popularity badges (Top Builds "Show all" overlay). */
  popularity?: Record<number, TalentPopularity> | null;
  /** Per-talent diff badges (compare overlay). */
  diff?: Record<number, TalentDiff> | null;
}) {
  const iconBaseUrl = useIconBaseUrl();
  const points = useMemo(() => talentTabPoints(tab, ranks), [tab, ranks]);
  const arrows = useMemo(() => prerequisiteArrows(tab.talents), [tab.talents]);
  const rows = useMemo(() => talentGridRows(tab.talents), [tab.talents]);
  const height = talentGridHeight(rows);
  const backgroundUrl = talentBackgroundUrl(tab.backgroundFile, iconBaseUrl);
  const [failedBackgroundUrl, setFailedBackgroundUrl] = useState<string | null>(null);
  const showBackground = isTalentBackgroundVisible(backgroundUrl, failedBackgroundUrl);

  // In compact mode, scale the grid section to fit a smaller footprint.
  // The grid is rendered at full internal size (so arrow geometry works)
  // then CSS-scaled down. We compute the scaled dimensions for the wrapper.
  const compactScale = 0.68;
  const scaledGridWidth = compact
    ? (TALENT_GRID_WIDTH + TALENT_GRID_GAP * 2) * compactScale
    : undefined;
  const scaledGridHeight = compact
    ? (height + TALENT_GRID_GAP * 2) * compactScale
    : undefined;

  // On mobile, upscale the grid to fill the viewport width (same transform
  // trick as compact, but scaling up). Track the viewport for rotations.
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerWidth,
  );
  useEffect(() => {
    if (!mobile || typeof window === "undefined") return undefined;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mobile]);
  // Side gutters keep the edge-column -/+ quick buttons from being cut off
  // at the screen edges; cap the upscale so tablets don't get comical.
  const mobileGutter = 16;
  const mobileScale = mobile
    ? Math.min(1.6, Math.max(1, (viewportWidth - mobileGutter * 2 - 8) / TALENT_GRID_WIDTH))
    : undefined;

  return (
    <section id={mobile ? `talent-tree-${tab.id}` : undefined} className={cn(
      "talent-tree-card relative max-w-full self-start overflow-hidden rounded-lg border border-amber-400/20 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.14),transparent_32%),linear-gradient(180deg,rgba(120,83,38,0.16),rgba(9,9,11,0.58))] shadow-2xl shadow-black/30",
      compact ? "p-2" : mobile ? "scroll-mt-12 rounded-none border-x-0 px-0 py-3" : "p-4",
    )} aria-label={`${tab.name} talent tree`}>
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
      <div className={cn(
        "flex items-center justify-between rounded-lg border border-white/10 bg-black/30 shadow-inner shadow-black/30",
        compact ? "mb-1.5 gap-2 p-1.5" : mobile ? "mx-2 mb-3 gap-3 p-2" : "mb-4 gap-3 p-2",
      )}>
        <div className={cn("flex min-w-0 items-center", compact ? "gap-2" : "gap-3")}>
          {!compact && (
            <span className="rounded-lg border border-amber-300/35 bg-black/45 p-1 shadow-lg shadow-black/35">
              <img src={iconUrl(tab.iconTexture, iconBaseUrl)} alt="" className="h-10 w-10 rounded border border-primary/25 object-cover" />
            </span>
          )}
          {compact && (
            <img src={iconUrl(tab.iconTexture, iconBaseUrl)} alt="" className="h-6 w-6 rounded border border-primary/25 object-cover" />
          )}
          <div className="min-w-0">
            <h3 className={cn("truncate font-bold text-white", compact ? "text-xs" : "text-xl")}>{tab.name}</h3>
            <p className={cn("font-semibold text-amber-100/85", compact ? "text-[10px] leading-tight" : "text-sm")}>{points} points</p>
          </div>
        </div>
        {!readOnly && !compact && (
          <button
            type="button"
            aria-label={`Reset ${tab.name} tree`}
            className="shrink-0 rounded-md border border-amber-300/30 bg-zinc-950/60 px-2.5 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-amber-100/80 transition hover:border-amber-200/60 hover:bg-amber-300/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
            disabled={points === 0 || buildLocked}
            onClick={onReset}
          >
            Reset tree
          </button>
        )}
      </div>
      <div className={cn(
        "overscroll-x-contain touch-manipulation sm:mx-0 sm:px-0",
        compact ? "pb-1" : mobile ? "pb-2" : "-mx-4 overflow-x-auto px-4 pb-3",
      )} aria-label="Scrollable talent tree grid">
        <div
          className={cn(
            "relative mx-auto",
            // Mobile stays overflow-visible so the -/+ quick buttons are not
            // clipped at the grid edges.
            compact ? "overflow-hidden rounded border border-white/5 bg-black/25" : mobile ? "bg-black/25 py-2" : "overflow-hidden rounded-lg border border-white/5 bg-black/25 p-3",
          )}
          style={compact
            ? { width: `${scaledGridWidth}px`, height: `${scaledGridHeight}px` }
            : mobile && mobileScale
              ? {
                  width: `${TALENT_GRID_WIDTH * mobileScale + mobileGutter * 2}px`,
                  height: `${height * mobileScale + 16}px`,
                  paddingLeft: `${mobileGutter}px`,
                  paddingRight: `${mobileGutter}px`,
                }
              : { width: `${TALENT_GRID_WIDTH + TALENT_GRID_GAP * 2}px`, maxWidth: "100%" }
          }
        >
          <div
            className="relative"
            style={compact
              ? {
                  width: `${TALENT_GRID_WIDTH}px`,
                  height: `${height}px`,
                  transform: `scale(${compactScale})`,
                  transformOrigin: "top left",
                }
              : mobile && mobileScale
                ? {
                    width: `${TALENT_GRID_WIDTH}px`,
                    height: `${height}px`,
                    transform: `scale(${mobileScale})`,
                    transformOrigin: "top left",
                  }
                : { width: `${TALENT_GRID_WIDTH}px`, height: `${height}px` }
            }
          >
            <TalentPrereqArrows arrows={arrows} ranks={ranks} height={height} talents={tab.talents} buttonSize={mobile ? 44 : 48} />
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
                          locked={(ranks[t.id] ?? 0) === 0 && (Boolean(pointsExhausted) || !canUseTalent(t, tab.talents, ranks))}
                          pointsExhausted={pointsExhausted}
                          talents={tab.talents}
                          ranks={ranks}
                          readOnly={readOnly}
                          debug={debug}
                          mobile={mobile}
                          quickActive={quickActiveTalentId === t.id}
                          onActivate={mobile && onQuickActivate ? () => onQuickActivate(t.id) : undefined}
                          popularity={popularity?.[t.id]}
                          diff={diff?.[t.id]}
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

// ─── Mobile sticky tree tabs ──────────────────────────────────────

/** Sticky chip bar on mobile: jump-scroll between the stacked trees. */
function MobileTreeTabs({ tabs, ranks, visibleTabId, onJump }: {
  tabs: TalentTabData[];
  ranks: TalentRanks;
  visibleTabId: number | null;
  onJump: (tabId: number) => void;
}) {
  const iconBaseUrl = useIconBaseUrl();
  return (
    <div className="sticky top-0 z-40 -mx-4 flex gap-1 border-b border-amber-400/20 bg-zinc-950/95 px-2 py-1.5 backdrop-blur">
      {tabs.map((tab) => {
        const points = tab.talents.reduce((sum, talent) => sum + (ranks[talent.id] ?? 0), 0);
        const active = tab.id === visibleTabId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onJump(tab.id)}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-bold transition",
              active
                ? "border-amber-300/60 bg-amber-400/15 text-amber-100"
                : "border-transparent bg-zinc-900/60 text-zinc-400",
            )}
          >
            <img src={iconUrl(tab.iconTexture, iconBaseUrl)} alt="" className="h-4 w-4 shrink-0 rounded" />
            <span className="truncate">{tab.name}</span>
            <span className={cn("shrink-0 tabular-nums", active ? "text-amber-200/90" : "text-zinc-500")}>{points}</span>
          </button>
        );
      })}
    </div>
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

// ─── PNG export watermark ─────────────────────────────────────────

const EXPORT_LOGO_URL = "/c/chronicle/ChronicleLogoCenter.svg";
const EXPORT_LOGO_HEIGHT = 32; // CSS pixels, scaled by pixelRatio
const EXPORT_LOGO_MARGIN = 12;

/** Draws the Chronicle logo in the bottom-right corner of the export canvas. */
async function drawExportWatermark(canvas: HTMLCanvasElement, pixelRatio: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const logo = new Image();
  logo.src = EXPORT_LOGO_URL;
  try {
    await logo.decode();
  } catch {
    return; // Logo failed to load — export without the watermark.
  }
  const height = EXPORT_LOGO_HEIGHT * pixelRatio;
  const width = (logo.naturalWidth / logo.naturalHeight) * height;
  const margin = EXPORT_LOGO_MARGIN * pixelRatio;
  ctx.globalAlpha = 0.9;
  ctx.drawImage(logo, canvas.width - width - margin, canvas.height - height - margin, width, height);
  ctx.globalAlpha = 1;
}

// ─── Main component ───────────────────────────────────────────────

export function TalentTreeViewer({
  data,
  allocations,
  maxTalentPoints = 51,
  maxLevel = 60,
  showRequiredLevel = true,
  readOnly = false,
  compact = false,
  extraActions,
  mobileHeader,
  popularity,
  diff,
  className,
}: TalentTreeViewerProps) {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabTalentLists = useMemo(() => data.tabs.map((tab) => tab.talents), [data.tabs]);
  const deepestTabRows = useMemo(() => Math.max(...data.tabs.map((tab) => talentGridRows(tab.talents)), 0), [data.tabs]);
  // Interactive mobile layout breaks out of the page's px-4 gutter (-mx-4)
  // so each tree card can use the whole screen width.
  const mobileLayout = isMobile && !compact && !readOnly;
  const tabGridClassName = compact
    ? "grid min-w-0 gap-2 grid-cols-3"
    : mobileLayout
      ? "-mx-4 grid min-w-0 gap-3"
      : deepestTabRows > 7 ? "grid min-w-0 gap-4 xl:grid-cols-2 2xl:grid-cols-3" : "grid min-w-0 gap-4 xl:grid-cols-3";
  const maxPoints = maxTalentPoints;
  const flavor = useMemo(() => ({ maxLevel, maxTalentPoints }), [maxLevel, maxTalentPoints]);

  // Compute initial ranks from allocations or URL.
  // Allocations come from parsed combat logs (backend truth), so they are not
  // capped at maxPoints — a TBC/wrath log would otherwise lose points when
  // rendered with the vanilla default cap.
  const initialRanks = useMemo(() => {
    if (allocations && allocations.length > 0) {
      return normalizeTalentRanks(tabTalentLists, allocationsToRanks(data.tabs, allocations));
    }
    return normalizeTalentRanks(tabTalentLists, decodeTalentBuild(searchParams.get(TALENT_BUILD_PARAM), tabTalentLists), maxPoints);
  }, [allocations, data.tabs, maxPoints, searchParams, tabTalentLists]);

  const [ranks, setRanks] = useState<TalentRanks>(initialRanks);
  // Mobile: last talent tapped anywhere; its -/+ quick buttons stay visible
  // until a different talent is tapped or the user taps elsewhere.
  const [quickActiveTalentId, setQuickActiveTalentId] = useState<number | null>(null);

  // Mobile: which tree is currently on screen, for the sticky mini-tabs.
  const [visibleTabId, setVisibleTabId] = useState<number | null>(null);
  useEffect(() => {
    if (!mobileLayout || typeof document === "undefined") return undefined;
    const sections = data.tabs
      .map((tab) => document.getElementById(`talent-tree-${tab.id}`))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return undefined;
    // Highlight the tree crossing the upper-middle band of the viewport.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = Number(entry.target.id.replace("talent-tree-", ""));
          if (!Number.isNaN(id)) setVisibleTabId(id);
        }
      },
      { rootMargin: "-15% 0px -65% 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [data.tabs, mobileLayout]);

  function jumpToTree(tabId: number) {
    document.getElementById(`talent-tree-${tabId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Clear the quick buttons when tapping outside any talent ("clear the context").
  useEffect(() => {
    if (quickActiveTalentId === null || typeof document === "undefined") return undefined;
    const clearOnOutsideTap = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      // Taps on a talent (or its -/+ buttons) are handled by the talent itself.
      if (target.closest("[data-talent-quick-zone]")) return;
      setQuickActiveTalentId(null);
    };
    document.addEventListener("pointerdown", clearOnOutsideTap);
    return () => document.removeEventListener("pointerdown", clearOnOutsideTap);
  }, [quickActiveTalentId]);
  const total = useMemo(() => totalTalentPoints(ranks), [ranks]);
  const requiredLevel = useMemo(() => calculateRequiredPlayerLevel(total, flavor), [flavor, total]);

  // Manual lock (stored in the URL): blacks out unspent talents early, e.g.
  // to plan a level-20 build. Only meaningful in interactive mode.
  const manuallyLocked = !readOnly && !allocations && isTalentBuildLocked(searchParams);
  // Points are exhausted when the build is manually locked or all points are spent.
  // During PNG export we force exhausted=true so the image always shows the
  // "locked" visual for unspent talents.
  const [exportLock, setExportLock] = useState(false);
  const pointsExhausted = !readOnly && !allocations && (exportLock || manuallyLocked || total >= maxPoints);

  // Sync ranks when external inputs (data, URL params, allocations) change.
  // This is a legitimate prop→state synchronization — ranks are also updated
  // by user clicks via commitRanks(), so we can't simply derive them.
  useEffect(() => {
    if (allocations && allocations.length > 0) {
      // Backend-provided allocations are not capped at maxPoints (see initialRanks).
      setRanks(normalizeTalentRanks(tabTalentLists, allocationsToRanks(data.tabs, allocations)));
    } else {
      setRanks(normalizeTalentRanks(tabTalentLists, decodeTalentBuild(searchParams.get(TALENT_BUILD_PARAM), tabTalentLists), maxPoints));
    }
  }, [data.id, maxPoints, searchParams, tabTalentLists, allocations, data.tabs]);

  function commitRanks(nextRanks: TalentRanks) {
    setRanks(nextRanks);
    if (!readOnly && !allocations) {
      setSearchParams(searchParamsWithTalentBuild(searchParams, nextRanks, tabTalentLists), { replace: true });
    }
  }

  function toggleLock() {
    setSearchParams(searchParamsWithTalentLock(searchParams, !manuallyLocked), { replace: true });
  }

  function notifyBuildLocked() {
    toast.warning("Talent build is locked", {
      // Stable id so rapid clicking re-uses one toast instead of stacking.
      id: "talent-build-locked",
      description: "Unlock the build to add or remove talent points.",
      action: {
        label: "Unlock",
        onClick: () => setSearchParams(searchParamsWithTalentLock(searchParams, false), { replace: true }),
      },
    });
  }

  async function copyBuildLink() {
    if (typeof window === "undefined") return;
    await copyTalentBuildUrl(navigator.clipboard, window.location.href, ranks, tabTalentLists);
    toast.success("Link copied to clipboard", { id: "talent-build-link-copied" });
  }

  const exportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [hideEmptyTrees, setHideEmptyTrees] = useState(false);
  const exportedTabs = exporting && hideEmptyTrees ? populatedTalentTabs(data.tabs, ranks) : data.tabs;
  const exportGridStyle = exporting && hideEmptyTrees
    ? {
        gridTemplateColumns: `repeat(${exportedTabs.length}, minmax(0, 1fr))`,
        width: "max-content",
        maxWidth: "none",
      }
    : undefined;
  async function exportAsPng() {
    const node = exportRef.current;
    if (!node || exporting) return;
    // Force the "locked" visual on all unspent talents before capturing.
    // flushSync ensures React commits the DOM update synchronously so
    // toCanvas sees the grayed-out state.
    flushSync(() => { setExporting(true); setExportLock(true); });
    try {
      const pixelRatio = 2;
      // Icons and backgrounds come from the icon CDN, which serves CORS
      // headers, so html-to-image can inline them as data URLs.
      // cache: "no-cache" forces revalidation — the browser may have cached
      // these images from plain <img> loads (no Origin header), and reusing
      // that cached response for a CORS fetch fails ("cache poisoning").
      const canvas = await toCanvas(node, {
        pixelRatio,
        backgroundColor: "#09090b",
        fetchRequestInit: { cache: "no-cache" },
        // Transparent 1x1 pixel so a single unloadable icon doesn't abort
        // the whole export.
        imagePlaceholder:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      });
      await drawExportWatermark(canvas, pixelRatio);
      // data.name may be missing from the talent JSON; fall back to the
      // class-id lookup, then a generic label.
      const className = data.name ?? CLASS_NAMES[data.id] ?? "class";
      const link = document.createElement("a");
      link.download = `${talentBuildExportName(data.tabs, ranks, className)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      console.error("Talent tree PNG export failed", error);
    } finally {
      setExporting(false);
      setExportLock(false);
    }
  }

  // Mobile interactive layout: one calm card — page header on top, labeled
  // stats + actions below (see design discussion in PR).
  if (mobileLayout) {
    return (
      <div className={cn("space-y-0", className)}>
        {/* Header card shares the tree cards' full-bleed footprint and warm
            gradient so the page reads as one continuous column. */}
        <div className="relative -mx-4 overflow-hidden border-y border-amber-400/20 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.14),transparent_32%),linear-gradient(180deg,rgba(120,83,38,0.16),rgba(9,9,11,0.58))]">
          <div className="pointer-events-none absolute inset-0 bg-black/45" aria-hidden="true" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/40 to-transparent" aria-hidden="true" />
          <div className="relative">
            {mobileHeader && <div className="border-b border-white/10 p-4">{mobileHeader}</div>}
            <div className="flex items-center gap-4 px-4 py-3">
              {showRequiredLevel && (
                <>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100/60">Level</p>
                    <p className="text-lg font-bold leading-tight text-white">{requiredLevel}</p>
                  </div>
                  <div className="h-8 w-px bg-amber-200/15" />
                </>
              )}
              {/* Points doubles as the lock toggle, like the desktop chip. */}
              <button type="button" aria-pressed={manuallyLocked} onClick={toggleLock} className="text-left">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100/60">
                  Points
                  {manuallyLocked ? <Lock className="h-3 w-3 text-amber-300" /> : <LockOpen className="h-3 w-3" />}
                </p>
                <p className="text-lg font-bold leading-tight">
                  <span className="text-amber-300">{total}</span>
                  <span className="text-zinc-500">/{maxPoints}</span>
                </p>
              </button>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber-300/30 bg-zinc-950/60 px-3 py-1.5 text-sm font-semibold text-amber-100/90 transition hover:border-amber-200/60 hover:bg-amber-300/10 hover:text-white"
                  onClick={() => void copyBuildLink()}
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Share
                </button>
                <button
                  type="button"
                  disabled={manuallyLocked}
                  className="rounded-md border border-white/10 bg-zinc-950/40 px-3 py-1.5 text-sm font-semibold text-zinc-400 transition hover:border-red-400/60 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => commitRanks({})}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>
        <MobileTreeTabs tabs={data.tabs} ranks={ranks} visibleTabId={visibleTabId} onJump={jumpToTree} />
        <div ref={exportRef} className={tabGridClassName} style={exportGridStyle}>
          {exportedTabs.map((tab) => (
            <TalentTab
              key={tab.id}
              tab={tab}
              ranks={ranks}
              readOnly={readOnly}
              compact={compact}
              debug={searchParams.get("debug") === "true"}
              pointsExhausted={pointsExhausted}
              buildLocked={manuallyLocked}
              mobile={mobileLayout}
              quickActiveTalentId={quickActiveTalentId}
              onQuickActivate={setQuickActiveTalentId}
              popularity={popularity}
              diff={diff}
              onRankChange={(talent, rank) => {
                if (manuallyLocked) {
                  notifyBuildLocked();
                  return;
                }
                commitRanks(updateTalentRank(talent, rank, tab.talents, ranks, { maxPoints }));
              }}
              onReset={() => {
                if (manuallyLocked) {
                  notifyBuildLocked();
                  return;
                }
                commitRanks(resetTalentTabRanks(tabTalentLists, ranks, tab.talents, maxPoints));
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Summary bar — hidden in readOnly mode with allocations */}
      {!(readOnly && allocations) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {showRequiredLevel && (
              <div className="rounded-md border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-sm font-bold text-white">
                Level {requiredLevel}
              </div>
            )}
            {!readOnly && (
              <>
                {isMobile ? (
                  /* Mobile (readOnly-less non-mobileLayout fallback): icon-only share. */
                  <button
                    type="button"
                    aria-label="Copy build link"
                    className="rounded-md border border-primary/50 bg-primary/15 p-1.5 text-white hover:bg-primary/25"
                    onClick={() => void copyBuildLink()}
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                ) : (
                  <>
                    <button type="button" className="rounded-md border border-primary/50 bg-primary/15 px-2.5 py-1 text-sm font-bold text-white hover:bg-primary/25" onClick={() => void copyBuildLink()}>
                      Copy link
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          disabled={exporting}
                          title="Export the talent trees as a PNG image"
                          className="inline-flex items-center gap-1.5 rounded-md border border-primary/50 bg-primary/15 px-2.5 py-1 text-sm font-bold text-white hover:bg-primary/25 disabled:cursor-wait disabled:opacity-60"
                        >
                          <ImageDown className="h-3.5 w-3.5" />
                          {exporting ? "Exporting…" : "Export PNG"}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-48">
                        <DropdownMenuItem
                          disabled={total === 0}
                          onSelect={(event) => {
                            event.preventDefault();
                            setHideEmptyTrees((checked) => !checked);
                          }}
                        >
                          <Checkbox checked={hideEmptyTrees} className="pointer-events-none" />
                          Hide empty trees
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => void exportAsPng()}>
                          <ImageDown className="h-4 w-4" />
                          Download PNG
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
                <button
                  type="button"
                  disabled={manuallyLocked}
                  title={manuallyLocked ? "Unlock the build to reset" : undefined}
                  className="rounded-md border border-red-500/50 bg-red-500/15 px-2.5 py-1 text-sm font-medium text-red-400 hover:bg-red-500/25 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-red-500/15 disabled:hover:text-red-400"
                  onClick={() => commitRanks({})}
                >
                  Reset
                </button>
                <button
                  type="button"
                  aria-pressed={manuallyLocked}
                  aria-label={manuallyLocked ? "Unlock build" : "Lock build"}
                  title={manuallyLocked ? "Unlock build to spend more points" : "Lock build at the current points"}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-bold transition",
                    manuallyLocked
                      ? "border-amber-300/70 bg-amber-400/20 text-amber-100 hover:bg-amber-400/30"
                      : "border-zinc-600/70 bg-zinc-900/50 text-zinc-300 hover:border-zinc-400 hover:text-white",
                  )}
                  onClick={toggleLock}
                >
                  {total}/{maxPoints}
                  {manuallyLocked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                </button>
              </>
            )}
          </div>
          {extraActions && !readOnly && (
            <div className="flex items-center gap-2">{extraActions}</div>
          )}
        </div>
      )}
      {!(readOnly && allocations) && !readOnly && !isMobile && (
        <p className="text-sm text-muted-foreground">
          Click to add. Right-click or shift-click to remove. Ctrl-click to fill a talent, ctrl-right-click to empty it. Builds are stored in the URL.
        </p>
      )}
      {/* Mobile: sticky mini-tabs to jump between the stacked trees */}
      {mobileLayout && <MobileTreeTabs tabs={data.tabs} ranks={ranks} visibleTabId={visibleTabId} onJump={jumpToTree} />}
      <div ref={exportRef} className={tabGridClassName} style={exportGridStyle}>
        {exportedTabs.map((tab) => (
          <TalentTab
            key={tab.id}
            tab={tab}
            ranks={ranks}
            readOnly={readOnly}
            compact={compact}
            debug={searchParams.get("debug") === "true"}
            pointsExhausted={pointsExhausted}
            buildLocked={manuallyLocked}
            mobile={mobileLayout}
            quickActiveTalentId={quickActiveTalentId}
            onQuickActivate={setQuickActiveTalentId}
            popularity={popularity}
            diff={diff}
            // A locked build is frozen: no points may be added or removed.
            onRankChange={(talent, rank) => {
              if (manuallyLocked) {
                notifyBuildLocked();
                return;
              }
              commitRanks(updateTalentRank(talent, rank, tab.talents, ranks, { maxPoints }));
            }}
            onReset={() => {
              if (manuallyLocked) {
                notifyBuildLocked();
                return;
              }
              commitRanks(resetTalentTabRanks(tabTalentLists, ranks, tab.talents, maxPoints));
            }}
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
  compact?: boolean;
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
  compact,
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
      compact={compact}
      className={className}
    />
  );
}

export default TalentTreeViewer;
