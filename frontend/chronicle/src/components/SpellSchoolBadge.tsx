import { cn } from "@/lib/utils";

// Re-export from central location (moved from wowdb.ts)
export const SPELL_SCHOOLS = [
  "Physical", "Holy", "Fire", "Nature", "Frost", "Shadow", "Arcane",
] as const;
export type SpellSchool = (typeof SPELL_SCHOOLS)[number];

export const SCHOOL_TEXT_COLORS: Record<string, string> = {
  Physical: "text-school-physical",
  Holy: "text-school-holy",
  Fire: "text-school-fire",
  Nature: "text-school-nature",
  Frost: "text-school-frost",
  Shadow: "text-school-shadow",
  Arcane: "text-school-arcane",
};

export const SCHOOL_BG_COLORS: Record<string, string> = {
  Physical: "bg-[var(--color-school-physical)]",
  Holy: "bg-[var(--color-school-holy)]",
  Fire: "bg-[var(--color-school-fire)]",
  Nature: "bg-[var(--color-school-nature)]",
  Frost: "bg-[var(--color-school-frost)]",
  Shadow: "bg-[var(--color-school-shadow)]",
  Arcane: "bg-[var(--color-school-arcane)]",
};

/** Colored inline text for a spell school */
export function SpellSchoolText({ school, className }: { school: string; className?: string }) {
  return (
    <span className={cn(SCHOOL_TEXT_COLORS[school] ?? "text-white", className)}>
      {school}
    </span>
  );
}

/** Pill badge with school background color */
export function SpellSchoolBadge({ school, className }: { school: string; className?: string }) {
  return (
    <span className={cn(
      "text-xs px-2 py-0.5 rounded font-medium text-white",
      SCHOOL_BG_COLORS[school] ?? "bg-muted",
      className,
    )}>
      {school}
    </span>
  );
}

// --- Damage Type Badges (uses CSS vars from index.css) ---

const DAMAGE_TYPE_STYLES: Record<string, string> = {
  Direct: "bg-[var(--color-dmgtype-direct)]/20 text-[var(--color-dmgtype-direct)]",
  Periodic: "bg-[var(--color-dmgtype-periodic)]/20 text-[var(--color-dmgtype-periodic)]",
  "Periodic Trigger": "bg-[var(--color-dmgtype-periodic-trigger)]/20 text-[var(--color-dmgtype-periodic-trigger)]",
  "Active Debuff": "bg-[var(--color-dmgtype-debuff)]/20 text-[var(--color-dmgtype-debuff)]",
  "No Engage Combat": "bg-[var(--color-dmgtype-noengage)]/20 text-[var(--color-dmgtype-noengage)]",
};
const DAMAGE_TYPE_DEFAULT = "bg-[var(--color-dmgtype-default)]/20 text-[var(--color-dmgtype-default)]";

export function DamageTypeBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn(
      "text-xs px-2 py-0.5 rounded font-medium",
      DAMAGE_TYPE_STYLES[label] ?? DAMAGE_TYPE_DEFAULT,
      className,
    )}>
      {label}
    </span>
  );
}
