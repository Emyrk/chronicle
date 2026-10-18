import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { participantColor, participantLabel } from "./liveSessionProtocol";
import { useLivePresenceSurface } from "./LiveSessionContext";

const MAX_VISIBLE_DOTS = 3;

/** Compact panel-edge indicator for remote participants using a presence surface. */
export function LivePresenceIndicator({ surface }: { surface: string }) {
  const participants = useLivePresenceSurface(surface);
  if (participants.length === 0) return null;

  const visible = participants.slice(0, MAX_VISIBLE_DOTS);
  const remaining = participants.length - visible.length;
  const label = `${participants.length} ${participants.length === 1 ? "person" : "people"} viewing this panel`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          role="status"
          aria-label={label}
          className="inline-flex cursor-default items-center rounded-full border border-border/70 bg-background/80 px-1 py-0.5 shadow-sm"
        >
          <span className="flex -space-x-1">
            {visible.map((participantId) => (
              <span
                key={participantId}
                className="h-2.5 w-2.5 rounded-full border border-background shadow-[0_0_0_1px_rgba(0,0,0,.2)]"
                style={{ backgroundColor: participantColor(participantId) }}
              />
            ))}
          </span>
          {remaining > 0 && <span className="ml-1 text-[9px] font-medium text-muted-foreground">+{remaining}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="min-w-36 p-2">
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Viewing this panel</div>
        <div className="space-y-1">
          {participants.map((participantId) => (
            <div key={participantId} className="flex items-center gap-1.5 text-xs">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: participantColor(participantId) }} />
              <span>{participantLabel(participantId)}</span>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
