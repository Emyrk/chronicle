import { entityAttributes, raidEntity, bossEntity } from "@/components/EntityMenu/entity";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Calculator } from "lucide-react";
import type { ArmorySearchResult } from "@/api/typesGenerated";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StandaloneBossCalculator } from "@/pages/Ratings/BossCalculator";
import { datasetFromGroup } from "@/pages/Ratings/useMyRatingData";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/Collapsible/Collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/Table/Table";
import { getInstanceAccentColor } from "@/pages/Logs/utils/instanceImages";
import { METRIC_THEMES } from "@/pages/Leaderboards/Ratings/ratingThemes";
import type { BossRating, RaidRating } from "./careerRatingsModel";

interface RaidRatingsCardProps {
  raids: RaidRating[];
  metric: string;
  isLoading: boolean;
  /** Shown instead of the raid list when there is nothing to rate. */
  emptyMessage?: string;
  /** The character, for the per-boss ratings calculator. */
  character?: Character;
  /** The ratings explainer for one raid (or one of its bosses), with this character selected. */
  ratingsHref?: (raidKey: string, boss?: string) => string;
}

type Character = Pick<ArmorySearchResult, "realm_id" | "id">;

const MASTERY = METRIC_THEMES.mastery.accent;
const PEAK = METRIC_THEMES.peak.accent;
const RENOWN = METRIC_THEMES.renown.accent;
const fmt = (v: number | null) => (v === null ? "—" : v.toFixed(1));

/** Per-raid career contributions; expand a raid for its bosses against the benchmark. */
export function RaidRatingsCard({
  raids,
  metric,
  isLoading,
  emptyMessage,
  character,
  ratingsHref,
}: RaidRatingsCardProps) {
  const active = raids.filter((r) => r.kills > 0);
  const untouched = raids.filter((r) => r.kills === 0 && r.rated);
  const [open, setOpen] = useState<string | null>(null);
  const openKey = open ?? active[0]?.key ?? null;

  return (
    <Card className="gap-0 border-0 bg-transparent px-0 pt-4 pb-0 shadow-none">
      <CardHeader className="px-0 pb-4">
        <CardTitle className="text-xs font-normal tracking-[0.2em] text-muted-foreground uppercase">
          Raid ratings
        </CardTitle>
        <CardDescription>
          All-time {metric.toUpperCase()} against the benchmark, the best {metric.toUpperCase()} recorded for this
          spec · expand a raid for its bosses
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-0">
        {active.length === 0 && (
          <div className="rounded-xl border border-border bg-card px-6 py-6 text-sm text-muted-foreground">
            {isLoading ? "Loading raid ratings…" : (emptyMessage ?? "No rated kills yet.")}
          </div>
        )}
        {active.map((raid) => (
          <RaidRow
            key={raid.key}
            raid={raid}
            metric={metric}
            open={openKey === raid.key}
            onOpenChange={(o) => setOpen(o ? raid.key : "")}
            character={character}
            ratingsHref={ratingsHref && ((boss?: string) => ratingsHref(raid.key, boss))}
          />
        ))}
        {untouched.length > 0 && (
          <div className="rounded-xl border border-dashed border-border px-6 py-4 text-xs text-muted-foreground">
            <span className="text-foreground">No kills yet:</span>{" "}
            {untouched.map((r, i) => (
              <span key={r.key} {...entityAttributes(raidEntity(r.instanceName, r.difficultyName))}>
                {i > 0 && " · "}
                {raidName(r)}
                {r.weight !== null && <span className="opacity-60"> ×{r.weight}</span>}
              </span>
            ))}
            <div className="mt-1">These count as zero toward Mastery and Peak until the spec has a kill there.</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function raidName(r: Pick<RaidRating, "instanceName" | "difficultyName" | "maxPlayers">): string {
  return [r.instanceName, r.difficultyName, r.maxPlayers > 0 ? `${r.maxPlayers}` : ""].filter(Boolean).join(" ");
}

function RaidRow({
  raid,
  metric,
  open,
  onOpenChange,
  character,
  ratingsHref,
}: {
  raid: RaidRating;
  metric: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  character?: Character;
  ratingsHref?: (boss?: string) => string;
}) {
  const accent = getInstanceAccentColor(raid.instanceName);
  const bossTotal = raid.bosses.length + raid.missingBosses.length;
  const subtitle = [
    raid.rated ? (raid.weight !== null ? `Weight ×${raid.weight}` : "") : "Renown only",
    `${raid.kills} ${raid.kills === 1 ? "kill" : "kills"}`,
    raid.rated && bossTotal > 0 ? `${raid.bosses.filter((b) => b.kills > 0).length}/${bossTotal} bosses rated` : "",
  ].filter(Boolean);

  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
    >
      {/* The trigger stretches under the row so the ratings link isn't nested in a button. */}
      <div
        className={`group relative px-6 py-5 ${open ? "border-b border-border" : ""}`}
        style={{
          backgroundImage: `linear-gradient(90deg, ${accent}14 0%, transparent 42%)`,
          boxShadow: `inset 4px 0 0 ${accent}`,
        }}
      >
        <CollapsibleTrigger
          aria-label={`${open ? "Collapse" : "Expand"} ${raidName(raid)} bosses`}
          className="absolute inset-0 cursor-pointer transition-colors hover:bg-muted/30"
        />
        <div className="pointer-events-none relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto_200px_14px]">
          <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-3">
              {/* Clickable itself so Alt+click reaches the entity menu; a plain click toggles the row. */}
              <div
                {...entityAttributes(raidEntity(raid.instanceName, raid.difficultyName))}
                onClick={() => onOpenChange(!open)}
                className="pointer-events-auto cursor-pointer truncate font-wow text-lg text-foreground"
              >
                {raidName(raid)}
              </div>
              {ratingsHref && (
                <Link
                  to={ratingsHref()}
                  className="pointer-events-auto inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
                >
                  How ratings work
                  <ArrowUpRight className="size-3" />
                </Link>
              )}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{subtitle.join(" · ")}</div>
          </div>
          <div className="flex items-end gap-5 text-right">
            {raid.rated && <RowStat label="Mastery" value={fmt(raid.mastery)} color={MASTERY} big />}
            {raid.rated && <RowStat label="Peak" value={fmt(raid.peak)} color={PEAK} />}
            <RowStat label="Renown" value={Math.round(raid.renown).toLocaleString()} color={RENOWN} />
          </div>
          {raid.rated ? <BossBars raid={raid} /> : <div className="hidden sm:block" />}
          <div
            className="hidden text-xs text-muted-foreground transition-transform sm:block"
            style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
          >
            ▾
          </div>
        </div>
      </div>
      <CollapsibleContent>
        <div className="styled-scrollbar overflow-x-auto bg-popover px-6 py-4">
          <BossTable raid={raid} metric={metric} character={character} ratingsHref={ratingsHref} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function RowStat({ label, value, color, big }: { label: string; value: string; color: string; big?: boolean }) {
  return (
    <div>
      <div className={`font-mono leading-none font-bold tabular-nums ${big ? "text-3xl" : "text-lg"}`} style={{ color }}>
        {value}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

/** One bar per boss (Mastery height); bosses without kills show as empty stubs. */
function BossBars({ raid }: { raid: RaidRating }) {
  const bars = [
    ...raid.bosses.map((b) => ({ name: b.encounterName, value: b.kills > 0 ? b.mastery : null })),
    ...raid.missingBosses.map((name) => ({ name, value: null })),
  ];
  return (
    <div className="hidden h-10 items-end justify-end gap-1 sm:flex" aria-label="Boss Mastery summary">
      {bars.map((b) => (
        <div
          key={b.name}
          className="w-1.5 rounded-sm"
          style={
            b.value === null
              ? { height: 2, background: "var(--border)" }
              : { height: `${Math.max(b.value, 4)}%`, background: MASTERY }
          }
          title={b.value === null ? `${b.name}: no kills` : `${b.name}: ${b.value.toFixed(1)} Mastery`}
        />
      ))}
    </div>
  );
}

function BossTable({
  raid,
  metric,
  character,
  ratingsHref,
}: {
  raid: RaidRating;
  metric: string;
  character?: Character;
  ratingsHref?: (boss?: string) => string;
}) {
  const unit = metric.toUpperCase();
  const [explaining, setExplaining] = useState<BossRating>();
  const canExplain = raid.rated && !!character;
  return (
    <>
      <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Boss</TableHead>
          <TableHead className="text-right">Kills</TableHead>
          <TableHead className="text-right" title={`Best ${unit} recorded for this spec`}>
            Benchmark
          </TableHead>
          <TableHead className="text-right">Best {unit}</TableHead>
          {raid.rated && (
            <>
              <TableHead className="text-right">Peak</TableHead>
              <TableHead className="text-right">Form</TableHead>
              <TableHead className="text-right">Floor</TableHead>
              <TableHead className="w-48">Mastery</TableHead>
            </>
          )}
          <TableHead className="text-right">Renown</TableHead>
          {canExplain && <TableHead className="w-8" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {raid.bosses.map((b) => (
          <BossRow
            key={b.encounterName}
            boss={b}
            instanceName={raid.instanceName}
            rated={raid.rated}
            onExplain={canExplain ? () => setExplaining(b) : undefined}
          />
        ))}
        {raid.missingBosses.length > 0 && (
          <TableRow className="text-muted-foreground hover:bg-transparent">
            <TableCell colSpan={(raid.rated ? 9 : 5) + (canExplain ? 1 : 0)} className="text-xs whitespace-normal">
              <span className="text-foreground">Not killed as this spec:</span> {raid.missingBosses.map((name, i) => <span key={name}>{i > 0 && " · "}<span {...entityAttributes(bossEntity(raid.instanceName, name))}>{name}</span></span>)}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
      </Table>
      {character && (
        <BossCalculatorDialog
          boss={explaining}
          raidName={raidName(raid)}
          character={character}
          href={explaining && ratingsHref?.(explaining.encounterName)}
          onClose={() => setExplaining(undefined)}
        />
      )}
    </>
  );
}

function BossCalculatorDialog({
  boss,
  raidName,
  character,
  href,
  onClose,
}: {
  boss?: BossRating;
  raidName: string;
  character: Character;
  href?: string;
  onClose: () => void;
}) {
  const dataset = boss?.group ? datasetFromGroup(character, boss.group) : undefined;
  return (
    <Dialog open={!!dataset} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="styled-scrollbar max-h-[90vh] bg-card max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-5xl">
        {dataset && (
          <>
            <DialogHeader>
              <DialogTitle className="font-wow text-xl">{dataset.bossName}</DialogTitle>
              <DialogDescription>
                {raidName} · {dataset.cohortLabel} {dataset.unit} · how these kills become Peak, Mastery, and Renown
                {href && (
                  <>
                    {" · "}
                    <Link
                      to={href}
                      className="inline-flex items-center gap-0.5 text-sky-300 hover:text-sky-200 hover:underline"
                    >
                      Open in How Ratings Work
                      <ArrowUpRight className="size-3" />
                    </Link>
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            {/* Keyed so a different boss starts with every kill logged. */}
            <StandaloneBossCalculator key={dataset.key} dataset={dataset} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BossRow({
  boss,
  rated,
  instanceName,
  onExplain,
}: {
  boss: BossRating;
  rated: boolean;
  instanceName: string;
  onExplain?: () => void;
}) {
  const perSecond = (v: number) => (
    <>
      {Math.round(v).toLocaleString()}
      <span className="opacity-50">/s</span>
    </>
  );
  const hasKills = boss.kills > 0;
  return (
    <TableRow>
      <TableCell {...entityAttributes(bossEntity(instanceName, boss.encounterName))} className="font-wow">{boss.encounterName}</TableCell>
      <TableCell className="text-right font-mono text-muted-foreground">{boss.kills}</TableCell>
      <TableCell className="text-right font-mono text-muted-foreground">
        {hasKills ? perSecond(boss.benchmark) : "—"}
      </TableCell>
      <TableCell className="text-right font-mono text-muted-foreground">
        {hasKills ? perSecond(boss.rawPeak) : "—"}
      </TableCell>
      {rated && (
        <>
          <TableCell className="text-right font-mono" style={{ color: PEAK }}>
            {hasKills ? boss.peak.toFixed(1) : "—"}
          </TableCell>
          <TableCell className="text-right font-mono text-muted-foreground">
            {hasKills ? boss.form.toFixed(1) : "—"}
          </TableCell>
          <TableCell className="text-right font-mono text-muted-foreground">
            {hasKills ? boss.floor.toFixed(1) : "—"}
          </TableCell>
          <TableCell>
            {hasKills ? (
              <div className="flex items-center gap-3">
                <div className="h-1.5 min-w-16 grow overflow-hidden rounded-full bg-border">
                  <div className="h-full rounded-full" style={{ width: `${boss.mastery}%`, background: MASTERY }} />
                </div>
                <div className="w-9 shrink-0 text-right font-mono text-sm font-bold" style={{ color: MASTERY }}>
                  {boss.mastery.toFixed(1)}
                </div>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Other metric only</span>
            )}
          </TableCell>
        </>
      )}
      <TableCell className="text-right font-mono" style={{ color: RENOWN }}>
        {boss.renown}
      </TableCell>
      {onExplain && (
        <TableCell className="py-1 text-right">
          {boss.group && (
            <button
              type="button"
              onClick={onExplain}
              title={`How ${boss.encounterName}'s ratings are calculated`}
              aria-label={`How ${boss.encounterName}'s ratings are calculated`}
              className="inline-flex cursor-pointer items-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sky-500/15 hover:text-sky-300"
            >
              <Calculator className="size-4" />
            </button>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}
