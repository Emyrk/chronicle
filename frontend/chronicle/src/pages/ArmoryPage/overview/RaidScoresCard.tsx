import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/Collapsible/Collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/Table/Table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { parseColor, parseHexColor } from "@/pages/Instance/parseColors";
import type { EncounterSummary, RaidSummary } from "../parseAggregation";
import type { ParseMetric } from "./util";

const INSTANCE_ACCENTS: Record<string, string> = {
  "Molten Core": "#f97316",
  "Blackwing Lair": "#ef4444",
  "Temple of Ahn'Qiraj": "#d9aa42",
  "Ruins of Ahn'Qiraj": "#c8a050",
  Naxxramas: "#82c8b4",
  "Emerald Sanctum": "#34d399",
  "Zul'Gurub": "#ea580c",
  "Onyxia's Lair": "#22c55e",
  "Tower of Karazhan": "#8b5cf6",
  "Lower Tower of Karazhan": "#8b5cf6",
  "Upper Tower of Karazhan": "#8b5cf6",
  "Karazhan Crypts": "#7c3aed",
};

const DEFAULT_INSTANCE_ACCENT = "#64748b";

interface RaidScoresCardProps {
  raids: RaidSummary[];
  metric: ParseMetric;
  /** Total boss count per instance name, from the supported-instances API. */
  bossCounts?: Map<string, number>;
  isLoading: boolean;
}

/** Per-raid score ledger; expand a raid for its per-boss breakdown. */
export function RaidScoresCard({ raids, metric, bossCounts, isLoading }: RaidScoresCardProps) {
  const [open, setOpen] = useState<string | null>(raids[0] ? raidKey(raids[0]) : null);
  // Open the biggest raid once data arrives (state initializes before load).
  const [autoOpened, setAutoOpened] = useState(false);
  if (!autoOpened && raids.length > 0) {
    setAutoOpened(true);
    setOpen(raidKey(raids[0]));
  }

  return (
    <Card className="gap-0 border-0 bg-transparent p-0 shadow-none">
      <CardHeader className="px-0 pb-4">
        <CardTitle className="text-xs font-normal tracking-[0.2em] text-muted-foreground uppercase">
          Raid scores
        </CardTitle>
        <CardDescription>
          Best-3 average per boss, last 60 days · expand a raid for its bosses
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-0">
        {raids.length === 0 && (
          <div className="px-6 py-6 text-sm text-muted-foreground">
            {isLoading
              ? "Loading raid scores…"
              : `No scored ${metric.toUpperCase()} kills in the last 60 days.`}
          </div>
        )}
        {raids.map((raid) => {
          const key = raidKey(raid);
          const bossesLogged = raid.encounters.length;
          const bossTotal = Math.max(bossCounts?.get(raid.instanceName) ?? 0, bossesLogged);
          const incomplete = bossesLogged < bossTotal;
          const accent = INSTANCE_ACCENTS[raid.instanceName] ?? DEFAULT_INSTANCE_ACCENT;
          return (
            <Collapsible
              key={key}
              open={open === key}
              onOpenChange={(o) => setOpen(o ? key : null)}
              className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
            >
              <CollapsibleTrigger
                className={`w-full cursor-pointer px-6 py-5 text-left transition-colors hover:bg-muted/30 ${open === key ? "border-b border-border" : ""}`}
                style={{
                  backgroundImage: `linear-gradient(90deg, ${accent}14 0%, transparent 42%)`,
                  boxShadow: `inset 4px 0 0 ${accent}`,
                }}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,1fr)_80px_280px_14px]">
                  <div className="min-w-0">
                    <div className="font-wow truncate text-lg text-foreground">
                      {raid.instanceName}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      {incomplete && (
                        <AlertTriangle
                          className="size-3.5 shrink-0 text-amber-500"
                          aria-label="Not all bosses have logged kills"
                        />
                      )}
                      <span>
                        {[
                          raid.maxPlayers > 0 ? `${raid.maxPlayers}-player` : "",
                          raid.difficultyName,
                          `${bossesLogged}/${bossTotal} boss kills logged`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-baseline justify-end gap-1.5 text-right">
                    <div className={`font-mono text-3xl font-bold ${parseColor(raid.score)}`}>
                      {raid.score}
                    </div>
                    <div className="text-xs text-muted-foreground">score</div>
                  </div>
                  <RaidScoreBars encounters={raid.encounters} />
                  <div
                    className="hidden text-xs text-muted-foreground transition-transform sm:block"
                    style={{ transform: open === key ? "rotate(0deg)" : "rotate(-90deg)" }}
                  >
                    ▾
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="bg-popover px-6 py-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Boss</TableHead>
                        <TableHead className="text-right">Best {metric.toUpperCase()}</TableHead>
                        <TableHead className="text-right">Kills</TableHead>
                        <TableHead className="w-64">Score</TableHead>
                        <TableHead className="text-right">Best</TableHead>
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

function RaidScoreBars({ encounters }: { encounters: EncounterSummary[] }) {
  return (
    <div
      className="hidden h-10 items-end justify-end gap-1 sm:flex"
      aria-label="Boss score summary"
    >
      {encounters.map((encounter) => (
        <div
          key={encounter.encounterName}
          className="w-1.5 min-h-0.5 rounded-sm"
          style={{
            height: `${encounter.score}%`,
            background: parseHexColor(encounter.score),
          }}
          title={`${encounter.encounterName}: ${encounter.score}`}
        />
      ))}
    </div>
  );
}

function formatScoreInput(score: number): string {
  return score.toFixed(1).replace(/\.0$/, "");
}

function ScoreInputsTooltip({
  encounter,
  children,
}: {
  encounter: EncounterSummary;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="font-mono">
        Best {encounter.scoreInputs.length}: {encounter.scoreInputs.map(formatScoreInput).join(" · ")}
      </TooltipContent>
    </Tooltip>
  );
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
          <span className="opacity-50">/s</span>
        </Link>
      </TableCell>
      <TableCell className="text-right font-mono text-muted-foreground">
        {encounter.kills}
      </TableCell>
      <TableCell>
        <ScoreInputsTooltip encounter={encounter}>
          <div className="flex cursor-help items-center gap-3">
            <div className="relative min-w-16 grow">
              <ScoreBar score={encounter.score} best={encounter.best} />
            </div>
            <div className={`w-7 shrink-0 text-right font-mono text-sm font-bold ${parseColor(encounter.score)}`}>
              {encounter.score}
            </div>
          </div>
        </ScoreInputsTooltip>
      </TableCell>
      <TableCell className="text-right font-mono">
        <ScoreInputsTooltip encounter={encounter}>
          <span className={`cursor-help ${parseColor(encounter.best)}`}>
            {encounter.best}
          </span>
        </ScoreInputsTooltip>
      </TableCell>
    </TableRow>
  );
}

/** Filled score bar, with an optional tick marking the all-window best. */
function ScoreBar({ score, best }: { score: number; best?: number }) {
  return (
    <>
      <div className="h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full"
          style={{ width: `${score}%`, background: parseHexColor(score) }}
        />
      </div>
      {best !== undefined && (
        <div
          className="absolute -top-0.5 h-2.5 w-0.5 rounded-[1px]"
          style={{ left: `calc(${best}% - 1px)`, background: parseHexColor(best) }}
        />
      )}
    </>
  );
}
