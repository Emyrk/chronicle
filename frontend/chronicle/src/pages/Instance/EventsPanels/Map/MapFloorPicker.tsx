interface MapFloorPickerProps {
  floors: number[];
  value: number | null;
  onChange: (floor: number) => void;
}

/** Keeps floor selection available even when the active floor has no usable layer. */
export function MapFloorPicker({ floors, value, onChange }: MapFloorPickerProps) {
  if (floors.length <= 1) return null;
  return (
    <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
      <span>Floor</span>
      <select
        aria-label="Map floor"
        value={value ?? ""}
        onChange={(event) => onChange(Number(event.target.value))}
        className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground [color-scheme:dark]"
      >
        {floors.map((floor) => <option key={floor} value={floor}>Floor {floor}</option>)}
      </select>
    </label>
  );
}
