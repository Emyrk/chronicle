import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import {
  ProgressionBossIndicator,
  ProgressionPips,
} from "@/components/ui/Progression/ProgressionBossDetails";
import { progressionTotal } from "@/components/ui/Progression/progression";
import type { RaidProgress } from "../parseAggregation";

interface ProgressionCardProps {
  progress: RaidProgress[];
  /** Total boss count per instance name, from the supported-instances API. */
  bossCounts?: Map<string, number>;
  /** Canonical progression encounter names per instance. */
  progressionBosses?: Map<string, Set<string>>;
  isLoading: boolean;
}

/** Bosses defeated per raid, as filled pips. */
export function ProgressionCard({
  progress,
  bossCounts,
  progressionBosses,
  isLoading,
}: ProgressionCardProps) {
  return (
    <Card className="h-full gap-0 py-4">
      <CardHeader className="pb-3">
        <CardTitle>Progression</CardTitle>
        <CardDescription>Bosses you have defeated in each raid</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {progress.length === 0 && (
          <div className="py-2 text-sm text-muted-foreground">
            {isLoading ? "Loading progression…" : "No boss kills recorded yet."}
          </div>
        )}
        {progress.map((raid) => {
          const canonicalBosses = progressionBosses?.get(raid.instanceName);
          const total = progressionTotal(
            raid.instanceName,
            [raid],
            bossCounts,
            progressionBosses,
          );
          return (
            <div key={`${raid.instanceName}|${raid.difficultyName}|${raid.maxPlayers}`}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <div className="flex min-w-0 items-center gap-1.5">
                  <div className="font-wow min-w-0 truncate text-sm text-foreground">
                    {raid.instanceName}
                  </div>
                  <ProgressionBossIndicator
                    instanceName={raid.instanceName}
                    variant={raid}
                    canonicalBosses={canonicalBosses}
                    labelFormat="long"
                  />
                </div>
                <div className="font-mono shrink-0 text-sm font-bold text-foreground">
                  {raid.encountersDown} / {total}
                </div>
              </div>
              <ProgressionPips variant={raid} total={total} />
              <div className="mt-1.5 text-xs text-muted-foreground">
                {[
                  raid.maxPlayers > 0 ? `${raid.maxPlayers}-player` : "",
                  raid.difficultyName,
                  `${raid.kills} boss ${raid.kills === 1 ? "kill" : "kills"} logged`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
