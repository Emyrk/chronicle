import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useSession } from "@/api/queries";
import { useSharedGearList } from "@/api/gearBuilderQueries";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { gearClassById } from "../classInfo";

/**
 * Gear list builder/viewer. Owners edit; everyone else gets a read-only view.
 */
export function GearListPage() {
  const { listID } = useParams<{ listID: string }>();
  const { data: session } = useSession();
  const list = useSharedGearList(listID);

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

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/gear" className="text-zinc-500 hover:text-zinc-300">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-white">{list.data.title}</h1>
          <div className="text-xs text-zinc-500">
            {cls && (
              <span style={{ color: getClassColorVar(cls.enumName) }}>
                {list.data.spec_name ? `${list.data.spec_name} ${cls.name}` : cls.name}
              </span>
            )}
            {isOwner && <span className="ml-2">· you own this list</span>}
          </div>
        </div>
      </div>
      {list.data.description && (
        <p className="text-sm text-zinc-400">{list.data.description}</p>
      )}
      <p className="text-sm text-zinc-500">The gear builder is under construction.</p>
    </div>
  );
}
