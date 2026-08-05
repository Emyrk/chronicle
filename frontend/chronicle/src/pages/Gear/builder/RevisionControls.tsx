import { useNavigate } from "react-router-dom";
import { GitFork, Link2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  useForkGearList,
  useGearListRevisions,
  usePublishGearList,
} from "@/api/gearBuilderQueries";
import type { GearList } from "@/api/typesGenerated";
import { cn } from "@/lib/utils";

interface RevisionControlsProps {
  list: GearList;
  isOwner: boolean;
  /** Currently viewed revision; null = live draft. */
  viewedRev: number | null;
  onViewRev: (rev: number | null) => void;
  /** True when the editor has unsaved changes (publish snapshots saved state). */
  dirty?: boolean;
}

/**
 * Revision picker, publish, share, and fork actions. Published revisions
 * are immutable; the share link pins ?rev=N so it always resolves to the
 * same content.
 */
export function RevisionControls({ list, isOwner, viewedRev, onViewRev, dirty }: RevisionControlsProps) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const revisions = useGearListRevisions(list.id);
  const publish = usePublishGearList();
  const fork = useForkGearList();
  const latest = revisions.data?.[0]?.rev_number ?? 0;

  const copyShareLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("rev");
    if (viewedRev != null) url.searchParams.set("rev", String(viewedRev));
    navigator.clipboard.writeText(url.toString()).then(
      () =>
        toast.success(
          viewedRev != null
            ? `Link to revision ${viewedRev} copied — it will always show this exact content`
            : "Link copied — it follows the live list",
        ),
      () => toast.error("Could not copy the link"),
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 text-xs">
        <button
          type="button"
          onClick={() => onViewRev(null)}
          className={cn(
            "px-2 py-1 rounded border transition-colors",
            viewedRev == null
              ? "border-amber-500/70 bg-amber-500/10 text-amber-200"
              : "border-zinc-700 text-zinc-400 hover:text-zinc-200",
          )}
        >
          {isOwner ? "Draft" : "Live"}
        </button>
        {(revisions.data ?? []).map((rev) => (
          <button
            key={rev.rev_number}
            type="button"
            onClick={() => onViewRev(rev.rev_number)}
            title={`Published ${new Date(rev.published_at).toLocaleString()}`}
            className={cn(
              "px-2 py-1 rounded border font-mono transition-colors",
              viewedRev === rev.rev_number
                ? "border-blue-500 bg-blue-500/10 text-white"
                : "border-zinc-700 text-zinc-400 hover:text-zinc-200",
            )}
          >
            rev {rev.rev_number}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={copyShareLink}>
        <Link2 className="h-3.5 w-3.5 mr-1" />
        Copy link
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        disabled={fork.isPending}
        onClick={() => {
          if (!isAuthenticated) {
            toast.error("You must be logged in to fork gear lists");
            return;
          }
          fork.mutate(
            { listID: list.id, revNumber: viewedRev ?? undefined },
            {
              onSuccess: (forked) => {
                toast.success("Forked to your lists");
                navigate(`/gear/lists/${forked.id}`);
              },
              onError: (err) => toast.error(err.message),
            },
          );
        }}
      >
        <GitFork className="h-3.5 w-3.5 mr-1" />
        Fork
      </Button>
      {isOwner && (
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={publish.isPending}
          title={dirty ? "Save first — publishing snapshots the saved list" : undefined}
          onClick={() => {
            if (dirty) {
              toast.error("Save your changes first — publishing snapshots the saved list");
              return;
            }
            publish.mutate(list.id, {
              onSuccess: (rev) => {
                toast.success(`Revision ${rev.rev_number} published — the numbered link is now permanent`);
                onViewRev(null);
              },
              onError: (err) => toast.error(err.message),
            });
          }}
        >
          <UploadCloud className="h-3.5 w-3.5 mr-1" />
          {latest > 0 ? `Publish revision ${latest + 1}` : "Publish revision"}
        </Button>
      )}
    </div>
  );
}
