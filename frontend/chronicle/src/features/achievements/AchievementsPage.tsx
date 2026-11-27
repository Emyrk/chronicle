import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/Card/Card";
import { useAchievements } from "./achievementsApi";
import { AchievementsBrowser } from "./AchievementsBrowser";
import { buildAchievementsModel, isMacPlatform } from "./achievementsModel";
import { parseAchievementsState, serializeAchievementsState } from "./achievementsState";

/**
 * Route container for /achievements. Only fetches, maps, and syncs URL state;
 * all UI lives in AchievementsBrowser so Storybook and production match.
 */
export function AchievementsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const state = parseAchievementsState(searchParams);
  const query = useAchievements();
  const model = useMemo(() => (query.data ? buildAchievementsModel(query.data) : undefined), [query.data]);

  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
      {model ? (
        <AchievementsBrowser
          model={model}
          state={state}
          onStateChange={(next) => setSearchParams(serializeAchievementsState(next), { replace: true })}
          isMac={isMacPlatform()}
        />
      ) : query.isError ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Achievements could not be loaded. Try again shortly.</Card>
      ) : (
        <AchievementsSkeleton />
      )}
    </div>
  );
}

function AchievementsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading achievements">
      <div className="h-24 animate-pulse rounded-xl bg-muted/50" />
      <div className="flex gap-4">
        <div className="hidden h-96 w-64 animate-pulse rounded-lg bg-muted/40 lg:block" />
        <div className="flex-1 space-y-3">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-24 animate-pulse rounded-lg bg-muted/40" />
          ))}
        </div>
      </div>
    </div>
  );
}
