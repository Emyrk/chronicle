import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { iconUrl } from "@/config/iconUrl";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSpell } from "@/api/queries";
import { SpellTooltip } from "@/pages/WoWDB/SpellTooltip";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip/tooltip";

// ─── Types matching /wowdb/talent-trees response ─────────────────

interface TalentEntry {
  id: number;
  tierID: number;
  columnIndex: number;
  maxRank: number;
  tabIndex: number;
  spellRanks: number[];
  prereqTalent?: number[];
  prereqRank?: number[];
  iconTexture: string;
}

interface TalentTabData {
  id: number;
  name: string;
  backgroundFile: string;
  orderIndex: number;
  spellIconID: number;
  iconTexture: string;
  talents: TalentEntry[];
}

interface ClassTalentData {
  tabs: TalentTabData[];
}

interface TalentTreeJSON {
  classes: Record<string, ClassTalentData>;
}

// ─── Props ────────────────────────────────────────────────────────

export interface TalentAllocation {
  /** Tab name (e.g., "Arms") */
  tabName: string;
  /** Total points spent in this tab */
  pointsSpent: number;
  /** One digit per talent in tab-index order: rank per talent */
  rankDigits: string;
}

export interface TalentTreeViewerProps {
  /** WoW class ID (1=Warrior, 2=Paladin, etc.) */
  classId: number;
  /** Optional talent allocations from combat log. If omitted, shows empty tree. */
  allocations?: TalentAllocation[];
  /**
   * Dataset to load talent trees from. If omitted, the server resolves the
   * request tenant's default dataset.
   */
  datasetId?: string;
  /** Additional CSS class for the root element */
  className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────

function talentIconUrl(texture: string): string {
  return iconUrl(texture);
}

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

// Class colors matching WoW conventions
const CLASS_COLORS: Record<number, string> = {
  1: "#C69B6D",  // Warrior
  2: "#F48CBA",  // Paladin
  3: "#AAD372",  // Hunter
  4: "#FFF468",  // Rogue
  5: "#FFFFFF",  // Priest
  6: "#C41E3A",  // Death Knight
  7: "#0070DD",  // Shaman
  8: "#3FC7EB",  // Mage
  9: "#8788EE",  // Warlock
  11: "#FF7C0A", // Druid
};

// ─── Data fetching ────────────────────────────────────────────────

/**
 * Fetches talent trees for a dataset. A 404 means the dataset has no talent
 * data imported yet; that resolves to `null` (handled as a graceful empty
 * state) rather than throwing.
 */
function useTalentTrees(datasetId?: string) {
  return useQuery<TalentTreeJSON | null>({
    queryKey: ["talent-trees", datasetId ?? "default"],
    queryFn: async () => {
      const url = datasetId
        ? `/api/v1/wowdb/talent-trees?dataset_id=${encodeURIComponent(datasetId)}`
        : "/api/v1/wowdb/talent-trees";
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch talent trees");
      return res.json();
    },
    staleTime: Infinity,
  });
}

// ─── Components ───────────────────────────────────────────────────

function TalentIcon({
  talent,
  currentRank,
}: {
  talent: TalentEntry;
  currentRank: number;
}) {
  const maxed = currentRank >= talent.maxRank;
  const hasPoints = currentRank > 0;

  // Pick the spell ID for the current rank (or max rank if no allocation, or rank 1 as fallback)
  const displayRank = currentRank > 0 ? currentRank : 1;
  const spellId = talent.spellRanks[Math.min(displayRank, talent.spellRanks.length) - 1];

  // Lazy-fetch: only fetch spell data once user has hovered (desktop) or tapped (mobile)
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const isMobile = useIsMobile();
  const { data: spell } = useSpell(spellId?.toString() ?? "", {
    enabled: (hovered || pinned) && spellId != null,
  });

  const icon = (
    <div className="relative">
      {/* Icon */}
      <div
        className={cn(
          "w-10 h-10 rounded-sm border overflow-hidden relative",
          maxed
            ? "border-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]"
            : hasPoints
              ? "border-green-500"
              : "border-zinc-600",
          !hasPoints && "grayscale opacity-50"
        )}
      >
        <img
          src={talentIconUrl(talent.iconTexture)}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>

      {/* Rank badge */}
      <div
        className={cn(
          "absolute -bottom-1 -right-1 text-[10px] font-bold leading-none px-1 py-0.5 rounded-sm min-w-[18px] text-center",
          maxed
            ? "bg-amber-400 text-zinc-900"
            : hasPoints
              ? "bg-green-600 text-white"
              : "bg-zinc-700 text-zinc-400"
        )}
      >
        {currentRank}/{talent.maxRank}
      </div>
    </div>
  );

  const tooltipBody = spell ? (
    <SpellTooltip spell={spell} detailed />
  ) : (
    <div className="bg-[#1a1a2e] border-2 border-[#4a4a6a] rounded-lg px-3 py-2 text-sm text-zinc-400">
      Loading…
    </div>
  );

  if (isMobile) {
    return (
      <>
        <span className="cursor-pointer" onClick={() => setPinned(true)}>
          {icon}
        </span>
        {pinned && createPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60"
            onClick={() => setPinned(false)}
          >
            <div className="relative mx-4 max-w-[calc(100vw-2rem)]" onClick={(e) => e.stopPropagation()}>
              <button
                className="absolute -top-3 -right-3 z-10 w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center text-sm font-bold shadow-lg"
                onClick={() => setPinned(false)}
                aria-label="Close tooltip"
              >
                ✕
              </button>
              {tooltipBody}
            </div>
          </div>,
          document.body,
        )}
      </>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <span
            className="cursor-pointer"
            onMouseEnter={() => setHovered(true)}
          >
            {icon}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="start"
          sideOffset={8}
          className="p-0 bg-transparent border-0 z-[10000]"
          hideArrow
        >
          {tooltipBody}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function TalentTab({
  tab,
  allocation,
}: {
  tab: TalentTabData;
  allocation?: TalentAllocation;
}) {
  // Build grid: find max tier
  const maxTier = useMemo(
    () => Math.max(...tab.talents.map((t) => t.tierID), 0),
    [tab.talents]
  );

  // Build a 2D grid [tier][column]
  const grid = useMemo(() => {
    const g: (TalentEntry | null)[][] = [];
    for (let tier = 0; tier <= maxTier; tier++) {
      g[tier] = [null, null, null, null];
    }
    for (const talent of tab.talents) {
      if (talent.tierID <= maxTier && talent.columnIndex < 4) {
        g[talent.tierID][talent.columnIndex] = talent;
      }
    }
    return g;
  }, [tab.talents, maxTier]);

  // Parse rank digits
  const ranks = useMemo(() => {
    if (!allocation?.rankDigits) return new Map<number, number>();
    const m = new Map<number, number>();
    for (let i = 0; i < allocation.rankDigits.length; i++) {
      m.set(i, parseInt(allocation.rankDigits[i], 10) || 0);
    }
    return m;
  }, [allocation?.rankDigits]);

  const pointsSpent = allocation?.pointsSpent ?? 0;

  // Build talent-id → grid position lookup for arrows
  const talentPositions = useMemo(() => {
    const map = new Map<number, { tier: number; col: number }>();
    for (const talent of tab.talents) {
      map.set(talent.id, { tier: talent.tierID, col: talent.columnIndex });
    }
    return map;
  }, [tab.talents]);

  // Collect prerequisite arrows with target talent info for coloring
  const arrows = useMemo(() => {
    const result: { fromTier: number; fromCol: number; toTier: number; toCol: number; toTabIndex: number; toMaxRank: number }[] = [];
    for (const talent of tab.talents) {
      if (!talent.prereqTalent) continue;
      for (const prereqId of talent.prereqTalent) {
        const from = talentPositions.get(prereqId);
        if (from) {
          result.push({
            fromTier: from.tier,
            fromCol: from.col,
            toTier: talent.tierID,
            toCol: talent.columnIndex,
            toTabIndex: talent.tabIndex,
            toMaxRank: talent.maxRank,
          });
        }
      }
    }
    return result;
  }, [tab.talents, talentPositions]);

  // Grid cell dimensions (must match the className values below)
  const cellW = 48; // w-10 = 40px icon + 8px gap
  const cellH = 56; // h-12 = 48px + 8px gap (gap-2)
  const iconSize = 40; // w-10

  const svgW = 4 * cellW;
  const svgH = (maxTier + 1) * cellH;

  return (
    <div className="flex flex-col bg-zinc-900/80 rounded-lg overflow-hidden border border-zinc-700/50 shrink-0">
      {/* Tab header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/80 border-b border-zinc-700/50">
        {tab.iconTexture && (
          <img
            src={talentIconUrl(tab.iconTexture)}
            alt=""
            className="w-5 h-5 rounded-sm"
          />
        )}
        <span className="text-sm font-medium text-zinc-200">{tab.name}</span>
        <span className="text-xs text-zinc-400 ml-auto">
          {pointsSpent} pts
        </span>
      </div>

      {/* Talent grid */}
      <div className="p-3">
        <div className="relative">
          {/* Arrow SVG overlay */}
          {arrows.length > 0 && (
            <svg
              className="absolute inset-0 pointer-events-none z-0"
              width={svgW}
              height={svgH}
            >
              <defs>
                {arrows.map((a, i) => {
                  const targetRank = ranks.get(a.toTabIndex) ?? 0;
                  const fill = targetRank >= a.toMaxRank
                    ? "#fbbf24"
                    : targetRank > 0
                      ? "#22c55e"
                      : "#71717a";
                  return (
                    <marker
                      key={i}
                      id={`arrow-${tab.id}-${i}`}
                      viewBox="0 0 10 10"
                      refX="5"
                      refY="5"
                      markerWidth="5"
                      markerHeight="5"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill={fill} />
                    </marker>
                  );
                })}
              </defs>
              {arrows.map((a, i) => {
                const targetRank = ranks.get(a.toTabIndex) ?? 0;
                const color = targetRank >= a.toMaxRank
                  ? "#fbbf24" // amber-400 — maxed
                  : targetRank > 0
                    ? "#22c55e" // green-500 — partially filled
                    : "#71717a"; // zinc-500 — unused

                // Y midpoint in the gap between tier t and t+1
                const gapY = (t: number) =>
                  t * cellH + iconSize + (cellH - iconSize) / 2;

                let d: string;
                if (a.fromTier === a.toTier) {
                  // ── Same tier: horizontal side-to-side arrow ──
                  const leftToRight = a.fromCol < a.toCol;
                  const sx = a.fromCol * cellW + (leftToRight ? iconSize : 0);
                  const sy = a.fromTier * cellH + iconSize / 2;
                  const ex = a.toCol * cellW + (leftToRight ? -3 : iconSize + 3);
                  const ey = sy;
                  d = `M ${sx} ${sy} L ${ex} ${ey}`;
                } else if (a.fromCol === a.toCol) {
                  // ── Same column: straight vertical ──
                  const x = a.fromCol * cellW + iconSize / 2;
                  const y1 = a.fromTier * cellH + iconSize;
                  const y2 = a.toTier * cellH - 3;
                  d = `M ${x} ${y1} L ${x} ${y2}`;
                } else {
                  // ── Different tier + column: L-shaped routing ──
                  // Start at bottom-center of source, end at top-center of dest.
                  const sx = a.fromCol * cellW + iconSize / 2;
                  const sy = a.fromTier * cellH + iconSize;
                  const ex = a.toCol * cellW + iconSize / 2;
                  const ey = a.toTier * cellH - 3;

                  // Strategy 1: route horizontal in gap just below source tier,
                  // then down the dest column. Check dest column is clear.
                  let destBlocked = false;
                  for (let t = a.fromTier + 1; t < a.toTier; t++) {
                    if (grid[t]?.[a.toCol] != null) {
                      destBlocked = true;
                      break;
                    }
                  }

                  if (!destBlocked) {
                    const gy = gapY(a.fromTier);
                    d = `M ${sx} ${sy} L ${sx} ${gy} L ${ex} ${gy} L ${ex} ${ey}`;
                  } else {
                    // Strategy 2: down the source column, route horizontal
                    // in gap just above dest tier, then across.
                    const gy = gapY(a.toTier - 1);
                    d = `M ${sx} ${sy} L ${sx} ${gy} L ${ex} ${gy} L ${ex} ${ey}`;
                  }
                }

                return (
                  <path
                    key={i}
                    d={d}
                    stroke={color}
                    strokeWidth={2}
                    fill="none"
                    markerEnd={`url(#arrow-${tab.id}-${i})`}
                  />
                );
              })}
            </svg>
          )}
          <div className="relative z-10 grid grid-cols-4 gap-2 justify-items-center">
            {grid.map((row, tierIdx) =>
              row.map((talent, colIdx) => (
                <div
                  key={`${tierIdx}-${colIdx}`}
                  className="w-10 h-12 flex items-start justify-center"
                >
                  {talent && (
                    <TalentIcon
                      talent={talent}
                      currentRank={ranks.get(talent.tabIndex) ?? 0}
                    />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────

export function TalentTreeViewer({
  classId,
  allocations,
  datasetId,
  className,
}: TalentTreeViewerProps) {
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

  // data === null means the dataset has no talent data imported yet (404).
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

  // Match allocations to tabs by name, or by index if names are empty
  // (COMBATANT_INFO provides talents without tab names).
  const hasTabNames = allocations?.some((a) => a.tabName !== "") ?? false;
  const allocationByName = new Map<string, TalentAllocation>();
  if (allocations && hasTabNames) {
    for (const a of allocations) {
      allocationByName.set(a.tabName.toLowerCase(), a);
    }
  }

  function getAllocation(tab: TalentTabData, tabIndex: number): TalentAllocation | undefined {
    if (!allocations) return undefined;
    if (hasTabNames) return allocationByName.get(tab.name.toLowerCase());
    // Fall back to positional matching (tabs are already sorted by orderIndex)
    return allocations[tabIndex];
  }

  const totalPoints = allocations?.reduce((s, a) => s + a.pointsSpent, 0) ?? 0;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <span
          className="text-sm font-semibold"
          style={{ color: CLASS_COLORS[classId] ?? "#ccc" }}
        >
          {CLASS_NAMES[classId] ?? `Class ${classId}`}
        </span>
        {allocations && allocations.length > 0 && (
          <span className="text-xs text-zinc-400">
            ({allocations.map((a) => a.pointsSpent).join("/")} — {totalPoints} pts)
          </span>
        )}
      </div>

      {/* Three talent trees side by side */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {classData.tabs.map((tab, idx) => (
          <TalentTab
            key={tab.id}
            tab={tab}
            allocation={getAllocation(tab, idx)}
          />
        ))}
      </div>
    </div>
  );
}

export default TalentTreeViewer;
