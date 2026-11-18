import { useState } from "react";
import type { IdentityInstance } from "@/api/typesGenerated";
import { copyUnknownUnits, formatUnknownUnits } from "./unknownUnitsExport";

export function CopyUnknownsButton({ instance, instanceNumber }: { instance: IdentityInstance; instanceNumber: number }) {
  const [status, setStatus] = useState("");
  const text = formatUnknownUnits(instance, instanceNumber);
  if (!text) return null;

  return (
    <div className="my-2 flex items-center gap-2">
      <button type="button" className="rounded bg-muted px-2 py-1 text-xs" aria-label={`Copy unknowns for instance ${instanceNumber}: ${instance.name}`} onClick={async () => setStatus(await copyUnknownUnits(text))}>
        Copy unknowns
      </button>
      <span role="status" className="text-xs">{status}</span>
    </div>
  );
}
