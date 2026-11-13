import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Trophy } from "lucide-react";
import type { DuplicateInstance } from "@/api/typesGenerated";
import { DuplicateInstanceModal } from "@/components/DuplicateInstanceModal";

interface DuplicatesBadgeProps {
  instanceId: string;
  duplicateGroupId: string;
}

export function DuplicatesBadge({ instanceId, duplicateGroupId }: DuplicatesBadgeProps) {
  const [showModal, setShowModal] = useState(false);

  const { data: duplicates } = useQuery({
    queryKey: ["duplicates", instanceId, duplicateGroupId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/raidlogs/instances/${instanceId}/duplicates`);
      if (!res.ok) throw new Error("Failed to fetch duplicates");
      return res.json() as Promise<DuplicateInstance[]>;
    },
    staleTime: 60_000,
  });

  if (!duplicates || duplicates.length <= 1) return null;

  const ranked = duplicates.find((d) => d.is_ranked);
  const isRanked = ranked?.id === instanceId;
  let title = `${duplicates.length} logs from the same raid`;
  if (ranked) {
    title += isRanked
      ? " — this upload is used for rankings and ratings"
      : " — another upload is used for rankings and ratings";
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted px-2 py-0.5 rounded-full transition-colors"
        title={title}
      >
        <Copy className="h-3 w-3" />
        {duplicates.length}
        {ranked && (
          <span className={`inline-flex items-center gap-0.5 ${isRanked ? "text-emerald-400" : ""}`}>
            · {isRanked && <Trophy className="h-3 w-3" />}
            {isRanked ? "Ranked" : "Not ranked"}
          </span>
        )}
      </button>
      {showModal && (
        <DuplicateInstanceModal
          instances={duplicates.map((d) => ({
            ...d,
            uploader_name: d.uploader_name,
            duration_ms: d.duration_ms ?? null,
          }))}
          currentInstanceId={instanceId}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
