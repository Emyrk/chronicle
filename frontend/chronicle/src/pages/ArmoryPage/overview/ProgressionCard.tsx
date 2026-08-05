import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import type { RaidProgress } from "../parseAggregation";

interface ProgressionCardProps {
  progress: RaidProgress[];
  /** Total boss count per instance name, from the supported-instances API. */
  bossCounts?: Map<string, number>;
  isLoading: boolean;
}

/** Bosses defeated per raid, as filled pips. */
export function ProgressionCard({ progress, bossCounts, isLoading }: ProgressionCardProps) {
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
          const total = Math.max(
            bossCounts?.get(raid.instanceName) ?? raid.encountersDown,
            raid.encountersDown,
          );
          const complete = raid.encountersDown === total;
          return (
            <div key={`${raid.instanceName}|${raid.difficultyName}|${raid.maxPlayers}`}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <div className="font-wow min-w-0 truncate text-sm text-foreground">
                  {raid.instanceName}
                </div>
                <div className="font-mono shrink-0 text-sm font-bold text-foreground">
                  {raid.encountersDown} / {total}
                </div>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: total }, (_, i) => (
                  <div
                    key={i}
                    className="h-2 flex-1 rounded-xs"
                    style={{
                      background:
                        i < raid.encountersDown
                          ? complete
                            ? "var(--color-amber-500)"
                            : "var(--color-green-400)"
                          : "var(--border)",
                    }}
                  />
                ))}
              </div>
              <div className="mt-1.5 text-xs text-muted-foreground">
                {[
                  raid.maxPlayers > 0 ? `${raid.maxPlayers}-player` : "",
                  raid.difficultyName,
                  `${raid.kills} ${raid.kills === 1 ? "kill" : "kills"} logged`,
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
