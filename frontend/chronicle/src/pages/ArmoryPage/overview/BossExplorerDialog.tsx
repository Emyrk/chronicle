import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Calculator } from "lucide-react";
import type { ArmorySearchResult } from "@/api/typesGenerated";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BossCalculator, LensTabs } from "@/pages/Ratings/BossCalculator";
import type { Lens } from "@/pages/Ratings/ratingLens";
import { datasetFromGroup, type RatingDataset } from "@/pages/Ratings/useMyRatingData";
import { explorableBosses, raidName, type RaidRating } from "./careerRatingsModel";

export type ExplorerCharacter = Pick<ArmorySearchResult, "realm_id" | "id">;

/** What to open: a raid, optionally one of its bosses, through a lens. */
export interface BossExplorerTarget {
  raid: RaidRating;
  boss?: string;
  lens: Lens;
}

/** The armory table already shows raw performance; the explorer covers parses and the ratings. */
const EXPLORER_LENSES = ["parse", "peak", "mastery", "renown"] as const;

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
 * One modal for a raid's boss kills: pick a boss, then read its kills as
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
  /** The ratings explainer for a boss, with this character selected. */
  ratingsHref?: (raidKey: string, boss: string) => string;
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
  ratingsHref?: (raidKey: string, boss: string) => string;
}) {
  const { raid } = target;
  const bosses = explorableBosses(raid);
  const [bossName, setBossName] = useState(
    () => bosses.find((b) => b.encounterName === target.boss)?.encounterName ?? bosses[0]?.encounterName,
  );
  const [lens, setLens] = useState<Lens>(target.lens);
  const boss = bosses.find((b) => b.encounterName === bossName);
  const dataset = boss?.group ? datasetFromGroup(character, boss.group) : undefined;
  const href = boss && ratingsHref?.(raid.key, boss.encounterName);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-wow text-xl">{dataset?.bossName ?? raidName(raid)}</DialogTitle>
        <DialogDescription>
          {raidName(raid)}
          {dataset && ` · ${dataset.cohortLabel} ${dataset.unit} · every logged kill`}
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

      {bosses.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Boss">
          {bosses.map((b) => (
            <button
              key={b.encounterName}
              type="button"
              role="tab"
              aria-selected={b.encounterName === bossName}
              onClick={() => setBossName(b.encounterName)}
              className={cn(
                "cursor-pointer rounded-full border px-3 py-1 font-wow text-xs transition-colors",
                b.encounterName === bossName
                  ? "border-sky-400 bg-sky-500/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {b.encounterName}
            </button>
          ))}
        </div>
      )}

      {dataset ? (
        <>
          <LensTabs lens={lens} onChange={setLens} compact only={EXPLORER_LENSES} />
          {/* Keyed so a different boss starts with every kill logged. */}
          <ExplorerCalculator key={dataset.key} lens={lens} dataset={dataset} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No kill history for this raid as this spec yet.</p>
      )}
    </>
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
