import { useMemo } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useSiteConfig } from "@/api/queries";
import { TalentTreeViewer } from "@/components/ui/TalentTreeViewer/TalentTreeViewer";
import { useTalentTrees } from "@/components/ui/TalentTreeViewer/useTalentTrees";
import { MyBuildsDrawer } from "./MyBuildsDrawer";

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

/**
 * Derive talent calculator settings from the dataset flavor tags.
 *   - wrath  → max level 80, 71 points, includes Death Knight
 *   - tbc    → max level 70, 61 points, no Death Knight
 *   - else   → max level 60, 51 points, no Death Knight (vanilla)
 */
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
  const { data: talentData, isLoading, isError } = useTalentTrees();
  const { data: siteConfig } = useSiteConfig();

  const tc = useMemo(
    () => talentConfigFromFlavor(siteConfig?.dataset_flavor ?? []),
    [siteConfig?.dataset_flavor],
  );
  const maxTalentPoints = tc.maxTalentPoints;
  const maxLevel = tc.maxLevel;

  const availableClasses = useMemo(() => {
    return CLASS_INFO.filter((c) => tc.classIds.includes(c.id));
  }, [tc]);

  const selectedClass = availableClasses.find((c) => c.slug === classSlug);
  const selectedClassId = selectedClass?.id;

  const classTreeData = useMemo(() => {
    if (!talentData || !selectedClassId) return undefined;
    return talentData.classes?.[String(selectedClassId)];
  }, [talentData, selectedClassId]);

  const isMobile = useIsMobile();

  // Desktop defaults to the first available class when no slug is provided.
  // Mobile shows the class selector on its own instead.
  if (!classSlug && !isMobile) {
    const first = availableClasses[0];
    return <Navigate to={`/talents/${first.slug}`} replace />;
  }

  // Mobile, no class selected: the class selector is the whole page.
  if (isMobile && !selectedClass) {
    return (
      <div className="container mx-auto px-4 py-4 max-w-7xl">
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight">Talent Calculator</h1>
          <p className="mt-1 text-sm text-zinc-400">Pick a class to start planning.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {availableClasses.map((cls) => (
            <Link
              key={cls.id}
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
          {selectedClass ? `${selectedClass.name} Talents` : "Talent Calculator"}
        </h1>
      </div>
      <Link
        to="/talents"
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-300/30 bg-zinc-950/60 px-2.5 py-1.5 text-sm text-amber-100/80 transition hover:border-amber-200/60 hover:text-white"
      >
        <ChevronLeft className="h-4 w-4" />
        Classes
      </Link>
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
              Back to class select
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
        </div>
      )}

      {/* Talent viewer */}
      {isLoading ? (
        <div className="text-zinc-500">Loading talent data…</div>
      ) : isError ? (
        <div className="text-zinc-500">Unable to load talent data.</div>
      ) : classTreeData ? (
        <TalentTreeViewer
          data={classTreeData}
          maxTalentPoints={maxTalentPoints}
          maxLevel={maxLevel}
          mobileHeader={isMobile ? mobileHeader : undefined}
          extraActions={
            !isMobile ? (
              <MyBuildsDrawer classes={availableClasses} selectedClassId={selectedClassId} />
            ) : undefined
          }
        />
      ) : (
        <div className="text-zinc-500">Select a class above to get started.</div>
      )}

      {/* Mobile: floating My Builds button (like the instance page encounter FAB) */}
      {isMobile && classTreeData && (
        <MyBuildsDrawer classes={availableClasses} selectedClassId={selectedClassId} floating />
      )}
    </div>
  );
}
