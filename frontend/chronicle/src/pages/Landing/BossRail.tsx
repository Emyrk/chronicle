import { CircleCheck, CircleX } from "lucide-react";
import type { LandingFeaturedBoss } from "@/api/typesGenerated";

function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Every boss pull of the playing run as a row of chips under the replay; picking one re-scopes the hero to that pull.
 * One fixed height, held while the featured runs load (`bosses` undefined), so the sections below never shift.
 */
export function BossRail({ bosses, selectedId, onPick }: {
  bosses: readonly LandingFeaturedBoss[] | undefined;
  selectedId: string | null;
  onPick: (encounterId: string) => void;
}) {
  if (bosses && bosses.length === 0) return null;
  return (
    <section aria-label="Bosses of this run" className="border-b bg-background">
      <div className="styled-scrollbar mx-auto flex h-16 max-w-[1180px] items-center gap-2 overflow-x-auto px-4 lg:px-8">
        {bosses && <span className="mr-1 whitespace-nowrap text-xs text-muted-foreground">Bosses</span>}
        {bosses?.map((boss) => {
          const selected = boss.id === selectedId;
          return (
            <button
              key={boss.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onPick(boss.id)}
              className={`flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-sm border border-l-[3px] py-2 pl-2.5 pr-3 text-left text-[13px] font-semibold tracking-wide text-foreground hover:brightness-125 lg:min-h-0 ${
                selected ? "border-l-primary bg-primary-darker" : boss.kill ? "border-l-[#22c55e] bg-card" : "border-l-[#f0a8a8] bg-card"
              }`}
            >
              {boss.kill
                ? <CircleCheck className="h-3.5 w-3.5 text-[#22c55e]" aria-label="Kill" />
                : <CircleX className="h-3.5 w-3.5 text-[#f0a8a8]" aria-label="Wipe" />}
              <span>{boss.name}</span>
              <span className="font-mono text-[11px] font-normal text-muted-foreground">{formatDuration(boss.end_offset_ms - boss.start_offset_ms)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
