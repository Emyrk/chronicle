import { ArrowRight, Globe2, Lock, LockKeyhole } from "lucide-react";
import { Link } from "react-router-dom";
import { TierPill } from "@/components/Supporter/Supporter";
import { TIER_COLOR } from "@/pages/Settings/billingPricing";

interface VisibilityPickerProps {
  unlistedLog: boolean;
  canMarkUnlisted: boolean;
  onChange: (unlistedLog: boolean) => void;
  /** When unlisted is locked, point to the Revered tier that unlocks it. */
  showUnlistedUpsell?: boolean;
}

/** Public/unlisted selector shown to every uploader; unlisted is locked without permission. */
export function VisibilityPicker({ unlistedLog, canMarkUnlisted, onChange, showUnlistedUpsell = false }: VisibilityPickerProps) {
  const upsell = !canMarkUnlisted && showUnlistedUpsell;
  const optionClass = (selected: boolean) =>
    `relative flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
      selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
    }`;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Visibility</h3>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Log visibility">
        <button
          type="button"
          role="radio"
          aria-checked={!unlistedLog}
          onClick={() => onChange(false)}
          className={optionClass(!unlistedLog)}
        >
          <Globe2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <span>
            <span className="block text-sm font-medium">Public</span>
            <span className="block text-xs text-muted-foreground">
              Anyone can view. Eligible for rankings.
            </span>
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={unlistedLog}
          onClick={() => onChange(true)}
          disabled={!canMarkUnlisted}
          title={canMarkUnlisted ? undefined : upsell ? "Unlisted uploads require Chronicle – Revered" : "You don't have permission to upload unlisted logs"}
          className={`${optionClass(unlistedLog)} disabled:cursor-not-allowed disabled:hover:bg-transparent`}
        >
          <LockKeyhole className={`mt-0.5 h-5 w-5 shrink-0 ${canMarkUnlisted ? "text-primary" : "text-muted-foreground"}`} />
          <span className={canMarkUnlisted ? undefined : "opacity-60"}>
            <span className="block text-sm font-medium">Unlisted</span>
            <span className="block text-xs text-muted-foreground">
              Anyone with the link can view. Excluded from rankings and public discovery, permanently.
            </span>
          </span>
          {!canMarkUnlisted && (
            upsell ? (
              <TierPill tier="revered" className="absolute right-2 top-2" />
            ) : (
              <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Lock className="h-3 w-3" />
                Locked
              </span>
            )
          )}
        </button>
      </div>
      {upsell && (
        <div
          className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center"
          style={{ borderColor: `${TIER_COLOR.revered}66`, backgroundColor: `${TIER_COLOR.revered}14` }}
        >
          <LockKeyhole className="h-5 w-5 shrink-0" style={{ color: TIER_COLOR.revered }} aria-hidden="true" />
          <p className="flex-1 text-sm">
            <span className="font-medium">Unlisted uploads are a Revered perk.</span>{" "}
            <span className="text-muted-foreground">Keep progression logs out of rankings and public discovery.</span>
          </p>
          <Link
            to="/supporter#unlisted"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium hover:underline underline-offset-4"
            style={{ color: TIER_COLOR.revered }}
          >
            Become Revered <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
