import { useNavigate } from "react-router-dom";
import { GitFork, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useForkGearList } from "@/api/gearBuilderQueries";
import type { GearList } from "@/api/typesGenerated";

/** Share and fork actions for a gear list. */
export function ListActions({ list }: { list: GearList }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const fork = useForkGearList();

  const copyShareLink = () => {
    const url = new URL(window.location.href);
    navigator.clipboard.writeText(url.toString()).then(
      () => toast.success("Link copied"),
      () => toast.error("Could not copy the link"),
    );
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
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
          fork.mutate(list.id, {
            onSuccess: (forked) => {
              toast.success("Forked to your lists");
              navigate(`/gear/lists/${forked.id}`);
            },
            onError: (err) => toast.error(err.message),
          });
        }}
      >
        <GitFork className="h-3.5 w-3.5 mr-1" />
        Fork
      </Button>
    </div>
  );
}
