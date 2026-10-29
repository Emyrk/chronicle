import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { RecentInstancesResponse } from "@/api/typesGenerated";
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages";
import { RaidCard } from "@/pages/Recent/RaidCard";
import { groupDuplicateInstances } from "@/utils/groupDuplicates";
import { trackFunnel } from "@/utils/funnel";
import type { ExploreTarget } from "./explore3D";
import { KingOfTheHill } from "./KingOfTheHill";

// Public Sidekick downloads; the utm cookie set on landing carries attribution.
const DOWNLOAD_MAC_URL = "/download?os=macos";
const DOWNLOAD_WINDOWS_URL = "/download?os=windows";

// Replays first, then video runs, then the rest, so the rail always fills.
const RECENT_RUNS_URL = "/api/v1/raidlogs/recent?days=60&limit=3&prefer=replay";

function useRecentRuns() {
  return useQuery({
    queryKey: ["landing", "recent-runs"],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const response = await fetch(RECENT_RUNS_URL);
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      return (await response.json()) as RecentInstancesResponse;
    },
  });
}

function RecentRuns({ onExplore }: { onExplore: (target: ExploreTarget) => void }) {
  const { data } = useRecentRuns();
  // The endpoint lists every upload of a duplicate run, its representative first; one card per run, as on /recent.
  const groups = groupDuplicateInstances([...(data?.instances ?? [])]).slice(0, 3);

  return (
    <section id="runs" className="mx-auto box-border flex w-full max-w-[1180px] flex-col gap-3.5 px-4 pb-3 pt-7 lg:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="m-0 text-xl font-bold lg:text-2xl">Recent runs</h2>
        <Link to="/recent" className="text-sm text-link hover:underline">
          All recent runs
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {groups.map((group) => (
          <RaidCard
            key={group[0].id}
            instance={group[0]}
            instances={group}
            onExplore={(run) => onExplore({ placement: "recent", instanceId: run.id, poster: getInstanceBackground(run.name) })}
          />
        ))}
        <Link
          to="/download"
          onClick={() => trackFunnel("cta_sidekick", { placement: "ghost_card" })}
          className="flex min-h-[200px] flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm border-dashed no-underline hover:border-primary"
        >
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 bg-muted p-4 text-center">
            <div className="text-lg font-bold">Your run goes here</div>
            <div className="text-xs text-muted-foreground">Tonight, if Sidekick is running.</div>
          </div>
          <div className="flex flex-col gap-1 px-3.5 py-3">
            <div className="text-[15px] font-semibold text-primary">Get Sidekick</div>
            <div className="text-xs text-muted-foreground">2 minutes to set up</div>
          </div>
        </Link>
      </div>
    </section>
  );
}

function ClosingBand() {
  return (
    <section id="get" className="hidden border-t bg-card lg:block">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-6 p-8">
        <div className="flex max-w-[560px] flex-col gap-1.5">
          <h2 className="m-0 text-[26px] font-bold">Tonight's run could be on this page.</h2>
          <p className="m-0 text-sm leading-normal text-muted-foreground">
            Sidekick is a 9 MB tray app. It never opens a window, never asks you to upload anything, and the stone
            tells you it is working.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {[
            [DOWNLOAD_MAC_URL, "Download for macOS"],
            [DOWNLOAD_WINDOWS_URL, "Download for Windows"],
          ].map(([href, label]) => (
            <Button key={href} asChild variant="button-bright" size="lg" className="h-12 text-[15px] font-semibold">
              <a href={href} onClick={() => trackFunnel("cta_sidekick", { placement: "band" })} className="no-underline">
                {label}
              </a>
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Everything on /start below how-it-works: its own chunk, so none of it (or its requests) goes out before first paint.
 * `onExplore` opens the Explore modal on a recent run or a throne's record.
 */
export default function StartBelowFold({ onExplore }: { onExplore: (target: ExploreTarget) => void }) {
  return (
    <>
      <RecentRuns onExplore={onExplore} />
      <KingOfTheHill onExplore={onExplore} />
      <ClosingBand />
    </>
  );
}
