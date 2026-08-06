import { Trophy } from "lucide-react";
import { LeaderboardContent } from "../LeaderboardPanel";
import { FIXTURE_SPEEDRUN, getFixtureRenderProps } from "./fixture";

export function ExampleLeaderboardPanel() {
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card">
      <div className="flex h-10 flex-shrink-0 items-center gap-2 border-b border-border px-3">
        <Trophy className="h-4 w-4" />
        <span className="text-sm font-medium">Leaderboard</span>
        <span className="font-mono text-[10px] text-muted-foreground">EXAMPLE RAID</span>
      </div>
      <div className="styled-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
        <LeaderboardContent
          {...getFixtureRenderProps()}
          speedrunOverride={FIXTURE_SPEEDRUN}
        />
      </div>
      <div className="flex flex-shrink-0 items-center border-t border-border px-4 py-1.5">
        <span className="font-mono text-[10.5px] text-muted-foreground">
          Speedrun qualification proof
        </span>
        <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">
          example data
        </span>
      </div>
    </div>
  );
}
