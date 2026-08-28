import { useMemo } from "react";
import { Link, useParams, Navigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, EyeOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useSiteConfig } from "@/api/queries";
import { useRankingsEncounters, useRankingsInstances, useRankingsLeaderboard } from "@/api/rankingsQueries";
import { TalentTreeViewer } from "@/components/ui/TalentTreeViewer/TalentTreeViewer";
import {
  TALENT_BUILD_PARAM,
  TALENT_COMPARE_PARAM,
  type TalentPopularity,
  type TalentPopularitySelection,
  aggregateTalentPopularity,
  computeBuildDiff,
  decodeTalentBuild,
  normalizeTalentRanks,
  rankingsLayoutToBuild,
  searchParamsWithTalentPopularity,
  talentPopularitySelection,
  talentPopularitySlug,
} from "@/components/ui/TalentTreeViewer/talentLogic";
import { useTalentTrees } from "@/components/ui/TalentTreeViewer/useTalentTrees";
import { DatasetProvider } from "@/hooks/useDatasetId";
import { SPEC_BY_CLASS } from "@/pages/Rankings/classDisplay";
import { MyBuildsDrawer } from "./MyBuildsDrawer";
import { TopBuildsDrawer } from "./TopBuildsDrawer";

const CLASS_INFO: { id: number; name: string; slug: string }[] = [
  { id: 1, name: "Warrior", slug: "warrior" },
  { id: 2, name: "Paladin", slug: "paladin" },
  { id: 3, name: "Hunter", slug: "hunter" },
  { id: 4, name: "Rogue", slug: "rogue" },
  { id: 5, name: "Priest", slug: "priest" },
  { id: 6, name: "Death Knight", slug: "deathknight" },
  { id: 7, name: "Shaman", slug: "shaman" },
  { id: 8, name: "Mage", slug: "mage" },
  { id: 9, name: "Warlock", slug: "warlock" },
  { id: 11, name: "Druid", slug: "druid" },
];

const PET_INFO = { id: 0, name: "Pet", slug: "pet" };
const PET_TREE_IDS = [1, 2, 4];
const PET_MAX_TALENT_POINTS = 20;

/**
 * Derive talent calculator settings from the dataset flavor tags.
 *   - wrath  → max level 80, 71 points, includes Death Knight
 *   - tbc    → max level 70, 61 points, no Death Knight
 *   - else   → max level 60, 51 points, no Death Knight (vanilla)
 */
function toApiClass(name: string): string {
  return name.replace(/\s+/g, "").toUpperCase();
}

function talentConfigFromFlavor(flavor: readonly string[]): {
  maxLevel: number;
  maxTalentPoints: number;
  classIds: number[];
} {
  if (flavor.includes("wrath")) {
    return { maxLevel: 80, maxTalentPoints: 71, classIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 11] };
  }
  if (flavor.includes("tbc")) {
    return { maxLevel: 70, maxTalentPoints: 61, classIds: [1, 2, 3, 4, 5, 7, 8, 9, 11] };
  }
  return { maxLevel: 60, maxTalentPoints: 51, classIds: [1, 2, 3, 4, 5, 7, 8, 9, 11] };
}

export function TalentCalculatorPage() {
  const { classSlug } = useParams<{ classSlug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: talentData, isLoading, isError } = useTalentTrees();
  const { data: siteConfig } = useSiteConfig();

  const tc = useMemo(
    () => talentConfigFromFlavor(siteConfig?.dataset_flavor ?? []),
    [siteConfig?.dataset_flavor],
  );
  const maxLevel = tc.maxLevel;

  const availableClasses = useMemo(() => {
    return CLASS_INFO.filter((c) => tc.classIds.includes(c.id));
  }, [tc]);
  const petTreeData = useMemo(() => {
    const tabs = PET_TREE_IDS.flatMap((id) => talentData?.pets?.[String(id)]?.tabs ?? []);
    return tabs.length > 0 ? { id: PET_INFO.id, name: "Hunter Pet", tabs } : undefined;
  }, [talentData?.pets]);

  const selectedClass = availableClasses.find((c) => c.slug === classSlug);
  const selectedPet = classSlug === PET_INFO.slug;
  const selectedOption = selectedClass ?? (selectedPet ? PET_INFO : undefined);
  const selectedClassId = selectedClass?.id;
  const pointsPerRow = selectedPet ? 3 : 5;
  const maxTalentPoints = selectedPet ? PET_MAX_TALENT_POINTS : tc.maxTalentPoints;

  // Top Builds relies on per-spec rankings. Hide it when this tenant's parse
  // scoring is disabled or aggregates by class instead of spec.
  const cohortMode = siteConfig?.tenant?.parse_config?.cohort_mode ?? "spec";
  const topBuildsAvailable = !selectedPet && cohortMode === "spec";

  const classTreeData = selectedPet
    ? petTreeData
    : selectedClassId
      ? talentData?.classes?.[String(selectedClassId)]
      : undefined;

  const isMobile = useIsMobile();

  // Top Builds "Show all" overlay: store the ranking cohort in a compact URL
  // value, then reload its current top-10 builds when the page is opened.
  const popularitySource = useMemo(
    () => selectedPet ? null : talentPopularitySelection(searchParams),
    [searchParams, selectedPet],
  );
  const apiClass = selectedClass ? toApiClass(selectedClass.name) : "";
  const popularitySpec = (SPEC_BY_CLASS[apiClass] ?? []).find(
    (spec) => talentPopularitySlug(spec) === popularitySource?.spec,
  ) ?? "";

  const popularityInstancesQuery = useRankingsInstances(Boolean(popularitySource));
  const popularityInstance = useMemo(() => {
    if (!popularitySource) return "";
    return (popularityInstancesQuery.data ?? []).find(
      (instance) => talentPopularitySlug(instance.instance_name) === popularitySource.instance,
    )?.instance_name ?? "";
  }, [popularityInstancesQuery.data, popularitySource]);

  const popularityEncountersQuery = useRankingsEncounters(popularityInstance);
  const popularityBossNames = useMemo(
    () => (popularityEncountersQuery.data ?? [])
      .map((encounter) => encounter.encounter_name)
      .filter((name) => name !== "Trash"),
    [popularityEncountersQuery.data],
  );
  const popularityLeaderboardQuery = useRankingsLeaderboard(
    {
      instance_names: popularityInstance,
      encounter_names: popularityBossNames.join(","),
      class: apiClass,
      spec: popularitySpec,
      hide_unknowns: true,
      metric: popularitySource?.metric,
      limit: 10,
    },
    Boolean(
      popularitySource
      && popularityInstance
      && apiClass
      && popularitySpec
      && popularityBossNames.length > 0
    ),
  );

  const popularity = useMemo<Record<number, TalentPopularity> | null>(() => {
    if (!classTreeData || !popularitySource) return null;
    const builds = (popularityLeaderboardQuery.data?.entries ?? [])
      .map((entry) => rankingsLayoutToBuild(entry.talent_layout))
      .filter(Boolean);
    if (builds.length === 0) return null;
    const tabs = classTreeData.tabs.map((tab) => tab.talents);
    return aggregateTalentPopularity(builds.map((build) => decodeTalentBuild(build, tabs)));
  }, [classTreeData, popularityLeaderboardQuery.data, popularitySource]);

  function showPopularity(selection: TalentPopularitySelection) {
    // Mutually exclusive with the compare overlay (same badge real estate).
    const next = searchParamsWithTalentPopularity(searchParams, selection);
    next.delete(TALENT_COMPARE_PARAM);
    setSearchParams(next, { replace: true });
  }

  function hidePopularity() {
    setSearchParams(searchParamsWithTalentPopularity(searchParams, null), { replace: true });
  }

  // Compare overlay: diff the current build against ?compare=<build>.
  // URL-encoded so compare links can be shared (and opened on mobile, which
  // has no compare entry point of its own).
  const compareBuild = popularitySource ? null : searchParams.get(TALENT_COMPARE_PARAM);
  const currentBuild = searchParams.get(TALENT_BUILD_PARAM);
  const diff = useMemo(() => {
    if (!compareBuild || !classTreeData) return null;
    const tabs = classTreeData.tabs.map((tab) => tab.talents);
    return computeBuildDiff(
      normalizeTalentRanks(tabs, decodeTalentBuild(currentBuild, tabs), maxTalentPoints, pointsPerRow),
      normalizeTalentRanks(tabs, decodeTalentBuild(compareBuild, tabs), maxTalentPoints, pointsPerRow),
    );
  }, [compareBuild, currentBuild, classTreeData, maxTalentPoints, pointsPerRow]);

  function stopComparing() {
    const next = new URLSearchParams(searchParams);
    next.delete(TALENT_COMPARE_PARAM);
    setSearchParams(next, { replace: true });
  }

  // Desktop defaults to the first available class when no slug is provided.
  // Mobile shows the class selector on its own instead.
  if (!classSlug && !isMobile) {
    const first = availableClasses[0];
    return <Navigate to={`/talents/${first.slug}`} replace />;
  }

  // Mobile, no talent type selected: the selector is the whole page.
  if (isMobile && !selectedOption) {
    return (
      <div className="container mx-auto px-4 py-4 max-w-7xl">
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight">Talent Calculator</h1>
          <p className="mt-1 text-sm text-zinc-400">Pick a class or pet type to start planning.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {availableClasses.map((cls) => (
            <Link
              key={`class-${cls.id}`}
              to={`/talents/${cls.slug}`}
              className="flex items-center gap-3 rounded-lg border border-zinc-700/60 bg-zinc-900/40 p-3 text-zinc-200 transition hover:border-zinc-500 hover:text-white"
            >
              <img
                src={`/c/icons/class_${cls.slug}.png`}
                alt=""
                className="h-9 w-9 rounded"
                onError={(e) => { (e.target as HTMLImageElement).src = "/c/icons/class_unknown.png"; }}
              />
              <span className="font-semibold">{cls.name}</span>
            </Link>
          ))}
          {petTreeData && (
            <Link
              to={`/talents/${PET_INFO.slug}`}
              className="flex items-center gap-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-amber-100 transition hover:border-amber-300/60 hover:text-white"
            >
              <img src="/c/icons/class_hunter.png" alt="" className="h-9 w-9 rounded" />
              <span className="font-semibold">{PET_INFO.name}</span>
            </Link>
          )}
        </div>
      </div>
    );
  }

  // Mobile: the page header (title/back) is composed into the viewer's
  // summary card to keep the top of the page calm.
  const mobileHeader = (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-bold tracking-tight">
          {selectedOption ? `${selectedOption.name} Talents` : "Talent Calculator"}
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {diff && (
          <button
            type="button"
            aria-label="Stop comparing builds"
            className="inline-flex items-center gap-1 rounded-md border border-emerald-400/50 bg-emerald-500/10 px-2.5 py-1.5 text-sm font-semibold text-emerald-200"
            onClick={stopComparing}
          >
            <X className="h-4 w-4" />
            Comparing
          </button>
        )}
        <Link
          to="/talents"
          className="inline-flex items-center gap-1 rounded-md border border-amber-300/30 bg-zinc-950/60 px-2.5 py-1.5 text-sm text-amber-100/80 transition hover:border-amber-200/60 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          Talents
        </Link>
      </div>
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-4 max-w-7xl">
      {/* Header — on mobile it lives inside the viewer card instead */}
      {(!isMobile || !classTreeData) && (
        <div className="mb-3">
          <h1 className="text-2xl font-bold tracking-tight">Talent Calculator</h1>
        </div>
      )}

      {/* Class selector — desktop only; mobile uses the dedicated select screen */}
      {isMobile ? (
        !classTreeData && (
          <div className="mb-3">
            <Link
              to="/talents"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/60 bg-zinc-900/40 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to talent select
            </Link>
          </div>
        )
      ) : (
        <div className="mb-3 flex flex-wrap gap-2">
          {availableClasses.map((cls) => (
            <Link
              key={cls.id}
              to={`/talents/${cls.slug}`}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                cls.id === selectedClassId
                  ? "border-primary/70 bg-primary/15 text-white"
                  : "border-zinc-700/60 bg-zinc-900/40 text-zinc-400 hover:border-zinc-500 hover:text-white",
              )}
            >
              <img
                src={`/c/icons/class_${cls.slug}.png`}
                alt=""
                className="h-6 w-6 rounded"
                onError={(e) => { (e.target as HTMLImageElement).src = "/c/icons/class_unknown.png"; }}
              />
              <span>{cls.name}</span>
            </Link>
          ))}
          {petTreeData && (
            <Link
              to={`/talents/${PET_INFO.slug}`}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                selectedPet
                  ? "border-amber-300/70 bg-amber-400/15 text-white"
                  : "border-amber-400/25 bg-amber-400/5 text-amber-100/70 hover:border-amber-300/60 hover:text-white",
              )}
            >
              <img src="/c/icons/class_hunter.png" alt="" className="h-6 w-6 rounded" />
              <span>{PET_INFO.name}</span>
            </Link>
          )}
        </div>
      )}

      {/* Talent viewer */}
      {isLoading ? (
        <div className="text-zinc-500">Loading talent data…</div>
      ) : isError ? (
        <div className="text-zinc-500">Unable to load talent data.</div>
      ) : classTreeData ? (
        // Scope icon/spell lookups to the dataset the talent data resolved to
        // (tenant-aware) instead of the compiled-in server default.
        <DatasetProvider datasetId={talentData?.dataset_id} iconBaseUrl={talentData?.icon_base_url}>
        <TalentTreeViewer
          classId={selectedClassId}
          data={classTreeData}
          maxTalentPoints={maxTalentPoints}
          maxLevel={maxLevel}
          pointsPerRow={pointsPerRow}
          exclusiveTabs={selectedPet}
          showRequiredLevel={!selectedPet}
          mobileHeader={isMobile ? mobileHeader : undefined}
          popularity={popularity}
          diff={diff}
          extraActions={
            !isMobile && !selectedPet ? (
              <>
                {diff && (
                  <button
                    type="button"
                    title="Stop comparing builds"
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/50 bg-emerald-500/10 px-2.5 py-1 text-sm font-semibold text-emerald-200 transition hover:border-emerald-300 hover:bg-emerald-500/20"
                    onClick={stopComparing}
                  >
                    <X className="h-3.5 w-3.5" />
                    Comparing
                  </button>
                )}
                {popularity && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md border border-zinc-600 bg-zinc-900/60 px-2.5 py-1 text-sm font-semibold text-zinc-300 transition hover:border-zinc-400 hover:text-white"
                    onClick={hidePopularity}
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                    Hide popularity
                  </button>
                )}
                {/* Top Builds is desktop-only by design. */}
                {topBuildsAvailable && <TopBuildsDrawer selectedClass={selectedClass} onShowAll={showPopularity} />}
                <MyBuildsDrawer classes={availableClasses} selectedClassId={selectedClassId} />
              </>
            ) : undefined
          }
        />
        </DatasetProvider>
      ) : (
        <div className="text-zinc-500">Select a class or pet type above to get started.</div>
      )}

      {/* Mobile: floating My Builds button (like the instance page encounter FAB) */}
      {isMobile && classTreeData && !selectedPet && (
        <MyBuildsDrawer classes={availableClasses} selectedClassId={selectedClassId} floating />
      )}
    </div>
  );
}
