import type { CareerPlayerCohort } from "@/api/typesGenerated";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { METRIC_THEMES } from "@/pages/Leaderboards/Ratings/ratingThemes";
import { characterRenown } from "./careerRatingsModel";

/** The character's Renown across every spec, with a per-raid and per-spec breakdown on hover. */
export function RenownStat({ cohorts }: { cohorts: readonly CareerPlayerCohort[] }) {
  const renown = characterRenown(cohorts);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="cursor-help" style={{ color: METRIC_THEMES.renown.accent }}>
          {Math.round(renown.total).toLocaleString()}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={2} className="max-w-none px-3 py-2.5">
        <div className="space-y-2">
          <div className="font-semibold">Renown by raid</div>
          {renown.raids.length === 0 ? (
            <div className="text-zinc-400">No Renown yet.</div>
          ) : (
            <table className="font-mono tabular-nums">
              <thead>
                <tr className="text-zinc-400">
                  <th className="pr-4 text-left font-normal">Raid</th>
                  <th className="pr-4 text-right font-normal">Kills</th>
                  <th className="text-right font-normal">Renown</th>
                </tr>
              </thead>
              <tbody>
                {renown.raids.map((r) => (
                  <tr key={r.key}>
                    <td className="pr-4 font-sans">
                      {r.label}
                      {r.renownOnly && <span className="text-zinc-500"> · Renown only</span>}
                    </td>
                    <td className="pr-4 text-right">{r.kills}</td>
                    <td className="text-right">{Math.round(r.renown).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/10">
                  <td className="pt-1 pr-4 font-sans text-zinc-400">Total</td>
                  <td className="pt-1 pr-4 text-right">{renown.raids.reduce((n, r) => n + r.kills, 0)}</td>
                  <td className="pt-1 text-right">{Math.round(renown.total).toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          )}
          {renown.specs.length > 1 && (
            <div className="text-zinc-400">
              {renown.specs.map((s) => `${s.label} ${Math.round(s.renown).toLocaleString()}`).join(" · ")}
            </div>
          )}
          <div className="text-zinc-400">Every spec counts. Each boss kill earns its award; weights do not apply.</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
