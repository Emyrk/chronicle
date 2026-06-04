import { useMemo } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { iconUrl } from "@/config/iconUrl";
import { serverCapabilities } from "@/config/serverCapabilities";
import { TalentTreeViewer } from "@/components/ui/TalentTreeViewer/TalentTreeViewer";
import { useTalentTrees } from "@/components/ui/TalentTreeViewer/useTalentTrees";

const CLASS_INFO: { id: number; name: string; slug: string; iconTexture: string }[] = [
  { id: 1, name: "Warrior", slug: "warrior", iconTexture: "classicon_warrior" },
  { id: 2, name: "Paladin", slug: "paladin", iconTexture: "classicon_paladin" },
  { id: 3, name: "Hunter", slug: "hunter", iconTexture: "classicon_hunter" },
  { id: 4, name: "Rogue", slug: "rogue", iconTexture: "classicon_rogue" },
  { id: 5, name: "Priest", slug: "priest", iconTexture: "classicon_priest" },
  { id: 7, name: "Shaman", slug: "shaman", iconTexture: "classicon_shaman" },
  { id: 8, name: "Mage", slug: "mage", iconTexture: "classicon_mage" },
  { id: 9, name: "Warlock", slug: "warlock", iconTexture: "classicon_warlock" },
  { id: 11, name: "Druid", slug: "druid", iconTexture: "classicon_druid" },
];

export function TalentCalculatorPage() {
  const { classSlug } = useParams<{ classSlug?: string }>();
  const { data: talentData, isLoading, isError } = useTalentTrees();

  const tc = serverCapabilities.talentCalculator;
  const maxTalentPoints = tc?.maxTalentPoints ?? 51;
  const maxLevel = tc?.maxLevel ?? 60;

  const availableClasses = useMemo(() => {
    if (!tc?.classIds?.length) return CLASS_INFO;
    return CLASS_INFO.filter((c) => tc.classIds.includes(c.id));
  }, [tc]);

  // Default to the first available class when no slug is provided.
  if (!classSlug) {
    const first = availableClasses[0];
    return <Navigate to={`/talents/${first.slug}`} replace />;
  }

  const selectedClass = availableClasses.find((c) => c.slug === classSlug);
  const selectedClassId = selectedClass?.id;

  const classTreeData = useMemo(() => {
    if (!talentData || !selectedClassId) return undefined;
    return talentData.classes?.find((c) => c.classId === selectedClassId);
  }, [talentData, selectedClassId]);

  return (
    <div className="container mx-auto px-4 py-4 max-w-7xl">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Talent Calculator</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Plan and share class talent builds.
        </p>
      </div>

      {/* Class selector */}
      <div className="mb-6 flex flex-wrap gap-2">
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
              src={iconUrl(cls.iconTexture)}
              alt=""
              className="h-6 w-6 rounded"
            />
            <span>{cls.name}</span>
          </Link>
        ))}
      </div>

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
        />
      ) : (
        <div className="text-zinc-500">Select a class above to get started.</div>
      )}
    </div>
  );
}
