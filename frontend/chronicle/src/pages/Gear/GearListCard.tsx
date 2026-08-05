import { Link } from "react-router-dom";
import { Eye, EyeOff, Layers, Link2 } from "lucide-react";
import type { GearList } from "@/api/typesGenerated";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { gearClassById } from "./classInfo";

function stageCount(payload: unknown): number {
  try {
    const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
    const stages = (parsed as { stages?: unknown[] })?.stages;
    return Array.isArray(stages) ? stages.length : 0;
  } catch {
    return 0;
  }
}

const VISIBILITY_ICON = {
  public: Eye,
  unlisted: Link2,
  private: EyeOff,
} as const;

export function GearListCard({ list, actions }: { list: GearList; actions?: React.ReactNode }) {
  const cls = gearClassById(list.class_id);
  const stages = stageCount(list.payload);
  const VisIcon = VISIBILITY_ICON[list.visibility as keyof typeof VISIBILITY_ICON] ?? EyeOff;

  return (
    <div className="flex items-center gap-3 rounded-md border border-zinc-700/60 bg-zinc-900/40 px-4 py-3 hover:border-zinc-600 transition-colors">
      <div className="min-w-0 flex-1">
        <Link
          to={`/gear/lists/${list.id}`}
          className="font-medium text-zinc-100 hover:underline truncate block"
        >
          {list.title}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-zinc-500">
          {cls && (
            <span style={{ color: getClassColorVar(cls.enumName) }}>
              {list.spec_name ? `${list.spec_name} ${cls.name}` : cls.name}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3 w-3" />
            {stages} {stages === 1 ? "stage" : "stages"}
          </span>
          <span className="inline-flex items-center gap-1 capitalize">
            <VisIcon className="h-3 w-3" />
            {list.visibility}
          </span>
          <span>updated {new Date(list.updated_at).toLocaleDateString()}</span>
        </div>
        {list.description && (
          <p className="text-xs text-zinc-400 mt-1 line-clamp-1">{list.description}</p>
        )}
      </div>
      {actions}
    </div>
  );
}
