import { ArrowRight, Crown } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/** Prompts accounts without a supporter tier that one raises their storage limit. */
export function SupporterStorageCallout({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-[#c9a227]/50 bg-[#f0c060]/10 p-4",
        !compact && "sm:flex-row sm:items-center",
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f0c060]/20 text-[#f0c060]">
        <Crown className="size-5" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold">Get up to +2 GB of storage with supporter perks</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Honored, Revered, and Exalted supporters get +300 MB, +1 GB, or +2 GB of extra storage, plus ad-free browsing and more.
        </p>
      </div>
      <Link
        to="/supporter#storage"
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[#c9a227]/60 px-3 py-1.5 font-wow text-sm font-bold text-[#f0c060] transition-colors hover:bg-[#f0c060]/20",
          compact && "self-start",
        )}
      >
        See supporter perks
        <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
