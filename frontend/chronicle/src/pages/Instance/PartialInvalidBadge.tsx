import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";

export interface InvalidEncounterSummary {
  id: string;
  name: string;
  invalidReason?: string;
}

interface PartialInvalidBadgeProps {
  encounters: readonly InvalidEncounterSummary[];
}

export function PartialInvalidBadge({ encounters }: PartialInvalidBadgeProps) {
  if (encounters.length === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="cursor-help rounded bg-amber-500/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-400"
          tabIndex={0}
        >
          Partially invalid
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" sideOffset={6} className="max-w-sm p-3 normal-case tracking-normal">
        <p className="font-semibold text-zinc-100">
          {encounters.length} invalid {encounters.length === 1 ? "encounter" : "encounters"}
        </p>
        <ul className="mt-2 space-y-1 text-sm text-zinc-300">
          {encounters.map((encounter) => (
            <li key={encounter.id}>
              <span className="font-medium text-zinc-100">{encounter.name}</span>
              {encounter.invalidReason ? `: ${encounter.invalidReason}` : ""}
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}
