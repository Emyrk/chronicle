import { Trophy } from "lucide-react";
import { LeaderboardDetails } from "../LeaderboardPanel";
import type { SpeedrunResult } from "@/api/typesGenerated";
import { QUALIFIED_FIXTURE_SPEEDRUN } from "./fixture";

export function LeaderboardVideoDemo({
  speedrun = QUALIFIED_FIXTURE_SPEEDRUN,
}: {
  speedrun?: SpeedrunResult;
}) {
  return (
    <div className="w-[1136px] overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
      <div className="flex h-10 items-center gap-2 border-b border-border px-3">
        <Trophy className="h-4 w-4" />
        <span className="text-sm font-medium">Leaderboard</span>
        <span className="font-mono text-[10px] text-muted-foreground">EXAMPLE RAID</span>
      </div>
      <LeaderboardDetails speedrun={speedrun} />
    </div>
  );
}
