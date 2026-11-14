import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Calculator, LayoutGrid } from "lucide-react";
import type { ArmorySearchResult } from "@/api/typesGenerated";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BossCalculator, LensTabs } from "@/pages/Ratings/BossCalculator";
import { RaidPanel } from "@/pages/Ratings/RaidPanel";
import type { Lens } from "@/pages/Ratings/ratingLens";
import {
  datasetFromGroup,
  groupKey,
  type RaidBoss,
  type RaidView,
  type RatingDataset,
} from "@/pages/Ratings/useMyRatingData";
import { explorableBosses, raidName, type RaidRating } from "./careerRatingsModel";

export type ExplorerCharacter = Pick<ArmorySearchResult, "realm_id" | "id">;

/** What to open: a raid's bosses, or one of them, through a lens. */
export interface BossExplorerTarget {
  raid: RaidRating;
  /** One boss; undefined shows every boss of the raid. */
  boss?: string;
  lens: Lens;
}

/** The armory table already shows raw performance; the explorer covers parses and the ratings. */
const EXPLORER_LENSES = ["parse", "peak", "mastery", "renown"] as const;

/** Every boss of the raid as the ratings explainer's raid view; bosses never killed count as zero. */
function raidView(raid: RaidRating, sample: RatingDataset): RaidView {
  const bosses: RaidBoss[] = [
    ...raid.bosses.map((b) => ({
      ...b,
      groupKey: b.group && groupKey(b.group),
      values: b.group?.kills.map((k) => k.value) ?? [],
    })),
    ...raid.missingBosses.map((name) => ({
      encounterName: name,
      kills: 0,
      benchmark: 0,
      peak: 0,
      form: 0,
      floor: 0,
      mastery: 0,
      rawPeak: 0,
      renown: 0,
      values: [],
    })),
  ];
  const avg = (pick: (b: RaidBoss) => number) =>
    bosses.length === 0 ? 0 : bosses.reduce((s, b) => s + pick(b), 0) / bosses.length;
  return {
    scope: {
      key: raid.key,
      label: sample.cohortLabel,
      cohort: "",
      metric: sample.unit.toLowerCase(),
      kills: raid.kills,
    },
    raidLabel: raidName(raid),
    unit: sample.unit,
    bosses,
    peak: avg((b) => b.peak),
    mastery: avg((b) => b.mastery),
    renown: bosses.reduce((s, b) => s + b.renown, 0),
  };
}

/** Calculator icon button that opens the explorer. */
export function ExploreButton({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex cursor-pointer items-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sky-500/15 hover:text-sky-300",
        className,
      )}
    >
      <Calculator className="size-4" />
    </button>
  );
}

/**
 * One modal for a raid's kills: every boss at once, or one boss's kills as
 * parses or as Peak, Mastery, and Renown.
 */
export function BossExplorerDialog({
  target,
  character,
  ratingsHref,
  onClose,
}: {
  target?: BossExplorerTarget;
  character: ExplorerCharacter;
  /** The ratings explainer for a raid or one of its bosses, with this character selected. */
  ratingsHref?: (raidKey: string, boss?: string) => string;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="styled-scrollbar max-h-[90vh] max-w-[calc(100%-2rem)] overflow-y-auto bg-card sm:max-w-5xl">
        {/* Keyed so each open starts from its own boss and lens. */}
        {target && (
          <ExplorerBody
            key={`${target.raid.key}|${target.boss ?? ""}|${target.lens}`}
            target={target}
            character={character}
            ratingsHref={ratingsHref}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExplorerBody({
  target,
  character,
  ratingsHref,
}: {
  target: BossExplorerTarget;
  character: ExplorerCharacter;
  ratingsHref?: (raidKey: string, boss?: string) => string;
}) {
  const { raid } = target;
  const bosses = explorableBosses(raid);
  // undefined: every boss.
  const [bossName, setBossName] = useState(
    () => bosses.find((b) => b.encounterName === target.boss)?.encounterName,
  );
  const [lens, setLens] = useState<Lens>(target.lens);
  const boss = bosses.find((b) => b.encounterName === bossName);
  const dataset = boss?.group ? datasetFromGroup(character, boss.group) : undefined;
  const sample = dataset ?? (bosses[0]?.group && datasetFromGroup(character, bosses[0].group));
  const href = ratingsHref?.(raid.key, boss?.encounterName);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-wow text-xl">{dataset?.bossName ?? raidName(raid)}</DialogTitle>
        <DialogDescription>
          {dataset ? raidName(raid) : "All bosses"}
          {sample && ` · ${sample.cohortLabel} ${sample.unit} · every logged kill`}
          {href && (
            <>
              {" · "}
              <Link to={href} className="inline-flex items-center gap-0.5 text-sky-300 hover:text-sky-200 hover:underline">
                Open in How Ratings Work
                <ArrowUpRight className="size-3" />
              </Link>
            </>
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Boss">
        <BossTab active={!bossName} onClick={() => setBossName(undefined)}>
          <LayoutGrid className="size-3.5" />
          All bosses
        </BossTab>
        {bosses.map((b) => (
          <BossTab key={b.encounterName} active={b.encounterName === bossName} onClick={() => setBossName(b.encounterName)}>
            {b.encounterName}
          </BossTab>
        ))}
      </div>

      {sample ? (
        <>
          <LensTabs lens={lens} onChange={setLens} compact only={EXPLORER_LENSES} />
          {dataset ? (
            // Keyed so a different boss starts with every kill logged.
            <ExplorerCalculator key={dataset.key} lens={lens} dataset={dataset} />
          ) : (
            <RaidPanel lens={lens} view={raidView(raid, sample)} onSelectBoss={setBossName} />
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No kill history for this raid as this spec yet.</p>
      )}
    </>
  );
}

function BossTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 font-wow text-xs transition-colors",
        active
          ? "border-sky-400 bg-sky-500/10 text-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ExplorerCalculator({ lens, dataset }: { lens: Lens; dataset: RatingDataset }) {
  const [killCount, setKillCount] = useState(dataset.kills.length);
  return (
    <BossCalculator
      lens={lens}
      dataset={dataset}
      killCount={killCount}
      setKillCount={setKillCount}
      benchmark={dataset.benchmark}
    />
  );
}
