import { useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, RotateCcw, Sparkles } from "lucide-react";
import { useTalentTrees } from "@/components/ui/TalentTreeViewer/useTalentTrees";
import type { LegacyTalentEntry, LegacyTalentTreeData } from "@/components/ui/TalentTreeViewer/talentLogic";
import { iconUrl } from "@/config/iconUrl";
import { useDatasetId, useIconBaseUrl } from "@/hooks/useDatasetId";
import { cn } from "@/lib/utils";
import {
  encodeLegacyBuild,
  legacyTalentLockReason,
  legacyTotalPoints,
  legacyTreePoints,
  normalizeLegacyBuild,
  updateLegacyTalentRank,
  type LegacyTalentRanks,
} from "./legacyTalentLogic";

const BUILD_PARAM = "build";
const NODE_SIZE = 52;
const COLUMN_STRIDE = 104;
const ROW_STRIDE = 76;
const GRID_PADDING = 30;

function edgeIDs(talent: LegacyTalentEntry) {
  return [...new Set([
    ...(talent.prereqTalent ?? []),
    ...(talent.prereqAnyTalent ?? []),
    ...(talent.visualPrereqTalent ?? []),
  ])];
}

function LegacyEdges({ tree, ranks }: { tree: LegacyTalentTreeData; ranks: LegacyTalentRanks }) {
  const byID = new Map(tree.talents.map((talent) => [talent.id, talent]));
  const edges = tree.talents.flatMap((target) => edgeIDs(target).flatMap((sourceID) => {
    const source = byID.get(sourceID);
    return source ? [{ source, target }] : [];
  }));
  const width = (Math.max(...tree.talents.map((talent) => talent.columnIndex), 0) + 1) * COLUMN_STRIDE;
  const height = (Math.max(...tree.talents.map((talent) => talent.rowIndex), 0) + 1) * ROW_STRIDE;

  return (
    <svg className="pointer-events-none absolute inset-0 z-0" width={width} height={height} aria-hidden="true">
      <defs>
        <marker id={`legacy-arrow-${tree.id}`} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0.5 0.75 L5.5 3 L0.5 5.25 Z" className="fill-amber-300" />
        </marker>
      </defs>
      {edges.map(({ source, target }) => {
        const x1 = source.columnIndex * COLUMN_STRIDE + NODE_SIZE;
        const y1 = source.rowIndex * ROW_STRIDE + NODE_SIZE / 2;
        const x2 = target.columnIndex * COLUMN_STRIDE;
        const y2 = target.rowIndex * ROW_STRIDE + NODE_SIZE / 2;
        const midX = (x1 + x2) / 2;
        const active = (ranks[source.id] ?? 0) >= source.maxRank;
        return (
          <path
            key={`${source.id}-${target.id}`}
            d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            markerEnd={`url(#legacy-arrow-${tree.id})`}
            className={active ? "stroke-amber-300/90" : "stroke-stone-600/70"}
          />
        );
      })}
    </svg>
  );
}

function LegacyTree({
  tree,
  ranks,
  pointsPerColumn,
  pointsRemaining,
  onRankChange,
}: {
  tree: LegacyTalentTreeData;
  ranks: LegacyTalentRanks;
  pointsPerColumn: number;
  pointsRemaining: number;
  onRankChange: (talent: LegacyTalentEntry, rank: number) => void;
}) {
  const iconBaseUrl = useIconBaseUrl();
  const columns = Math.max(...tree.talents.map((talent) => talent.columnIndex), 0) + 1;
  const rows = Math.max(...tree.talents.map((talent) => talent.rowIndex), 0) + 1;
  const width = columns * COLUMN_STRIDE;
  const height = rows * ROW_STRIDE;
  const spent = legacyTreePoints(tree, ranks);

  return (
    <section className="overflow-hidden rounded-xl border border-amber-300/20 bg-stone-950/80 shadow-2xl shadow-black/35">
      <header className="flex items-center justify-between border-b border-amber-300/15 bg-gradient-to-r from-amber-950/45 via-stone-950 to-stone-950 px-4 py-3">
        <div>
          <h2 className="font-serif text-xl font-bold tracking-wide text-amber-100">{tree.name}</h2>
          <p className="text-xs uppercase tracking-[0.2em] text-amber-200/55">{spent} points invested</p>
        </div>
        <div className="flex gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">
          {[0, 1, 2].map((column) => (
            <span key={column} className={cn("rounded border px-2 py-1", spent >= column * pointsPerColumn ? "border-amber-400/40 text-amber-200" : "border-stone-700")}>Tier {column + 1}</span>
          ))}
        </div>
      </header>
      <div className="styled-scrollbar overflow-x-auto p-4">
        <div className="relative mx-auto" style={{ width: width + GRID_PADDING * 2, height: height + GRID_PADDING * 2 }}>
          <div className="absolute" style={{ left: GRID_PADDING, top: GRID_PADDING, width, height }}>
            <LegacyEdges tree={tree} ranks={ranks} />
            {tree.talents.map((talent) => {
              const rank = ranks[talent.id] ?? 0;
              const lockReason = rank === 0
                ? legacyTalentLockReason(talent, tree, ranks, pointsPerColumn, pointsRemaining)
                : null;
              const locked = Boolean(lockReason);
              return (
                <button
                  key={talent.id}
                  type="button"
                  title={`${talent.name} (${rank}/${talent.maxRank})${lockReason ? `\n${lockReason}` : ""}`}
                  className={cn(
                    "group absolute z-10 rounded-lg border-2 bg-stone-950 p-0.5 shadow-lg transition",
                    rank >= talent.maxRank ? "border-amber-300 shadow-amber-500/20" : rank > 0 ? "border-emerald-400" : locked ? "border-stone-700 grayscale" : "border-sky-400/75 hover:border-sky-300",
                  )}
                  style={{ left: talent.columnIndex * COLUMN_STRIDE, top: talent.rowIndex * ROW_STRIDE, width: NODE_SIZE, height: NODE_SIZE }}
                  onClick={() => onRankChange(talent, rank + 1)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onRankChange(talent, event.ctrlKey ? 0 : rank - 1);
                  }}
                >
                  <img src={iconUrl(talent.iconTexture, iconBaseUrl)} alt="" className="h-full w-full rounded object-cover" />
                  <span className="absolute -bottom-2 -right-2 rounded border border-stone-500 bg-black px-1 text-[10px] font-bold text-white">{rank}/{talent.maxRank}</span>
                  <span className="pointer-events-none absolute left-1/2 top-full mt-3 hidden w-40 -translate-x-1/2 rounded border border-amber-300/25 bg-stone-950 p-2 text-left text-xs text-stone-200 shadow-xl group-hover:block">
                    <strong className="block text-amber-100">{talent.name}</strong>
                    <span className="mt-1 block text-stone-400">Rank {rank}/{talent.maxRank}</span>
                    {lockReason && <span className="mt-1 block text-red-300">{lockReason}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export function LegacyTalentCalculatorPage() {
  const datasetId = useDatasetId();
  const { data, isLoading, isError } = useTalentTrees(datasetId);
  const [searchParams, setSearchParams] = useSearchParams();
  const trees = useMemo(
    () => [...(data?.legacyTrees ?? [])].sort((a, b) => a.orderIndex - b.orderIndex),
    [data?.legacyTrees],
  );
  const maxPoints = data?.legacyMaxPoints ?? 16;
  const pointsPerColumn = data?.legacyPointsPerColumn ?? 5;
  const ranks = useMemo(
    () => normalizeLegacyBuild(searchParams.get(BUILD_PARAM), trees, maxPoints, pointsPerColumn),
    [searchParams, trees, maxPoints, pointsPerColumn],
  );
  const spent = legacyTotalPoints(ranks);
  const remaining = maxPoints - spent;

  const setRanks = useCallback((nextRanks: LegacyTalentRanks) => {
    const next = new URLSearchParams(searchParams);
    const build = encodeLegacyBuild(trees, nextRanks);
    if (nextRanks && legacyTotalPoints(nextRanks) > 0) next.set(BUILD_PARAM, build);
    else next.delete(BUILD_PARAM);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, trees]);

  if (isLoading) return <div className="container mx-auto max-w-7xl px-4 py-8 text-stone-400">Loading Legacy talents…</div>;
  if (isError) return <div className="container mx-auto max-w-7xl px-4 py-8 text-red-300">Unable to load Legacy talents.</div>;
  if (trees.length === 0) return <div className="container mx-auto max-w-7xl px-4 py-8 text-stone-400">This dataset does not include Forever Legacy talents.</div>;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-5">
      <div className="mb-5 overflow-hidden rounded-xl border border-amber-300/25 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_38%),linear-gradient(135deg,#17120b,#090909)] p-5 shadow-2xl shadow-black/35">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-amber-300"><Sparkles className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-[0.25em]">World of Warcraft Forever</span></div>
            <h1 className="font-serif text-3xl font-bold text-amber-50">Legacy Calculator</h1>
            <p className="mt-1 max-w-2xl text-sm text-stone-400">Spend account-wide Legacy Points across professions, adventure, and resourcefulness. Progression unlocks from left to right.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-amber-300/25 bg-black/40 px-4 py-2 text-center">
              <div className="text-2xl font-black text-amber-200">{remaining}</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">points left</div>
            </div>
            <button type="button" onClick={() => setRanks({})} disabled={spent === 0} className="rounded-lg border border-stone-700 bg-stone-950/70 p-3 text-stone-400 transition hover:border-amber-400/50 hover:text-amber-100 disabled:opacity-40" title="Reset Legacy build"><RotateCcw className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <Link to="/talents" className="rounded border border-stone-700 px-3 py-1.5 text-stone-400 hover:text-white">Class talents</Link>
          <span className="rounded border border-amber-400/50 bg-amber-400/10 px-3 py-1.5 font-semibold text-amber-100">Legacy</span>
          <span className="ml-auto hidden items-center gap-1 text-xs text-stone-500 sm:flex">Left click to add <ArrowRight className="h-3 w-3" /> Right click to remove</span>
        </div>
      </div>

      <div className="grid gap-5">
        {trees.map((tree) => (
          <LegacyTree
            key={tree.id}
            tree={tree}
            ranks={ranks}
            pointsPerColumn={pointsPerColumn}
            pointsRemaining={remaining}
            onRankChange={(talent, rank) => setRanks(updateLegacyTalentRank(talent, rank, trees, ranks, maxPoints, pointsPerColumn))}
          />
        ))}
      </div>
    </div>
  );
}
