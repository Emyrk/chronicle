import { LockKeyhole } from "lucide-react";

export function UnlistedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300">
      <LockKeyhole className="h-3 w-3" />
      Unlisted
    </span>
  );
}
