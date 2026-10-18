/** Raid durability bar colour: red when critical, amber when low, green otherwise. */
export function raidHealthColor(percent: number): string {
  if (percent < 25) return "bg-red-500/80";
  if (percent < 55) return "bg-amber-500/65";
  return "bg-emerald-500/60";
}
