import { X } from "lucide-react";
import { CLASS_CSS_VAR, CLASS_DISPLAY, SPEC_BY_CLASS } from "@/pages/Rankings/classDisplay";
import type { SlotEntry } from "./types";
import { entryName } from "./types";

interface SlotEditorModalProps {
  entry: SlotEntry;
  onPatch: (patch: Partial<Pick<SlotEntry, "spec" | "note">>) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Overlay editor for a placed slot: pick the planned spec, add a note, or remove. */
export function SlotEditorModal({ entry, onPatch, onRemove, onClose }: SlotEditorModalProps) {
  const color = CLASS_CSS_VAR[entry.cls] ?? CLASS_CSS_VAR.UNKNOWN;
  const clsName = CLASS_DISPLAY[entry.cls] ?? entry.cls;
  const specs = SPEC_BY_CLASS[entry.cls] ?? [];

  let subtitle: string;
  if (entry.kind === "placeholder") {
    subtitle = "unfilled slot — pick the build you plan to recruit";
  } else {
    subtitle = `${clsName} · ${entry.realmName}`;
    if (entry.specRoles.length > 0) {
      const combos = entry.specRoles
        .map((sr) => `${sr.spec || "?"}${sr.role ? ` (${sr.role})` : ""}`)
        .join(", ");
      subtitle += ` · played ${combos}`;
    }
  }

  return (
    <div
      onClick={onClose}
      className="absolute inset-0 z-20 bg-black/45 flex items-center justify-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[360px] max-w-[calc(100%-2rem)] border border-border rounded-xl bg-popover shadow-xl p-4"
      >
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">
              {entry.kind === "placeholder" ? `Placeholder — ${clsName}` : entryName(entry)}
            </p>
            <p className="text-[10px] text-muted-foreground truncate" title={subtitle}>
              {subtitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-[10px] font-semibold tracking-widest text-muted-foreground mt-3 mb-1.5">SPEC</p>
        <div className="flex flex-wrap gap-1">
          {["", ...specs].map((spec) => {
            const selected = entry.spec === spec;
            return (
              <button
                key={spec || "any"}
                onClick={() => onPatch({ spec })}
                className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground hover:border-ring hover:text-foreground"
                }`}
              >
                {spec || `${clsName} (any)`}
              </button>
            );
          })}
        </div>

        <p className="text-[10px] font-semibold tracking-widest text-muted-foreground mt-3 mb-1.5">NOTE</p>
        <input
          value={entry.note}
          onChange={(e) => onPatch({ note: e.target.value })}
          placeholder="e.g. bring FR gear, confirm attendance"
          className="w-full px-2.5 py-1.5 bg-card border border-border rounded-md text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />

        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={onRemove}
            className="px-2.5 py-1 rounded-md border border-destructive/40 text-destructive text-[11px] hover:bg-destructive/10 transition-colors"
          >
            {entry.kind === "placeholder" ? "Remove" : "Remove from raid"}
          </button>
          <button
            onClick={onClose}
            className="ml-auto px-3.5 py-1 rounded-md bg-primary text-primary-foreground text-[11.5px] font-medium hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
