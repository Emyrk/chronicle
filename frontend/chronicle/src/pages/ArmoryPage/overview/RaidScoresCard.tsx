import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/Collapsible/Collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/Table/Table";
import { parseColor, parseHexColor } from "@/pages/Instance/parseColors";
import type { EncounterSummary, RaidSummary } from "../parseAggregation";
import type { ParseMetric } from "./util";

interface RaidScoresCardProps {
  raids: RaidSummary[];
  metric: ParseMetric;
  isLoading: boolean;
}

/** Per-raid score ledger; expand a raid for its per-boss breakdown. */
export function RaidScoresCard({ raids, metric, isLoading }: RaidScoresCardProps) {
  const [open, setOpen] = useState<string | null>(raids[0] ? raidKey(raids[0]) : null);
  // Open the biggest raid once data arrives (state initializes before load).
  const [autoOpened, setAutoOpened] = useState(false);
  if (!autoOpened && raids.length > 0) {
    setAutoOpened(true);
    setOpen(raidKey(raids[0]));
  }

  return (
    <Card className="gap-0 py-4">
      <CardHeader className="border-b border-border pb-4">
        <CardTitle>Raid scores</CardTitle>
        <CardDescription>
          Best-3 average per boss, last 60 days · expand a raid for its bosses
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pt-0">
        {raids.length === 0 && (
          <div className="px-6 py-6 text-sm text-muted-foreground">
            {isLoading
              ? "Loading raid scores…"
              : `No scored ${metric.toUpperCase()} kills in the last 60 days.`}
          </div>
        )}
        {raids.map((raid) => {
          const key = raidKey(raid);
          return (
            <Collapsible
              key={key}
              open={open === key}
              onOpenChange={(o) => setOpen(o ? key : null)}
            >
              <CollapsibleTrigger className="w-full cursor-pointer border-b border-border px-6 py-4 text-left transition-colors hover:bg-muted/40">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,1fr)_260px_56px_64px_14px]">
                  <div className="min-w-0">
                    <div className="font-wow truncate text-base text-foreground">
                      {raid.instanceName}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {[
                        raid.maxPlayers > 0 ? `${raid.maxPlayers}-player` : "",
                        raid.difficultyName,
                        `${raid.kills} boss ${raid.kills === 1 ? "kill" : "kills"} logged`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="relative hidden sm:block">
                    <ScoreBar score={raid.score} best={raid.best} />
                  </div>
                  <div className="hidden text-right sm:block">
                    <div className={`font-mono text-lg font-bold ${parseColor(raid.best)}`}>
                      {raid.best}
                    </div>
                    <div className="text-xs text-muted-foreground">best</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-mono text-3xl font-bold ${parseColor(raid.score)}`}>
                      {raid.score}
                    </div>
                    <div className="text-xs text-muted-foreground">score</div>
                  </div>
                  <div
                    className="hidden text-xs text-muted-foreground transition-transform sm:block"
                    style={{ transform: open === key ? "rotate(0deg)" : "rotate(-90deg)" }}
                  >
                    ▾
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-b border-border bg-popover px-6 py-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Boss</TableHead>
                        <TableHead className="text-right">Best {metric.toUpperCase()}</TableHead>
                        <TableHead className="text-right">Kills</TableHead>
                        <TableHead className="text-right">Best</TableHead>
                        <TableHead className="w-64">Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {raid.encounters.map((e) => (
                        <EncounterRow key={e.encounterName} encounter={e} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </CardContent>
    </Card>
  );
}

function raidKey(raid: RaidSummary): string {
  return `${raid.instanceName}|${raid.difficultyName}|${raid.maxPlayers}`;
}

function EncounterRow({ encounter }: { encounter: EncounterSummary }) {
  return (
    <TableRow>
      <TableCell className="font-wow">{encounter.encounterName}</TableCell>
      <TableCell className="text-right font-mono text-muted-foreground">
        <Link
          to={`/instances/${encounter.bestParse.instance_id}`}
          className="hover:text-foreground hover:underline"
          title="Open the log of the best parse"
        >
          {Math.round(encounter.bestMetricValue).toLocaleString()}
        </Link>
      </TableCell>
      <TableCell className="text-right font-mono text-muted-foreground">
        {encounter.kills}
      </TableCell>
      <TableCell className={`text-right font-mono ${parseColor(encounter.best)}`}>
        {encounter.best}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="relative grow">
            <ScoreBar score={encounter.score} best={encounter.best} />
          </div>
          <div className={`w-7 text-right font-mono text-sm font-bold ${parseColor(encounter.score)}`}>
            {encounter.score}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Filled score bar with a tick marking the all-window best. */
function ScoreBar({ score, best }: { score: number; best: number }) {
  return (
    <>
      <div className="h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full"
          style={{ width: `${score}%`, background: parseHexColor(score) }}
        />
      </div>
      <div
        className="absolute -top-0.5 h-2.5 w-0.5 rounded-[1px]"
        style={{ left: `calc(${best}% - 1px)`, background: parseHexColor(best) }}
      />
    </>
  );
}
