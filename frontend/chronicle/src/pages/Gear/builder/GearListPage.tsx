import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Link2 } from "lucide-react";
import { useSession } from "@/api/queries";
import { useSharedGearList } from "@/api/gearBuilderQueries";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { cn } from "@/lib/utils";
import { gearClassById } from "../classInfo";
import { parsePayload, type GearPayload } from "./gearListModel";
import { useListItems, type ItemRef } from "./useListItems";
import { BuilderDoll } from "./BuilderDoll";

const VISIBILITY_ICON = { public: Eye, unlisted: Link2, private: EyeOff } as const;

/** Every (item, enchant) pair the document references, for hydration. */
function collectItemRefs(payload: GearPayload): ItemRef[] {
  const refs: ItemRef[] = [];
  for (const stage of payload.stages) {
    for (const entry of Object.values(stage.slots)) {
      if (!entry) continue;
      refs.push({ itemId: entry.item_id, enchantId: entry.enchant_id });
      for (const alt of entry.alternates ?? []) refs.push({ itemId: alt.item_id });
    }
  }
  return refs;
}

/**
 * Gear list builder/viewer. Owners edit; everyone else gets a read-only view.
 */
export function GearListPage() {
  const { listID } = useParams<{ listID: string }>();
  const { data: session } = useSession();
  const list = useSharedGearList(listID);

  const payload = useMemo(() => parsePayload(list.data?.payload), [list.data?.payload]);
  const [stageIndex, setStageIndex] = useState(0);
  const items = useListItems(useMemo(() => collectItemRefs(payload), [payload]));

  if (list.isLoading) {
    return <div className="p-8 text-center text-zinc-400">Loading gear list…</div>;
  }
  if (list.isError || !list.data) {
    return (
      <div className="p-8 text-center text-zinc-400">
        <p className="text-red-400 mb-2">Gear list not found or is private.</p>
        <Link to="/gear" className="text-sm text-blue-400 hover:underline">
          Back to gear lists
        </Link>
      </div>
    );
  }

  const cls = gearClassById(list.data.class_id);
  const isOwner = !!session && session.user_id === list.data.user_id;
  const stage = payload.stages[Math.min(stageIndex, Math.max(payload.stages.length - 1, 0))];
  const VisIcon = VISIBILITY_ICON[list.data.visibility as keyof typeof VISIBILITY_ICON] ?? EyeOff;

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-4">
      <div className="flex items-start gap-3">
        <Link to="/gear" className="text-zinc-500 hover:text-zinc-300 mt-1.5">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-white truncate">{list.data.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
            {cls && (
              <span style={{ color: getClassColorVar(cls.enumName) }}>
                {list.data.spec_name ? `${list.data.spec_name} ${cls.name}` : cls.name}
              </span>
            )}
            <span className="inline-flex items-center gap-1 capitalize">
              <VisIcon className="h-3 w-3" />
              {list.data.visibility}
            </span>
            {isOwner && <span>you own this list</span>}
          </div>
        </div>
      </div>

      {list.data.description && <p className="text-sm text-zinc-400">{list.data.description}</p>}

      {payload.stages.length === 0 ? (
        <p className="text-sm text-zinc-500">This list has no stages yet.</p>
      ) : (
        <div className="space-y-4">
          {payload.stages.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {payload.stages.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setStageIndex(i)}
                  className={cn(
                    "px-3 py-1.5 rounded text-sm border transition-colors",
                    i === stageIndex
                      ? "border-blue-500 bg-blue-500/10 text-white"
                      : "border-zinc-700 text-zinc-400 hover:text-zinc-200",
                  )}
                >
                  {s.name || `Stage ${i + 1}`}
                </button>
              ))}
            </div>
          )}
          {stage && (
            <div className="rounded-md border border-zinc-700/60 bg-zinc-900/40 p-4 max-w-xl">
              <BuilderDoll stage={stage} items={items} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
