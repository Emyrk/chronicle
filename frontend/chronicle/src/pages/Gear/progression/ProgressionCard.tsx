import { Link } from "react-router-dom";
import { Layers, Package } from "lucide-react";
import type { GearProgression } from "@/api/typesGenerated";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { gearClassById } from "../classInfo";
import { parseProgressionPayload } from "./progressionModel";

export function ProgressionCard({
  progression,
  actions,
}: {
  progression: GearProgression;
  actions?: React.ReactNode;
}) {
  const cls = gearClassById(progression.class_id);
  const payload = parseProgressionPayload(progression.payload);
  const poolSize = payload.pool.length;
  const stages = payload.stages.length;

  return (
    <div className="flex items-center gap-3 rounded-md border border-zinc-700/60 bg-zinc-900/40 px-4 py-3 transition-colors hover:border-zinc-600">
      <div className="min-w-0 flex-1">
        <Link
          to={`/gear/progression/${progression.id}`}
          className="block truncate font-medium text-zinc-100 hover:underline"
        >
          {progression.title}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
          {cls && (
            <span style={{ color: getClassColorVar(cls.enumName) }}>
              {progression.spec_name ? `${progression.spec_name} ${cls.name}` : cls.name}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Package className="h-3 w-3" />
            {poolSize} {poolSize === 1 ? "pool item" : "pool items"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3 w-3" />
            {stages} max-level {stages === 1 ? "stage" : "stages"}
          </span>
          <span>updated {new Date(progression.updated_at).toLocaleDateString()}</span>
        </div>
        {progression.description && (
          <p className="mt-1 line-clamp-1 text-xs text-zinc-400">{progression.description}</p>
        )}
      </div>
      {actions}
    </div>
  );
}
