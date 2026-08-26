import { useMemo } from "react";
import { Link } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSiteConfig } from "@/api/queries";
import { useMyStatWeights } from "@/api/gearBuilderQueries";
import type { GearProgression } from "@/api/typesGenerated";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { gearClassById } from "../classInfo";
import { presetsForFlavor } from "../weights/presets";
import { parseProgressionPayload } from "./progressionModel";

function formatUpdated(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ProgressionCard({
  progression,
  actions,
}: {
  progression: GearProgression;
  actions?: React.ReactNode;
}) {
  const cls = gearClassById(progression.class_id);
  const classColor = cls ? getClassColorVar(cls.enumName) : undefined;
  const payload = parseProgressionPayload(progression.payload);
  const poolSize = payload.pool.length;
  const stages = payload.stages.length;

  // New payloads carry a portable profile snapshot. ID lookup remains as a
  // fallback for older progressions saved before snapshots were introduced.
  const profileId = payload.analysis_profile_id;
  const { isAuthenticated } = useAuth();
  const { data: siteConfig } = useSiteConfig();
  const myProfiles = useMyStatWeights(
    isAuthenticated && !payload.analysis_profile && !!profileId,
  );
  const profileName = useMemo(() => {
    if (payload.analysis_profile) return payload.analysis_profile.name;
    if (!profileId) return null;
    const mine = myProfiles.data?.find((p) => p.id === profileId);
    if (mine) return mine.name;
    return (
      presetsForFlavor(siteConfig?.dataset_flavor ?? []).find(
        (p) => p.id === profileId,
      )?.name ?? null
    );
  }, [payload.analysis_profile, profileId, myProfiles.data, siteConfig?.dataset_flavor]);

  return (
    <div className="flex items-center gap-4 rounded-md border border-zinc-700/60 bg-zinc-900/40 px-4 py-3 transition-colors hover:border-zinc-600">
      <span
        className="w-1 shrink-0 self-stretch rounded-full"
        style={{ backgroundColor: classColor ?? "var(--border)" }}
      />
      <div className="min-w-0 flex-1 sm:flex-[2]">
        <Link
          to={`/gear/progression/${progression.id}`}
          className="block truncate font-medium text-zinc-100 hover:underline"
        >
          {progression.title}
        </Link>
        {cls && (
          <div className="mt-0.5 truncate text-xs" style={{ color: classColor }}>
            {progression.spec_name ? `${progression.spec_name} ${cls.name}` : cls.name}
          </div>
        )}
      </div>
      <div className="hidden w-24 shrink-0 text-sm text-zinc-300 sm:block">
        {stages} {stages === 1 ? "stage" : "stages"}
      </div>
      <div className="hidden w-28 shrink-0 text-sm text-zinc-300 sm:block">
        {poolSize} {poolSize === 1 ? "pool item" : "pool items"}
      </div>
      <div className="hidden min-w-0 flex-1 items-center md:flex">
        {profileName && (
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-sky-400/40 px-2.5 py-0.5 text-xs text-sky-300">
            <BarChart3 className="h-3 w-3 shrink-0" />
            <span className="truncate">{profileName}</span>
          </span>
        )}
      </div>
      <div className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-zinc-500 sm:block">
        {formatUpdated(progression.updated_at)}
      </div>
      {actions}
    </div>
  );
}
