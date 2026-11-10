import { Link } from "react-router-dom";
import type { RawLogCleanup } from "@/api/typesGenerated";

/** Cleanup can happen even when the new upload fails. */
export function RawLogCleanupSummary({ cleanup }: { cleanup?: RawLogCleanup }) {
  const ids = cleanup?.deleted_log_ids ?? [];
  if (ids.length === 0) return null;

  return (
    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
      <p>
        Storage cleanup removed raw files, parts, and artifacts from {ids.length} older {ids.length === 1 ? "log" : "logs"}. Parsed reports are preserved.
      </p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Cleaned up logs">
        {ids.slice(0, 5).map((id) => (
          <li key={id}>
            <Link to={`/logs/${id}`} className="underline hover:text-foreground break-all">{id}</Link>
          </li>
        ))}
        {ids.length > 5 && <li>and {ids.length - 5} more</li>}
      </ul>
    </div>
  );
}
