interface MapFloorPickerProps {
  floors: number[];
  value: number | null;
  manualValue: number | null;
  uncertain: boolean;
  compact?: boolean;
  onChange: (floor: number | null) => void;
}

/** Controlled by the encounter anchor, including when its artwork is unavailable. */
export function MapFloorPicker({ floors, value, manualValue, uncertain, compact = false, onChange }: MapFloorPickerProps) {
  if (floors.length <= 1 && !uncertain) return null;
  const autoLabel = manualValue === null && value !== null ? `Auto (Floor ${value})` : "Auto";
  return (
    <label data-map-controls title={uncertain ? "Floor uncertain · choose a floor" : "Map floor"} className={compact
      ? "inline-flex max-w-full items-center"
      : uncertain
      ? "flex flex-wrap items-center gap-2 rounded border border-amber-400/40 bg-amber-950/40 px-3 py-2 text-xs text-amber-200"
      : "flex flex-wrap items-center gap-2 text-xs text-muted-foreground"}>
      <span className={compact ? "sr-only" : undefined}>{uncertain ? "Floor uncertain · choose a floor" : "Floor"}</span>
      <select
        aria-label={uncertain ? "Map floor: Floor uncertain · choose a floor" : "Map floor"}
        value={manualValue ?? "auto"}
        onChange={(event) => onChange(event.target.value === "auto" ? null : Number(event.target.value))}
        className={compact
          ? "pointer-events-auto rounded-sm border border-black/80 bg-black/75 px-2 py-1 text-[10px] font-medium text-white/75 shadow-[0_4px_16px_rgba(0,0,0,.5)] hover:bg-black/90 hover:text-white focus-visible:outline-2 focus-visible:outline-white/75 [color-scheme:dark]"
          : "min-h-8 rounded border border-border bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-amber-300 [color-scheme:dark]"}
      >
        <option value="auto">{autoLabel}</option>
        {floors.map((floor) => <option key={floor} value={floor}>Floor {floor} (manual)</option>)}
      </select>
    </label>
  );
}
