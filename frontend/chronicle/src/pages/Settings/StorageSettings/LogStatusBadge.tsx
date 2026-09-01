import type { LogStatusInfo } from "@/lib/logStatus";

export function LogStatusBadge({ status }: { status: LogStatusInfo }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${status.badgeClassName}`}>{status.label}</span>
  );
}
